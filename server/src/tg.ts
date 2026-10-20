/**
 * Бот @dnui_schedule_bot и его Mini App (server/tg, собирается в public/tg). Бот сам почти ничего
 * не умеет: на /start - кнопка, открывающая расписание. Mini App читает пары из публичного
 * /v1/groups/{code}, а здесь - только настройки человека: группа и уведомления (/tg/api/me).
 * Токен и секрет вебхука - `wrangler secret put` (server/README.md), пока их нет - /tg/* нет.
 */
import { SOON_MIN } from "../shared/events";
import { Bad, bad, body, json, page } from "./http";

/** Секреты бота - не в wrangler.toml, поэтому не в сгенерированном Env. */
interface Secrets {
  TG_BOT_TOKEN?: string;
  TG_WEBHOOK_SECRET?: string;
  DEV_TG_USER?: string;
}
type Bot = Env & Secrets & { TG_BOT_TOKEN: string; TG_WEBHOOK_SECRET: string };

/** initData выдаётся при открытии Mini App; старше суток - пусть откроют заново. */
const MAX_AGE = 86_400;
const CODE = /^[a-z0-9]{1,32}$/;

export async function tg(req: Request, env: Env & Secrets, path: string): Promise<Response> {
  if (!env.TG_BOT_TOKEN || !env.TG_WEBHOOK_SECRET) return json({ error: "not_found" }, 404);
  const bot = env as Bot;
  const origin = new URL(req.url).origin;
  try {
    if (path === "/tg/hook") return await hook(req, bot, origin);
    if (path === "/tg/api/me") return await me(req, bot, origin);
  } catch (e) {
    if (e instanceof Bad) return json({ error: "bad_request", message: e.message }, 400);
    throw e;
  }
  if (path.startsWith("/tg/api/") || req.method !== "GET") return json({ error: "not_found" }, 404);
  const r = await page(req, env, "/tg/");
  // Mini App открывается внутри Telegram: в телефоне - встроенным браузером, в веб-версии - во фрейме
  // web.telegram.org. Скрипт - только свой и SDK Telegram; style - для цветов предметов и полосы хода.
  r.headers.set(
    "content-security-policy",
    "default-src 'self'; script-src 'self' https://telegram.org; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors https://web.telegram.org",
  );
  return r;
}

// ---- Вебхук: Telegram присылает сюда всё, что пишут боту (setWebhook в scripts/tg-setup.mjs)

interface Chat {
  id: number;
  type: string;
}
interface Update {
  message?: { chat: Chat; text?: string; write_access_allowed?: object };
  my_chat_member?: { chat: Chat; new_chat_member: { status: string } };
}

async function hook(req: Request, env: Bot, origin: string): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  // секрет из setWebhook Telegram кладёт в каждый запрос - без него это не Telegram
  const enc = new TextEncoder();
  const got = enc.encode(req.headers.get("x-telegram-bot-api-secret-token") ?? "");
  const want = enc.encode(env.TG_WEBHOOK_SECRET);
  if (got.byteLength !== want.byteLength || !crypto.subtle.timingSafeEqual(got, want)) {
    return json({ error: "unauthorized" }, 401);
  }
  const reply = await update((await body(req)) as Update, env, origin);
  // ответ на вебхук сам становится вызовом Bot API - отдельный запрос в Telegram не нужен
  return reply ? json(reply) : new Response(null, { status: 204 });
}

async function update(u: Update, env: Bot, origin: string) {
  const m = u.message;
  // группы и каналы пока не наши - отвечаем только в личке
  if (m?.chat.type === "private") {
    // написал боту - значит, ему можно писать
    await canWrite(env, m.chat.id, true);
    // разрешил писать из Mini App - отвечать нечего
    if (m.write_access_allowed) return null;
    const start = m.text?.match(/^\/start(?:\s+(\S+))?/);
    const text = start ? await greet(env, m.chat.id, start[1]) : "Расписание, домашка и уведомления — по кнопке ниже.";
    return { method: "sendMessage", chat_id: m.chat.id, text, reply_markup: openButton(origin) };
  }
  const cm = u.my_chat_member;
  // kicked - бота заблокировали, member - разблокировали
  if (cm?.chat.type === "private") await canWrite(env, cm.chat.id, cm.new_chat_member.status === "member");
  return null;
}

/** /start и /start {код группы} - так открываются ссылки t.me/dnui_schedule_bot?start=код. */
async function greet(env: Bot, chat: number, arg?: string): Promise<string> {
  if (arg) {
    const code = arg.toLowerCase();
    const g = CODE.test(code)
      ? await env.DB.prepare("SELECT title FROM groups WHERE code = ?").bind(code).first<{ title: string }>()
      : null;
    if (!g) return `Группы с кодом «${arg.slice(0, 64)}» нет. Откройте расписание и выберите группу из списка или введите код.`;
    await env.DB.prepare("UPDATE tg_users SET group_code = ? WHERE chat_id = ?").bind(code, chat).run();
    return `Группа «${g.title}» подключена. Откройте расписание — там же настраиваются уведомления.`;
  }
  const r = await env.DB.prepare("SELECT g.title FROM tg_users u JOIN groups g ON g.code = u.group_code WHERE u.chat_id = ?")
    .bind(chat)
    .first<{ title: string }>();
  return r
    ? `Ваша группа — «${r.title}». Расписание, домашка и уведомления — по кнопке ниже.`
    : "Здесь расписание пар группы: переносы, домашка и уведомления. Откройте его и выберите свою группу.";
}

const canWrite = (env: Bot, chat: number, on: boolean) =>
  env.DB.prepare(
    "INSERT INTO tg_users (chat_id, can_write) VALUES (?, ?) ON CONFLICT (chat_id) DO UPDATE SET can_write = excluded.can_write",
  )
    .bind(chat, on ? 1 : 0)
    .run();

const openButton = (origin: string) => ({
  inline_keyboard: [[{ text: "Открыть расписание", web_app: { url: origin + "/tg/" } }]],
});

/** Вызов Bot API. Ответ Telegram как есть: ok: false и error_code 403 - писать этому человеку нельзя. */
export async function botApi(env: Env & { TG_BOT_TOKEN?: string }, method: string, params: object) {
  const r = await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  return r.json<{ ok: boolean; error_code?: number; description?: string }>().catch(() => ({
    ok: false,
    error_code: r.status,
    description: `HTTP ${r.status}`,
  }));
}

// ---- Настройки человека для Mini App

/**
 * Кто открыл Mini App: id пользователя из initData, который Telegram подписывает токеном бота.
 * Mini App шлёт его заголовком `Authorization: tma <initData>`. null - не пустить.
 */
async function tgUser(req: Request, env: Bot): Promise<number | null> {
  // Локальный `wrangler dev` без Telegram: id из .dev.vars (DEV_TG_USER=123). Только для localhost,
  // как DEV_USER у админки: на боевом домене переменная ничего не откроет.
  const host = new URL(req.url).hostname;
  if (env.DEV_TG_USER && (host === "localhost" || host === "127.0.0.1")) return Number(env.DEV_TG_USER) || null;

  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("tma ")) return null;
  const p = new URLSearchParams(auth.slice(4));
  const hash = p.get("hash") ?? "";
  if (!/^[0-9a-f]{64}$/.test(hash)) return null;
  p.delete("hash");
  // подписаны все поля, кроме hash: key=value по алфавиту ключей через перевод строки
  const check = [...p]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const enc = new TextEncoder();
  const hmac = { name: "HMAC", hash: "SHA-256" };
  const seed = await crypto.subtle.importKey("raw", enc.encode("WebAppData"), hmac, false, ["sign"]);
  const secret = await crypto.subtle.sign("HMAC", seed, enc.encode(env.TG_BOT_TOKEN));
  const key = await crypto.subtle.importKey("raw", secret, hmac, false, ["verify"]);
  const sig = Uint8Array.from(hash.match(/../g)!, (h) => parseInt(h, 16));
  if (!(await crypto.subtle.verify("HMAC", key, sig, enc.encode(check)))) return null;
  if (!(Date.now() / 1000 - Number(p.get("auth_date")) < MAX_AGE)) return null;
  try {
    const id = JSON.parse(p.get("user") ?? "").id;
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

interface Row {
  group_code: string | null;
  title: string | null;
  digest_on: number;
  digest_at: string;
  next_up_on: number;
  lead_min: number;
  can_write: number;
  onboarded_at: string | null;
}

const row = (env: Bot, id: number) =>
  env.DB.prepare("SELECT u.*, g.title FROM tg_users u LEFT JOIN groups g ON g.code = u.group_code WHERE u.chat_id = ?")
    .bind(id)
    .first<Row>() as Promise<Row>;

/** GET - настройки, PUT - поменять любые из них; ответ на оба - настройки целиком. */
async function me(req: Request, env: Bot, origin: string): Promise<Response> {
  const id = await tgUser(req, env);
  if (!id) return json({ error: "unauthorized" }, 401);
  await env.DB.prepare("INSERT OR IGNORE INTO tg_users (chat_id) VALUES (?)").bind(id).run();
  if (req.method === "PUT") await save(req, env, id, origin);
  else if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  const r = await row(env, id);
  return json({
    group: r.group_code,
    digest_on: !!r.digest_on,
    digest_at: r.digest_at,
    next_up_on: !!r.next_up_on,
    lead_min: r.lead_min,
    can_write: !!r.can_write,
    onboarded: r.onboarded_at !== null,
  });
}

async function save(req: Request, env: Bot, id: number, origin: string) {
  const b = await body(req);
  const before = await row(env, id);
  const sets: string[] = [];
  const args: unknown[] = [];
  const set = (col: string, v: unknown) => {
    sets.push(`${col} = ?`);
    args.push(v);
  };
  let group = before.group_code;
  if (b.group !== undefined) {
    const code = typeof b.group === "string" ? b.group.trim().toLowerCase() : "";
    const ok = CODE.test(code) && (await env.DB.prepare("SELECT 1 FROM groups WHERE code = ?").bind(code).first());
    if (!ok) bad("Группы с таким кодом нет");
    group = code;
    set("group_code", code);
  }
  for (const k of ["digest_on", "next_up_on"]) {
    if (b[k] === undefined) continue;
    if (typeof b[k] !== "boolean") bad(`${k}: true или false`);
    set(k, b[k] ? 1 : 0);
  }
  if (b.digest_at !== undefined) {
    if (typeof b.digest_at !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.digest_at)) bad("digest_at: время ЧЧ:ММ");
    set("digest_at", b.digest_at);
  }
  if (b.lead_min !== undefined) {
    const n = b.lead_min as number;
    if (!Number.isInteger(n) || n < 1 || n > 30) bad("lead_min: минуты от 1 до 30");
    set("lead_min", n);
  }
  if (b.onboarded !== undefined) {
    if (b.onboarded !== true) bad("onboarded: только true");
    if (!group) bad("Сначала выберите группу");
    sets.push("onboarded_at = COALESCE(onboarded_at, datetime('now'))");
  }
  if (sets.length) await env.DB.prepare(`UPDATE tg_users SET ${sets.join(", ")} WHERE chat_id = ?`).bind(...args, id).run();
  if (b.onboarded && !before.onboarded_at) await confirm(env, id, origin);
}

/**
 * Онбординг пройден - подтверждение в чат. Заодно по ответу Telegram видно, можно ли писать:
 * разрешение из Mini App доходит до вебхука позже, чем этот запрос.
 */
async function confirm(env: Bot, id: number, origin: string) {
  const r = await row(env, id);
  const lines = [`Готово, группа «${r.title}» подключена.`];
  if (r.digest_on) lines.push(`Сводка на завтра — каждый вечер в ${r.digest_at}, если завтра есть пары.`);
  if (r.next_up_on) lines.push(`О следующей паре — за ${r.lead_min} мин до конца текущей и за ${SOON_MIN} мин до первой.`);
  if (!r.digest_on && !r.next_up_on) lines.push("Уведомления выключены.");
  lines.push("Поменять можно в настройках расписания.");
  try {
    const res = await botApi(env, "sendMessage", { chat_id: id, text: lines.join("\n"), reply_markup: openButton(origin) });
    // 403 - заблокировал бота или не разрешил ему писать
    if (res.ok || res.error_code === 403) {
      await env.DB.prepare("UPDATE tg_users SET can_write = ? WHERE chat_id = ?").bind(res.ok ? 1 : 0, id).run();
    } else console.warn("tg sendMessage:", res.description);
  } catch (e) {
    console.warn("tg sendMessage:", (e as Error).message);
  }
}
