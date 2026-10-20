import { createScheduledController, env } from "cloudflare:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fixture from "../../fixtures/schedule.1.json";
import worker from "../src/index";
import { localMinute, notify } from "../src/notify";

/** Момент по часам группы - Китай, UTC+8. */
const at = (local: string) => Date.parse(local + ":00+08:00");

// Что Worker отправил в Telegram и что Telegram ответит каждому чату
let sent: { chat_id: number; text: string; parse_mode: string }[];
let reply: (chat: number) => { ok: boolean; error_code?: number; description?: string };

const subscribe = (chat: number, fields: Record<string, unknown> = {}) => {
  const row = { chat_id: chat, group_code: "nt1234", can_write: 1, onboarded_at: "2026-10-01 00:00:00", ...fields };
  const cols = Object.keys(row);
  return env.DB.prepare(`INSERT INTO tg_users (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`)
    .bind(...Object.values(row))
    .run();
};
const user = (chat: number) =>
  env.DB.prepare("SELECT sent_until, can_write FROM tg_users WHERE chat_id = ?").bind(chat).first<{ sent_until: string | null; can_write: number }>();

beforeEach(async () => {
  sent = [];
  reply = () => ({ ok: true });
  const real = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.startsWith("https://api.telegram.org/")) return real(input, init);
    const params = JSON.parse(String(init?.body));
    sent.push(params);
    const r = reply(params.chat_id);
    return Response.json(r, { status: r.ok ? 200 : (r.error_code ?? 500) });
  });
  await env.DB.batch([
    env.DB.prepare("DELETE FROM tg_users"),
    env.DB.prepare("DELETE FROM groups WHERE code = 'nt1234'"),
    env.DB.prepare(
      "INSERT INTO groups (code, title, week1_monday, slots_json, lessons_json) VALUES ('nt1234', 'Класс', '2026-08-31', ?, ?)",
    ).bind(JSON.stringify(fixture.slots), JSON.stringify(fixture.lessons)),
    // китайский в пн 19-го: домашка видна на следующем китайском - во вт 20-го
    env.DB.prepare(
      "INSERT INTO homework (group_code, lesson_id, date, text, until) VALUES ('nt1234', '1-2-汉语1-1', '2026-10-19', 'Упр. 3 <стр. 42>', NULL)",
    ),
  ]);
});
afterEach(() => vi.restoreAllMocks());

it("часы группы - Китай: полдень UTC там уже 20:00, а 16:30 - следующий день", () => {
  expect(localMinute(Date.parse("2026-10-19T12:00:00Z"), "Asia/Shanghai")).toBe("2026-10-19T20:00");
  expect(localMinute(Date.parse("2026-10-19T16:30:59Z"), "Asia/Shanghai")).toBe("2026-10-20T00:30");
});

it("в 20:00 - сводка на завтра с домашкой, повторный запуск в ту же минуту ничего не повторяет", async () => {
  await subscribe(1); // по умолчанию: только сводка в 20:00
  await subscribe(2, { onboarded_at: null }); // онбординг не прошёл - не пишем
  await subscribe(3, { can_write: 0 }); // писать не разрешал
  await notify(env, at("2026-10-19T20:00"));
  expect(sent).toEqual([
    {
      chat_id: 1,
      parse_mode: "HTML",
      text:
        "<b>Завтра · вт, 20 октября</b>\n" +
        "08:00 Разговорный китайский 1 — A6-413\n" +
        "10:00 Китайский язык 1 — A6-413\n" +
        "Домашка: Упр. 3 &lt;стр. 42&gt;",
    },
  ]);
  expect((await user(1))?.sent_until).toBe("2026-10-19T20:00");
  await notify(env, at("2026-10-19T20:00"));
  await notify(env, at("2026-10-19T20:01"));
  expect(sent).toHaveLength(1);
});

it("о следующей паре - за N минут до конца текущей, и за 20 минут до первой", async () => {
  await subscribe(1, { digest_on: 0, next_up_on: 1, lead_min: 10 });
  await notify(env, at("2026-10-19T07:40"));
  await notify(env, at("2026-10-19T09:30"));
  await notify(env, at("2026-10-19T16:50"));
  expect(sent.map((s) => s.text)).toEqual([
    "<b>Через 20 минут пара</b>\n08:00 Разговорный китайский 1 — A6-413",
    "<b>Следующая пара</b>\n10:00 Китайский язык 1 — A6-413",
    "<b>Последняя пара</b>\nТеорвер и матстатистика II скоро закончится, дальше пар нет",
  ]);
});

it("пропущенный запуск догоняется, а старше 10 минут - уже нет", async () => {
  await subscribe(1, { digest_on: 0, next_up_on: 1, sent_until: "2026-10-19T09:20" });
  await subscribe(2, { digest_on: 0, next_up_on: 1, sent_until: "2026-10-19T09:20" });
  await notify(env, at("2026-10-19T09:38")); // 09:35 пропустили - догоняем
  expect(sent.map((s) => s.chat_id).sort()).toEqual([1, 2]);
  sent = [];
  await env.DB.prepare("UPDATE tg_users SET sent_until = '2026-10-19T09:20' WHERE chat_id = 2").run();
  await notify(env, at("2026-10-19T09:50")); // 09:35 - уже 15 минут назад
  expect(sent).toEqual([]);
});

it("заблокировал бота - перестаём писать; Telegram просит притормозить - остальным в следующую минуту", async () => {
  // кто дольше ждёт - первым: порядок 1, 2, 3
  await subscribe(1, { sent_until: "2026-10-19T19:00" });
  await subscribe(2, { sent_until: "2026-10-19T19:01" });
  await subscribe(3, { sent_until: "2026-10-19T19:02" });
  reply = (chat) =>
    chat === 1
      ? { ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" }
      : chat === 2
        ? { ok: false, error_code: 429, description: "Too Many Requests: retry after 5" }
        : { ok: true };
  await notify(env, at("2026-10-19T20:00"));
  expect(sent.map((s) => s.chat_id)).toEqual([1, 2]); // после 429 - стоп
  expect(await user(1)).toMatchObject({ can_write: 0, sent_until: "2026-10-19T19:00" });
  expect(await user(2)).toMatchObject({ can_write: 1, sent_until: "2026-10-19T19:01" });

  sent = [];
  reply = () => ({ ok: true });
  await notify(env, at("2026-10-19T20:01"));
  expect(sent.map((s) => s.chat_id).sort()).toEqual([2, 3]);
});

it("больше 45 сообщений за минуту - остальные уходят в следующую", async () => {
  await env.DB.batch(
    Array.from({ length: 50 }, (_, i) =>
      env.DB.prepare("INSERT INTO tg_users (chat_id, group_code, can_write, onboarded_at) VALUES (?, 'nt1234', 1, '2026-10-01')").bind(
        100 + i,
      ),
    ),
  );
  await notify(env, at("2026-10-19T20:00"));
  expect(sent).toHaveLength(45);
  await notify(env, at("2026-10-19T20:01"));
  expect(sent).toHaveLength(50);
  expect(new Set(sent.map((s) => s.chat_id)).size).toBe(50);
  await notify(env, at("2026-10-19T20:02"));
  expect(sent).toHaveLength(50);
});

it("cron Worker'а запускает рассылку; без токена бота - тишина", async () => {
  await subscribe(1);
  await worker.scheduled(createScheduledController({ scheduledTime: at("2026-10-19T20:00"), cron: "* * * * *" }), env);
  expect(sent).toHaveLength(1);
  await env.DB.prepare("UPDATE tg_users SET sent_until = NULL").run();
  await notify({ ...env, TG_BOT_TOKEN: "" }, at("2026-10-19T20:00"));
  expect(sent).toHaveLength(1);
});
