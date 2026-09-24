/**
 * Вход в админку - Cloudflare Access: он стоит перед /v1/admin/* и кладёт в каждый запрос
 * подписанный JWT (Cf-Access-Jwt-Assertion). Подпись проверяем сами, а не верим заголовку:
 * иначе ошибка в правилах Access или чужой маршрут на этот Worker открыли бы запись всем.
 */

// ponytail: ключи Access в памяти изолята на час; незнакомый kid - сразу перезапрашиваем.
let cache: { at: number; keys: JsonWebKey[] } | undefined;

async function accessKeys(team: string, fresh: boolean): Promise<JsonWebKey[]> {
  if (!fresh && cache && Date.now() - cache.at < 3_600_000) return cache.keys;
  const r = await fetch(`https://${team}.cloudflareaccess.com/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error("access certs: " + r.status);
  const { keys } = (await r.json()) as { keys: JsonWebKey[] };
  cache = { at: Date.now(), keys };
  return keys;
}

// base64url -> байты; atob по стандарту прощает отсутствие «=» в конце
const bytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const decode = (s: string) => JSON.parse(new TextDecoder().decode(bytes(s)));

/** Кто пришёл: email из Access (у сервисного токена - его client id). null - не пустить. */
export async function accessUser(req: Request, env: Env): Promise<string | null> {
  // Локальный `wrangler dev`: Access там нет, вход подставляется из .dev.vars (DEV_USER=почта).
  // Только для localhost - на боевом домене переменная ничего не откроет, даже если её задать.
  const dev = (env as { DEV_USER?: string }).DEV_USER;
  const host = new URL(req.url).hostname;
  if (dev && (host === "localhost" || host === "127.0.0.1")) return dev;

  const token = req.headers.get("cf-access-jwt-assertion");
  // пока Access не настроен (пустые переменные) - админка закрыта для всех
  if (!token || !env.ACCESS_TEAM || !env.ACCESS_AUD) return null;
  const [h, p, s, extra] = token.split(".");
  if (!s || extra !== undefined) return null;
  try {
    const header = decode(h);
    if (header.alg !== "RS256") return null;
    const find = (keys: JsonWebKey[]) => keys.find((k) => (k as { kid?: string }).kid === header.kid);
    const jwk = find(await accessKeys(env.ACCESS_TEAM, false)) ?? find(await accessKeys(env.ACCESS_TEAM, true));
    if (!jwk) return null;
    const alg = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
    const key = await crypto.subtle.importKey("jwk", jwk, alg, false, ["verify"]);
    if (!(await crypto.subtle.verify(alg, key, bytes(s), new TextEncoder().encode(`${h}.${p}`)))) return null;

    const c = decode(p);
    const now = Date.now() / 1000;
    const aud: unknown[] = Array.isArray(c.aud) ? c.aud : [c.aud];
    if (c.iss !== `https://${env.ACCESS_TEAM}.cloudflareaccess.com` || !aud.includes(env.ACCESS_AUD)) {
      // подпись верна, но токен от другой команды/приложения - почти всегда опечатка в wrangler.toml
      console.warn(`access: токен от ${c.iss}, ждём команду ${env.ACCESS_TEAM} и AUD из wrangler.toml`);
      return null;
    }
    if (!(c.exp > now) || (c.nbf && c.nbf > now + 60)) return null;
    return c.email || c.common_name || null;
  } catch (e) {
    // «access certs: 404» - в ACCESS_TEAM не имя команды Zero Trust
    console.warn("access:", (e as Error).message);
    return null;
  }
}
