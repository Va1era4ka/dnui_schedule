/**
 * Ссылка-приглашение /g/{code}. С установленным приложением Android открывает его сразу
 * (App Links, см. assetLinks), эту страницу видят без приложения или во встроенных браузерах
 * WeChat/QQ - там на приложение не перейти, поэтому код написан крупно: его перепечатывают.
 */

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function assetLinks(env: Env): Response {
  const body = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: env.APP_PACKAGE,
        sha256_cert_fingerprints: env.APP_CERTS.split(",").map((s) => s.trim()),
      },
    },
  ];
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
}

export async function invitePage(req: Request, env: Env, code: string): Promise<Response> {
  const g = await env.DB.prepare("SELECT title FROM groups WHERE code = ?").bind(code).first<{ title: string }>();
  if (!g) {
    return page("Группа не найдена", `<h1>Группа не найдена</h1><p>Проверьте ссылку — кода «${esc(code)}» нет.</p>`, 404);
  }
  const open = `raspisanie://connect?server=${encodeURIComponent(new URL(req.url).origin)}&group=${code}`;
  return page(
    g.title,
    `<h1>${esc(g.title)}</h1>
<p>Расписание группы для приложения «Расписание»: пары, переносы и домашка.</p>
<a class="btn" href="${esc(open)}">Открыть в приложении</a>
<p class="label">Код группы</p>
<div class="code">${esc(code)}</div>
<p>Нет приложения? <a href="${esc(env.APK_URL)}">Скачайте APK</a>, при первом запуске выберите
«С сервера» и введите код.</p>
<p class="hint">Кнопка не сработала — откройте ссылку в обычном браузере или введите код вручную:
Настройки → Источник → С сервера.</p>`,
  );
}

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
:root { --bg: #fdf8f6; --fg: #231917; --muted: #6f5b56; --accent: #9a4524; --on-accent: #fff; --card: #f5e7e2; }
@media (prefers-color-scheme: dark) {
  :root { --bg: #1a1110; --fg: #f1dfda; --muted: #d8c2bc; --accent: #ffb59a; --on-accent: #5a1c03; --card: #322825; }
}
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, sans-serif; }
main { max-width: 420px; margin: 0 auto; padding: 40px 16px; }
h1 { font-size: 24px; line-height: 1.25; margin: 0 0 8px; }
p { color: var(--muted); }
a { color: var(--accent); }
.btn { display: block; margin: 24px 0; padding: 14px; border-radius: 28px; text-align: center;
  background: var(--accent); color: var(--on-accent); font-weight: 600; text-decoration: none; }
.label { margin: 24px 0 4px; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
.code { padding: 16px; border-radius: 20px; background: var(--card); text-align: center;
  font: 600 36px/1 ui-monospace, monospace; letter-spacing: .12em; user-select: all; }
.hint { font-size: 13px; }
</style></head>
<body><main>${body}</main></body></html>`;
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-cache",
      // страница только показывает текст - ни скриптов, ни чужих ресурсов ей не нужно
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
