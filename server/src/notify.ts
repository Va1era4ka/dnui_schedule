/**
 * Рассылка бота: cron раз в минуту ([triggers] в wrangler.toml) - кому что пора прислать.
 * Правила - те же, что у будильников приложения (shared/events.ts), время - по часам группы (SCHEDULE_TZ).
 *
 * У каждого окно от его sent_until до этой минуты, но не глубже CATCH_UP минут: пропущенный запуск
 * догоняется, а «следующая пара» часовой давности уже никому не нужна. sent_until двигается, только
 * когда сообщение ушло: повторный запуск ничего не повторит, а не ушедшее уйдёт в следующую минуту.
 */
import { addMinutes, type Event, eventsBetween, SOON_MIN } from "../shared/events";
import { homeworkFor, lessonsOn } from "../shared/schedule";
import { dayLabel } from "../shared/text";
import type { GroupData, Homework, Lesson } from "../shared/types";
import { addHomework, homeworkOf, IN, loadGroups } from "./groups";
import { botApi } from "./tg";

/** Насколько глубоко, в минутах, догоняем пропущенное. */
const CATCH_UP = 10;
/**
 * Сообщений за запуск. На бесплатном тарифе у Worker 50 внешних запросов на вызов, а каждое сообщение -
 * запрос в Telegram. Кому не хватило - получит в следующую минуту, окно его дождётся. Упрёмся - Queues.
 */
const MAX_SENDS = 45;
/** Домашку в сообщении обрезаем: целиком она в Mini App, а у Telegram предел - 4096 символов. */
const HOMEWORK_MAX = 300;

interface Subscriber {
  chat_id: number;
  group_code: string;
  digest_on: number;
  digest_at: string;
  next_up_on: number;
  lead_min: number;
  sent_until: string | null;
}

/** Момент [ms] по часам [tz]: "2026-10-19T20:00". */
export function localMinute(ms: number, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(ms);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export async function notify(env: Env & { TG_BOT_TOKEN?: string }, at: number): Promise<void> {
  if (!env.TG_BOT_TOKEN) return;
  const db = env.DB;
  const now = localMinute(at, env.SCHEDULE_TZ);
  const floor = addMinutes(now, -CATCH_UP);
  // дольше всех ждёт - первым: когда сообщений больше лимита, никто не застрянет навсегда
  const { results: users } = await db
    .prepare(
      `SELECT chat_id, group_code, digest_on, digest_at, next_up_on, lead_min, sent_until FROM tg_users
       WHERE group_code IS NOT NULL AND onboarded_at IS NOT NULL AND can_write = 1 AND (digest_on = 1 OR next_up_on = 1)
       ORDER BY sent_until`,
    )
    .all<Subscriber>();
  if (!users.length) return;

  const groups = await loadGroups(db, [...new Set(users.map((u) => u.group_code))], false);
  const due = users.flatMap((u) => {
    const g = groups.get(u.group_code);
    if (!g) return [];
    const from = u.sent_until && u.sent_until > floor ? u.sent_until : floor;
    const prefs = { digestOn: !!u.digest_on, digestAt: u.digest_at, nextUpOn: !!u.next_up_on, leadMin: u.lead_min };
    const events = eventsBetween(g, from, now, prefs);
    return events.length ? [{ u, g, events }] : [];
  });
  if (!due.length) return;
  // домашка нужна только в тексте - читаем её, когда есть что прислать, а не каждую минуту
  const { results: homework } = await homeworkOf(db, [...new Set(due.map((d) => d.u.group_code))]).all();
  addHomework(groups, homework as unknown as (Homework & { group_code: string })[]);

  // у всей группы сводка одна и та же - собираем её один раз
  const texts = new Map<string, string>();
  const text = (g: GroupData, e: Event) => {
    const k = `${g.code} ${e.kind} ${e.date} ${e.kind === "nextUp" ? e.current.id : e.kind === "soon" ? e.lesson.id : ""}`;
    if (!texts.has(k)) texts.set(k, block(g, e));
    return texts.get(k)!;
  };
  const sent: number[] = [];
  const blocked: number[] = [];
  for (const { u, g, events } of due.slice(0, MAX_SENDS)) {
    let res;
    try {
      // несколько событий в одну минуту - одним сообщением: ушло или нет, но целиком
      const body = events.map((e) => text(g, e)).join("\n\n");
      res = await botApi(env, "sendMessage", { chat_id: u.chat_id, text: body, parse_mode: "HTML" });
    } catch (e) {
      console.warn("tg cron:", (e as Error).message);
      break;
    }
    if (res.ok) sent.push(u.chat_id);
    // заблокировал бота или удалил аккаунт - не пишем, пока сам не вернётся в бота
    else if (res.error_code === 403 || /chat not found/i.test(res.description ?? "")) blocked.push(u.chat_id);
    // Telegram просит притормозить - остальные получат в следующую минуту
    else if (res.error_code === 429) break;
    else console.warn("tg cron:", u.chat_id, res.description);
  }
  const writes = [];
  if (sent.length) writes.push(db.prepare(`UPDATE tg_users SET sent_until = ? WHERE chat_id ${IN}`).bind(now, JSON.stringify(sent)));
  if (blocked.length) writes.push(db.prepare(`UPDATE tg_users SET can_write = 0 WHERE chat_id ${IN}`).bind(JSON.stringify(blocked)));
  if (writes.length) await db.batch(writes);
}

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

/** «08:00 Китайский язык 1 — A6-413», ниже - домашка к ней. Как строка уведомления в приложении. */
function line(g: GroupData, l: Lesson, date: string): string {
  const hw = homeworkFor(g, l, date)?.text;
  const short = hw && hw.length > HOMEWORK_MAX ? hw.slice(0, HOMEWORK_MAX - 1) + "…" : hw;
  return (
    `${l.start} ${esc(l.name_ru)}${l.optional ? " (необязательная)" : ""} — ${esc(l.room_ru)}` +
    (short ? `\nДомашка: ${esc(short)}` : "")
  );
}

/** Заголовок и текст - как Notifier.title и text в приложении, только без заметок: они живут в телефоне. */
function block(g: GroupData, e: Event): string {
  switch (e.kind) {
    case "digest":
      // сообщения остаются в чате - «Завтра» без даты через неделю ничего не скажет
      return [`<b>Завтра · ${dayLabel(e.date)}</b>`, ...lessonsOn(g, e.date).map((l) => line(g, l, e.date))].join("\n");
    case "nextUp":
      return e.next
        ? `<b>Следующая пара</b>\n${line(g, e.next, e.date)}`
        : `<b>Последняя пара</b>\n${esc(e.current.name_ru)} скоро закончится, дальше пар нет`;
    case "soon":
      return `<b>Через ${SOON_MIN} минут пара</b>\n${line(g, e.lesson, e.date)}`;
  }
}
