/**
 * Запись: /v1/admin/*, только через Cloudflare Access. Контракт - docs/api.md.
 * Любая правка группы, её переносов, правок на дату или домашки поднимает rev - приложения подтянут её
 * при следующем открытии.
 */
import { accessUser } from "./auth";
import { json } from "./http";

class Bad extends Error {}
const bad = (msg: string): never => {
  throw new Bad(msg);
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;
const CODE_ABC = "abcdefghijkmnpqrstuvwxyz23456789"; // без 0/o и 1/l, как в seed

function date(v: unknown, name: string): string {
  if (typeof v !== "string" || !DATE.test(v) || Number.isNaN(Date.parse(v))) bad(`${name}: нужна дата ГГГГ-ММ-ДД`);
  return v as string;
}
function str(v: unknown, name: string, max = 200, min = 1): string {
  if (typeof v !== "string" || v.trim().length < min || v.length > max) bad(`${name}: строка до ${max} символов`);
  return (v as string).trim();
}
function int(v: unknown, name: string, lo: number, hi: number): number {
  if (!Number.isInteger(v) || (v as number) < lo || (v as number) > hi) bad(`${name}: число от ${lo} до ${hi}`);
  return v as number;
}
function time(v: unknown, name: string): string {
  if (typeof v !== "string" || !TIME.test(v)) bad(`${name}: время ЧЧ:ММ`);
  return v as string;
}

/** Что пара из себя представляет в конкретный день - всё, кроме id, дня недели и недель. */
function lessonFields(l: Record<string, unknown>, at: string) {
  return {
    name: str(l.name, `${at}.name`),
    name_ru: str(l.name_ru, `${at}.name_ru`),
    slot: int(l.slot, `${at}.slot`, 1, 20),
    start: time(l.start, `${at}.start`),
    end: time(l.end, `${at}.end`),
    teacher: str(l.teacher, `${at}.teacher`, 200, 0),
    room: str(l.room, `${at}.room`, 200, 0),
    room_ru: str(l.room_ru, `${at}.room_ru`, 200, 0),
    building: str(l.building, `${at}.building`, 200, 0),
    building_ru: str(l.building_ru, `${at}.building_ru`, 200, 0),
  };
}

/** Пары в формате ассетов приложения. Лишние поля отбрасываем, в базу - только известные. */
function lessonsOf(v: unknown) {
  if (!Array.isArray(v) || v.length > 300) bad("lessons: массив до 300 пар");
  const ids = new Set<string>();
  return (v as Record<string, unknown>[]).map((l, i) => {
    const at = `lessons[${i}]`;
    const weeks = l?.weeks as unknown[];
    if (!Array.isArray(weeks) || weeks.length !== 2) bad(`${at}.weeks: [с какой, по какую]`);
    const from = int(weeks[0], `${at}.weeks`, 1, 30);
    const to = int(weeks[1], `${at}.weeks`, from, 30);
    const id = str(l.id, `${at}.id`);
    if (ids.has(id)) bad(`${at}.id: «${id}» повторяется`);
    ids.add(id);
    const { name, name_ru, slot, ...rest } = lessonFields(l, at);
    // порядок ключей - как в ассетах приложения
    return { id, name, name_ru, weeks: [from, to], day: int(l.day, `${at}.day`, 1, 7), slot, ...rest };
  });
}

function slotsOf(v: unknown) {
  if (!Array.isArray(v) || v.length > 20) bad("slots: массив до 20 пар в день");
  return (v as Record<string, unknown>[]).map((s, i) => ({
    n: int(s?.n, `slots[${i}].n`, 1, 20),
    start: time(s.start, `slots[${i}].start`),
    end: time(s.end, `slots[${i}].end`),
  }));
}

async function body(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > 1_000_000) bad("слишком большой запрос");
  let v: unknown;
  try {
    v = JSON.parse(text || "{}");
  } catch {
    bad("тело запроса - не JSON");
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) bad("тело запроса - JSON-объект");
  return v as Record<string, unknown>;
}

export async function admin(req: Request, env: Env, path: string): Promise<Response> {
  const user = await accessUser(req, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  // Access-кука уходит и с чужих сайтов: пишем только с нашего же домена (или без Origin - curl, CI)
  const origin = req.headers.get("origin");
  if (req.method !== "GET" && origin && origin !== new URL(req.url).origin) {
    return json({ error: "bad_origin" }, 403);
  }
  try {
    return await route(req, env, path, user);
  } catch (e) {
    if (e instanceof Bad) return json({ error: "bad_request", message: e.message }, 400);
    throw e;
  }
}

async function route(req: Request, env: Env, path: string, user: string): Promise<Response> {
  const db = env.DB;
  const m = req.method;
  const bump = (code: string) =>
    db.prepare(
      "UPDATE groups SET rev = rev + 1, updated_at = datetime('now'), updated_by = ? WHERE code = ? RETURNING rev",
    ).bind(user, code);
  // последний запрос батча - bump; батч в D1 - одна транзакция
  const run = async (code: string, ...stmts: D1PreparedStatement[]) => {
    const res = await db.batch([...stmts, bump(code)]);
    return json({ rev: (res.at(-1)!.results[0] as { rev: number }).rev });
  };

  if (path === "/v1/admin/me" && m === "GET") return json({ email: user });

  if (path === "/v1/admin/groups") {
    if (m === "GET") {
      const { results } = await db
        .prepare("SELECT code, title, listed, rev, updated_at, updated_by FROM groups ORDER BY title")
        .all();
      return json({ groups: results });
    }
    if (m === "POST") {
      const b = await body(req);
      const title = str(b.title, "title", 100);
      const week1 = date(b.week1_monday, "week1_monday");
      const slots = JSON.stringify(slotsOf(b.slots ?? []));
      const lessons = JSON.stringify(lessonsOf(b.lessons ?? []));
      for (let i = 0; i < 5; i++) {
        const code = Array.from(crypto.getRandomValues(new Uint8Array(6)), (x) => CODE_ABC[x % CODE_ABC.length]).join("");
        const r = await db
          .prepare(
            "INSERT OR IGNORE INTO groups (code, title, week1_monday, slots_json, lessons_json, listed, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
          )
          .bind(code, title, week1, slots, lessons, b.listed ? 1 : 0, user)
          .run();
        if (r.meta.changes) return json({ code, rev: 1 }, 201);
      }
      throw new Error("не удалось подобрать свободный код группы");
    }
  }

  const g = path.match(/^\/v1\/admin\/groups\/([a-z0-9]{1,32})(\/.*)?$/);
  if (!g) return json({ error: "not_found" }, 404);
  const code = g[1];
  const rest = g[2] ?? "";
  const row = await db.prepare("SELECT lessons_json, rev FROM groups WHERE code = ?").bind(code).first<{
    lessons_json: string;
    rev: number;
  }>();
  if (!row) return json({ error: "not_found" }, 404);

  if (rest === "" && m === "PATCH") {
    const b = await body(req);
    const sets: string[] = [];
    const args: unknown[] = [];
    const set = (sql: string, v: unknown) => {
      sets.push(sql);
      args.push(v);
    };
    if ("title" in b) set("title = ?", str(b.title, "title", 100));
    if ("week1_monday" in b) set("week1_monday = ?", date(b.week1_monday, "week1_monday"));
    if ("listed" in b) set("listed = ?", b.listed ? 1 : 0);
    if (!sets.length) bad("нечего менять: title, week1_monday, listed");
    return run(code, db.prepare(`UPDATE groups SET ${sets.join(", ")} WHERE code = ?`).bind(...args, code));
  }
  if (rest === "" && m === "DELETE") {
    // переносы и домашка уходят каскадом
    await db.prepare("DELETE FROM groups WHERE code = ?").bind(code).run();
    return json({ deleted: code });
  }

  if (rest === "/lessons" && m === "PUT") {
    // Пары заменяются целиком - два редактора затёрли бы друг друга, поэтому только с текущим rev.
    const b = await body(req);
    const rev = int(b.rev, "rev", 1, Number.MAX_SAFE_INTEGER);
    const r = await db
      .prepare(
        "UPDATE groups SET slots_json = ?, lessons_json = ?, rev = rev + 1, updated_at = datetime('now'), updated_by = ? WHERE code = ? AND rev = ? RETURNING rev",
      )
      .bind(JSON.stringify(slotsOf(b.slots)), JSON.stringify(lessonsOf(b.lessons)), user, code, rev)
      .first<{ rev: number }>();
    if (!r) return json({ error: "conflict", rev: row.rev }, 409);
    return json({ rev: r.rev });
  }

  const hw = rest.match(/^\/homework\/([^/]+)\/([^/]+)$/);
  if (hw && (m === "PUT" || m === "DELETE")) {
    const lesson = decodeURIComponent(hw[1]);
    const day = date(decodeURIComponent(hw[2]), "дата");
    if (m === "DELETE") {
      return run(
        code,
        db.prepare("DELETE FROM homework WHERE group_code = ? AND lesson_id = ? AND date = ?").bind(code, lesson, day),
      );
    }
    const ids = (JSON.parse(row.lessons_json) as { id: string }[]).map((l) => l.id);
    if (!ids.includes(lesson)) bad(`в группе нет пары «${lesson}»`);
    const b = await body(req);
    const text = str(b.text, "text", 2000);
    const until = b.until == null ? null : date(b.until, "until");
    if (until && until < day) bad("until раньше даты, когда задали");
    return run(
      code,
      db.prepare(
        `INSERT INTO homework (group_code, lesson_id, date, text, until, author, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT (group_code, lesson_id, date) DO UPDATE SET
           text = excluded.text, until = excluded.until, author = excluded.author, updated_at = excluded.updated_at`,
      ).bind(code, lesson, day, text, until, user),
    );
  }

  const ch = rest.match(/^\/changes\/([^/]+)\/([^/]+)$/);
  if (ch && (m === "PUT" || m === "DELETE")) {
    const lesson = decodeURIComponent(ch[1]);
    const day = date(decodeURIComponent(ch[2]), "дата");
    if (m === "DELETE") {
      return run(
        code,
        db.prepare("DELETE FROM changes WHERE group_code = ? AND lesson_id = ? AND date = ?").bind(code, lesson, day),
      );
    }
    const ids = (JSON.parse(row.lessons_json) as { id: string }[]).map((l) => l.id);
    if (!ids.includes(lesson)) bad(`в группе нет пары «${lesson}»`);
    const b = await body(req);
    if (!("lesson" in b)) bad("lesson: null - отменить, объект - что идёт вместо");
    const repl = b.lesson === null ? null : JSON.stringify(lessonFields((b.lesson ?? {}) as Record<string, unknown>, "lesson"));
    return run(
      code,
      db.prepare(
        `INSERT INTO changes (group_code, lesson_id, date, lesson_json) VALUES (?, ?, ?, ?)
         ON CONFLICT (group_code, date, lesson_id) DO UPDATE SET lesson_json = excluded.lesson_json`,
      ).bind(code, lesson, day, repl),
    );
  }

  const sh = rest.match(/^\/shifts\/([^/]+)$/);
  if (sh && (m === "PUT" || m === "DELETE")) {
    const day = date(decodeURIComponent(sh[1]), "дата");
    if (m === "DELETE") {
      return run(code, db.prepare("DELETE FROM shifts WHERE group_code = ? AND date = ?").bind(code, day));
    }
    const b = await body(req);
    const which = int(b.day, "day (0 - выходной, 1-7 - чьи пары)", 0, 7);
    return run(
      code,
      db.prepare(
        "INSERT INTO shifts (group_code, date, day) VALUES (?, ?, ?) ON CONFLICT (group_code, date) DO UPDATE SET day = excluded.day",
      ).bind(code, day, which),
    );
  }

  return json({ error: "not_found" }, 404);
}
