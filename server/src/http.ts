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
