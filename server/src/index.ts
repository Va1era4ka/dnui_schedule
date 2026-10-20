import { admin } from "./admin";
import { loadGroups } from "./groups";
import { CORS, json, page } from "./http";
import { assetLinks, invitePage } from "./invite";
import { notify } from "./notify";
import { tg } from "./tg";

/**
 * API расписания. Контракт - docs/api.md. Чтение публичное и без входа,
 * запись - /v1/admin/* за Cloudflare Access (admin.ts), бот и его Mini App - /tg/* (tg.ts).
 */

const pub = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  json(body, status, { ...CORS, ...headers });

export default {
  async fetch(req, env): Promise<Response> {
    const path = new URL(req.url).pathname;
    if (path.startsWith("/v1/admin/")) return admin(req, env, path);
    if (path === "/admin" || path.startsWith("/admin/")) return adminPage(req, env);
    if (path === "/tg" || path.startsWith("/tg/")) return tg(req, env, path);
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
  // уведомления бота - раз в минуту, [triggers] в wrangler.toml
  async scheduled(controller, env) {
    await notify(env, controller.scheduledTime);
  },
} satisfies ExportedHandler<Env>;

async function adminPage(req: Request, env: Env): Promise<Response> {
  const r = await page(req, env, "/admin/");
  // админку нельзя встраивать в чужие страницы и подгружать в неё чужое
  r.headers.set("content-security-policy", "default-src 'self'; img-src 'self' data:; frame-ancestors 'none'");
  r.headers.set("x-frame-options", "DENY");
  return r;
}

async function group(req: Request, env: Env, code: string): Promise<Response> {
  const [groups, settings] = await Promise.all([
    loadGroups(env.DB, [code]),
    env.DB.prepare("SELECT value FROM settings WHERE key = 'app_version'").first<{ value: string }>(),
  ]);
  const g = groups.get(code);
  if (!g) return pub({ error: "not_found" }, 404);

  const appVersion = settings?.value;
  // объявили версию - ETag меняется, и приложения, у которых группа не менялась, тоже её получат
  const etag = appVersion ? `"${g.rev}-${appVersion}"` : `"${g.rev}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { etag, "cache-control": "no-cache", ...CORS } });
  }
  return pub({ ...g, ...(appVersion && { app_version: appVersion }) }, 200, { etag });
}
