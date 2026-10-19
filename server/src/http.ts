// Публичные данные пусть читает и чужой веб-клиент. ETag отдаём наружу для If-None-Match.
// Админке CORS не нужен: её фронт живёт на этом же домене.
export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "if-none-match",
  "access-control-expose-headers": "etag",
};

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // no-cache = «переспроси»: кэш Cloudflare и телефона не отдаст устаревшее, а 304 почти бесплатен
      "cache-control": "no-cache",
      ...headers,
    },
  });
}

/** Неверные данные в запросе: ловится наверху и уходит 400 с этим текстом - его можно показывать как есть. */
export class Bad extends Error {}
export const bad = (msg: string): never => {
  throw new Bad(msg);
};

/** Тело запроса - JSON-объект, иначе Bad. */
export async function body(req: Request): Promise<Record<string, unknown>> {
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
