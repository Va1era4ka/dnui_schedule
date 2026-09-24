/**
 * Публичное API расписания: только чтение, без входа. Контракт - docs/api.md.
 * Запись (админка за Cloudflare Access) появится отдельными путями /v1/admin/*.
 */

interface GroupRow {
  code: string;
  title: string;
  week1_monday: string;
  slots_json: string;
  lessons_json: string;
  rev: number;
}

// Данные публичные - пусть их читает и чужой веб-клиент. ETag отдаём наружу для If-None-Match.
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "if-none-match",
  "access-control-expose-headers": "etag",
};

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // no-cache = «переспроси»: кэш Cloudflare и телефона не отдаст устаревшее, а 304 почти бесплатен
      "cache-control": "no-cache",
      ...CORS,
      ...headers,
    },
  });
}

export default {
  async fetch(req, env): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);

    const path = new URL(req.url).pathname;
    if (path === "/v1/groups") {
      const { results } = await env.DB
        .prepare("SELECT code, title FROM groups WHERE listed = 1 ORDER BY title")
        .all();
      return json({ groups: results });
    }
    const m = path.match(/^\/v1\/groups\/([a-z0-9]{1,32})$/);
    if (m) return group(req, env, m[1]);
    return json({ error: "not_found" }, 404);
  },
} satisfies ExportedHandler<Env>;

async function group(req: Request, env: Env, code: string): Promise<Response> {
  // Одним батчем - это одна транзакция: rev, переносы и домашка из одного состояния базы.
  const [g, shifts, homework] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM groups WHERE code = ?").bind(code),
    env.DB.prepare("SELECT date, day FROM shifts WHERE group_code = ? ORDER BY date").bind(code),
    env.DB.prepare(
      "SELECT lesson_id AS lesson, date, text, until FROM homework WHERE group_code = ? ORDER BY date, lesson_id",
    ).bind(code),
  ]);
  const row = g.results[0] as GroupRow | undefined;
  if (!row) return json({ error: "not_found" }, 404);

  const etag = `"${row.rev}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { etag, "cache-control": "no-cache", ...CORS } });
  }
  const lessons: { weeks: [number, number] }[] = JSON.parse(row.lessons_json);
  return json(
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
    },
    200,
    { etag },
  );
}
