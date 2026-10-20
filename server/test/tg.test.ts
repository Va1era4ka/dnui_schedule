import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { tg } from "../src/tg";

const HOST = "https://dnui-schedule.hsryata.com";
// как в vitest.config.ts
const TOKEN = "123456:TEST-token";
const SECRET = "test-secret";

const hook = (update: unknown, secret: string | null = SECRET) =>
  exports.default.fetch(
    new Request(HOST + "/tg/hook", {
      method: "POST",
      headers: secret === null ? {} : { "x-telegram-bot-api-secret-token": secret },
      body: JSON.stringify(update),
    }),
  );
const message = (chat: number, fields: Record<string, unknown>, type = "private") => ({
  update_id: 1,
  message: { message_id: 1, date: 0, chat: { id: chat, type }, from: { id: chat, is_bot: false, first_name: "А" }, ...fields },
});
const blocked = (chat: number, status: string) => ({
  update_id: 2,
  my_chat_member: { chat: { id: chat, type: "private" }, new_chat_member: { status, user: { id: 1 } } },
});

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

/**
 * initData, как его подписывает Telegram: строка проверки собрана руками по алфавиту ключей,
 * а поля в самом initData идут в другом порядке - сортировку в Worker тест не повторяет.
 */
async function initData(o: { id?: number; authDate?: number; token?: string; spoil?: boolean } = {}) {
  const user = JSON.stringify({ id: o.id ?? 111, first_name: "А", allows_write_to_pm: true });
  const authDate = String(o.authDate ?? Math.floor(Date.now() / 1000));
  const check = `auth_date=${authDate}\nquery_id=Q1\nuser=${user}`;
  const hmac = { name: "HMAC", hash: "SHA-256" };
  const enc = new TextEncoder();
  const seed = await crypto.subtle.importKey("raw", enc.encode("WebAppData"), hmac, false, ["sign"]);
  const secret = await crypto.subtle.sign("HMAC", seed, enc.encode(o.token ?? TOKEN));
  const key = await crypto.subtle.importKey("raw", secret, hmac, false, ["sign"]);
  const hash = hex(await crypto.subtle.sign("HMAC", key, enc.encode(check)));
  // испорченный: подпись от одного человека, id - другого
  const sent = o.spoil ? user.replace(`"id":${o.id ?? 111}`, '"id":999') : user;
  return new URLSearchParams({ user: sent, hash, query_id: "Q1", auth_date: authDate }).toString();
}

async function me(method = "GET", body?: unknown, auth: string | null | Promise<string> = initData(), host = HOST) {
  const a = await auth;
  return exports.default.fetch(
    new Request(host + "/tg/api/me", {
      method,
      headers: a === null ? {} : { authorization: "tma " + a },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

const user = (chat: number) =>
  env.DB.prepare("SELECT group_code, can_write, onboarded_at FROM tg_users WHERE chat_id = ?").bind(chat).first<{
    group_code: string | null;
    can_write: number;
    onboarded_at: string | null;
  }>();

// Запросы Worker в api.telegram.org: что отправил и что Telegram ответит
let sent: { method: string; params: any }[];
let telegram: { ok: boolean; error_code?: number; description?: string };

beforeEach(async () => {
  sent = [];
  telegram = { ok: true };
  const real = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const m = url.match(/^https:\/\/api\.telegram\.org\/bot([^/]+)\/(\w+)$/);
    if (!m) return real(input, init);
    expect(m[1]).toBe(TOKEN);
    sent.push({ method: m[2], params: JSON.parse(String(init?.body)) });
    return Response.json(telegram, { status: telegram.ok ? 200 : (telegram.error_code ?? 500) });
  });
  await env.DB.batch([
    env.DB.prepare("DELETE FROM tg_users"),
    env.DB.prepare(
      "INSERT OR IGNORE INTO groups (code, title, week1_monday, slots_json, lessons_json) VALUES ('tg1234', 'Класс TG', '2026-08-31', '[]', '[]')",
    ),
  ]);
});
afterEach(() => vi.restoreAllMocks());

it("вебхук без секрета или с чужим - 401, в базе ничего", async () => {
  expect((await hook(message(111, { text: "/start" }), null)).status).toBe(401);
  expect((await hook(message(111, { text: "/start" }), "wrong")).status).toBe(401);
  expect(await user(111)).toBeNull();
});

it("/start: ответ с кнопкой Mini App прямо в ответе на вебхук, писать человеку можно", async () => {
  const r = await hook(message(111, { text: "/start" }));
  expect(r.status).toBe(200);
  const reply: any = await r.json();
  expect(reply).toMatchObject({ method: "sendMessage", chat_id: 111 });
  expect(reply.text).toContain("выберите свою группу");
  expect(reply.reply_markup.inline_keyboard[0][0].web_app.url).toBe(HOST + "/tg/");
  expect(await user(111)).toMatchObject({ group_code: null, can_write: 1 });
  expect(sent).toEqual([]);
});

it("/start с кодом группы подключает её, с чужим кодом - нет", async () => {
  const r: any = await (await hook(message(111, { text: "/start TG1234" }))).json();
  expect(r.text).toContain("«Класс TG» подключена");
  expect((await user(111))?.group_code).toBe("tg1234");

  const bad: any = await (await hook(message(111, { text: "/start nope99" }))).json();
  expect(bad.text).toContain("«nope99» нет");
  expect((await user(111))?.group_code).toBe("tg1234");
  const again: any = await (await hook(message(111, { text: "/start" }))).json();
  expect(again.text).toContain("Ваша группа — «Класс TG»");
});

it("заблокировал бота - писать нельзя, разблокировал или разрешил из Mini App - можно", async () => {
  expect((await hook(blocked(111, "kicked"))).status).toBe(204);
  expect((await user(111))?.can_write).toBe(0);
  await hook(blocked(111, "member"));
  expect((await user(111))?.can_write).toBe(1);

  await hook(blocked(222, "kicked"));
  const r = await hook(message(222, { write_access_allowed: { from_request: true } }));
  expect(r.status).toBe(204);
  expect((await user(222))?.can_write).toBe(1);
});

it("в личке на любой текст - подсказка с кнопкой, сообщения из групп не трогаем", async () => {
  const r: any = await (await hook(message(111, { text: "привет" }))).json();
  expect(r.text).toContain("по кнопке");
  expect((await hook(message(-100, { text: "/start" }, "group"))).status).toBe(204);
  expect(await user(-100)).toBeNull();
});

it("без токена и секрета бот выключен", async () => {
  const req = new Request(HOST + "/tg/hook", { method: "POST", body: "{}" });
  expect((await tg(req, { ...env, TG_WEBHOOK_SECRET: "" }, "/tg/hook")).status).toBe(404);
  expect((await tg(req, { ...env, TG_BOT_TOKEN: "" }, "/tg/api/me")).status).toBe(404);
});

it("настройки без initData, с чужой подписью, подменённым id или протухшие - 401", async () => {
  expect((await me("GET", undefined, null)).status).toBe(401);
  expect((await me("GET", undefined, "user=%7B%22id%22%3A1%7D&hash=00")).status).toBe(401);
  expect((await me("GET", undefined, initData({ token: "999:other" }))).status).toBe(401);
  expect((await me("GET", undefined, initData({ spoil: true }))).status).toBe(401);
  const twoDays = Math.floor(Date.now() / 1000) - 2 * 86_400;
  expect((await me("GET", undefined, initData({ authDate: twoDays }))).status).toBe(401);
  expect(await user(111)).toBeNull();
});

it("первый вход - по умолчанию только сводка в 20:00", async () => {
  const r = await me();
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({
    group: null,
    digest_on: true,
    digest_at: "20:00",
    next_up_on: false,
    lead_min: 5,
    can_write: false,
    onboarded: false,
  });
});

it("PUT меняет только присланное и проверяет поля", async () => {
  const r: any = await (await me("PUT", { digest_at: "21:30", next_up_on: true, lead_min: 10 })).json();
  expect(r).toMatchObject({ digest_on: true, digest_at: "21:30", next_up_on: true, lead_min: 10 });

  const err = async (b: unknown) => {
    const res = await me("PUT", b);
    expect(res.status).toBe(400);
    return ((await res.json()) as { message: string }).message;
  };
  expect(await err({ group: "nope99" })).toBe("Группы с таким кодом нет");
  expect(await err({ onboarded: true })).toBe("Сначала выберите группу");
  await err({ digest_at: "24:00" });
  await err({ digest_on: "yes" });
  await err({ lead_min: 0 });
  await err({ onboarded: false });
  expect((await (await me()).json()) as object).toMatchObject({ digest_at: "21:30", lead_min: 10, onboarded: false });
});

it("онбординг: подтверждение в чат один раз, по ответу Telegram видно, можно ли писать", async () => {
  const r: any = await (await me("PUT", { group: "TG1234", next_up_on: true, onboarded: true })).json();
  expect(r).toMatchObject({ group: "tg1234", onboarded: true, can_write: true });
  expect(sent).toHaveLength(1);
  expect(sent[0].method).toBe("sendMessage");
  expect(sent[0].params.chat_id).toBe(111);
  expect(sent[0].params.text).toBe(
    "Готово, группа «Класс TG» подключена.\n" +
      "Сводка на завтра — каждый вечер в 20:00, если завтра есть пары.\n" +
      "О следующей паре — за 5 мин до конца текущей и за 20 мин до первой.\n" +
      "Поменять можно в настройках расписания.",
  );
  await me("PUT", { onboarded: true, digest_at: "19:00" });
  expect(sent).toHaveLength(1);

  // бот заблокирован или писать не разрешили
  telegram = { ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" };
  const blockedUser: any = await (await me("PUT", { group: "tg1234", onboarded: true }, initData({ id: 222 }))).json();
  expect(blockedUser).toMatchObject({ onboarded: true, can_write: false });
  expect(sent[1].params.chat_id).toBe(222);
});

it("группу удалили - у подписчика она пропадает", async () => {
  await me("PUT", { group: "tg1234" });
  await env.DB.prepare("DELETE FROM groups WHERE code = 'tg1234'").run();
  expect(((await (await me()).json()) as { group: unknown }).group).toBeNull();
});

it("вход из .dev.vars - только на localhost", async () => {
  expect((await me("GET", undefined, null, "http://localhost:8787")).status).toBe(200);
  expect(await user(777)).not.toBeNull();
  expect((await me("GET", undefined, null)).status).toBe(401);
});

it("Mini App: статика со своей CSP - её открывают во фрейме web.telegram.org", async () => {
  // в CI фронт не собран и страницы нет, но заголовки ставит сам Worker
  const r = await exports.default.fetch(new Request(HOST + "/tg/settings"));
  const csp = r.headers.get("content-security-policy") ?? "";
  expect(csp).toContain("frame-ancestors https://web.telegram.org");
  expect(csp).toContain("script-src 'self' https://telegram.org");
  expect((await exports.default.fetch(new Request(HOST + "/tg/api/nope"))).status).toBe(404);
  expect((await exports.default.fetch(new Request(HOST + "/tg/", { method: "POST" }))).status).toBe(404);
});
