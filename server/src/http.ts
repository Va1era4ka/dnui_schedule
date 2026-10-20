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

/**
 * Статика одностраничного фронта из public/{root}: админки или Mini App. Неизвестный маршрут
 * страницы (/admin/g/…) - её index.html, маршруты она рисует сама. Отсутствующий файл (с расширением) -
 * честный 404: иначе старая вкладка после деплоя получила бы HTML вместо скрипта и молча показала
 * пустой экран. Ответ можно дополнять заголовками.
 */
export async function page(req: Request, env: Env, root: string): Promise<Response> {
  let r = await env.ASSETS.fetch(req);
  if (r.status === 404 && !/\.\w+$/.test(new URL(req.url).pathname)) r = await env.ASSETS.fetch(new URL(root, req.url));
  return new Response(r.body, r);
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
