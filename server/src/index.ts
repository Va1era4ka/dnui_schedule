import { admin } from "./admin";
import { CORS, json } from "./http";
import { assetLinks, invitePage } from "./invite";

/**
 * API расписания. Контракт - docs/api.md. Чтение публичное и без входа,
 * запись - /v1/admin/* за Cloudflare Access (admin.ts).
 */

interface GroupRow {
  code: string;
  title: string;
  week1_monday: string;
  slots_json: string;
  lessons_json: string;
  rev: number;
}

const pub = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  json(body, status, { ...CORS, ...headers });

export default {
  async fetch(req, env): Promise<Response> {
    const path = new URL(req.url).pathname;
    if (path.startsWith("/v1/admin/")) return admin(req, env, path);
    if (path === "/admin" || path.startsWith("/admin/")) return adminPage(req, env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (req.method !== "GET") return pub({ error: "method_not_allowed" }, 405);

    if (path === "/v1/groups") {
      const { results } = await env.DB
        .prepare("SELECT code, title FROM groups WHERE listed = 1 ORDER BY title")
        .all();
      return pub({ groups: results });
    }
    const m = path.match(/^\/v1\/groups\/([a-z0-9]{1,32})$/);
    if (m) return group(req, env, m[1]);
    const inv = path.match(/^\/g\/([a-z0-9]{1,32})\/?$/i);
    if (inv) return invitePage(req, env, inv[1].toLowerCase());
    if (path === "/.well-known/assetlinks.json") return assetLinks(env);
    return pub({ error: "not_found" }, 404);
  },
} satisfies ExportedHandler<Env>;

/**
 * Статика админки. Неизвестный маршрут страницы (/admin/g/…) - её index.html, маршруты она рисует
 * сама. Отсутствующий файл (с расширением) - честный 404: иначе старая вкладка после деплоя
 * получила бы HTML вместо скрипта и молча показала пустой экран.
 */
async function adminPage(req: Request, env: Env): Promise<Response> {
  let r = await env.ASSETS.fetch(req);
  if (r.status === 404 && !/\.\w+$/.test(new URL(req.url).pathname)) r = await env.ASSETS.fetch(new URL("/admin/", req.url));
  r = new Response(r.body, r);
  // админку нельзя встраивать в чужие страницы и подгружать в неё чужое
  r.headers.set("content-security-policy", "default-src 'self'; img-src 'self' data:; frame-ancestors 'none'");
  r.headers.set("x-frame-options", "DENY");
  return r;
}

async function group(req: Request, env: Env, code: string): Promise<Response> {
  // Одним батчем - это одна транзакция: rev, переносы, домашка и правки на дату из одного состояния базы.
  const [g, shifts, homework, changes] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM groups WHERE code = ?").bind(code),
    env.DB.prepare("SELECT date, day FROM shifts WHERE group_code = ? ORDER BY date").bind(code),
    env.DB.prepare(
      "SELECT lesson_id AS lesson, date, text, until FROM homework WHERE group_code = ? ORDER BY date, lesson_id",
    ).bind(code),
    env.DB.prepare("SELECT date, lesson_id, lesson_json FROM changes WHERE group_code = ? ORDER BY date, lesson_id").bind(code),
  ]);
  const row = g.results[0] as GroupRow | undefined;
  if (!row) return pub({ error: "not_found" }, 404);

  const etag = `"${row.rev}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { etag, "cache-control": "no-cache", ...CORS } });
  }
  const lessons: { weeks: [number, number] }[] = JSON.parse(row.lessons_json);
  return pub(
    {
      code: row.code,
      title: row.title,
      rev: row.rev,
      meta: {
        title: row.title,
        week1_monday: row.week1_monday,
        weeks: Math.max(0, ...lessons.map((l) => l.weeks[1])),
      },
      slots: JSON.parse(row.slots_json),
      lessons,
      shifts: Object.fromEntries(
        (shifts.results as { date: string; day: number }[]).map((s) => [s.date, s.day]),
      ),
      homework: homework.results,
      changes: (changes.results as { date: string; lesson_id: string; lesson_json: string | null }[]).reduce<
        Record<string, Record<string, unknown>>
      >((o, c) => (((o[c.date] ??= {})[c.lesson_id] = c.lesson_json && JSON.parse(c.lesson_json)), o), {}),
    },
    200,
    { etag },
  );
}
