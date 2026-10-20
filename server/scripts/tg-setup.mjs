// Бот @dnui_schedule_bot: вебхук на Worker, команды, описание и кнопка меню. Запускать при первой
// настройке и при смене домена, значения - те же, что в секретах Worker (server/README.md):
//   TG_BOT_TOKEN=… TG_WEBHOOK_SECRET=… npm run tg-setup [-- https://dnui-schedule.hsryata.com]
const { TG_BOT_TOKEN: token, TG_WEBHOOK_SECRET: secret } = process.env;
const base = (process.argv[2] ?? "https://dnui-schedule.hsryata.com").replace(/\/+$/, "");
if (!token || !secret) {
  console.error("Нужны TG_BOT_TOKEN и TG_WEBHOOK_SECRET в окружении");
  process.exit(1);
}
// Telegram пропускает в секрете только такие символы
if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
  console.error("TG_WEBHOOK_SECRET: только латиница, цифры, _ и -, до 256 символов (openssl rand -hex 32)");
  process.exit(1);
}

async function call(method, params = {}) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  const res = await r.json();
  if (!res.ok) throw new Error(`${method}: ${res.description}`);
  console.log(`${method}: ok`);
  return res.result;
}

await call("setWebhook", { url: `${base}/tg/hook`, secret_token: secret, allowed_updates: ["message", "my_chat_member"] });
await call("setMyCommands", { commands: [{ command: "start", description: "Открыть расписание" }] });
// видно в пустом чате до «Старт» и в профиле бота
await call("setMyDescription", {
  description: "Расписание пар группы DNUI: переносы, домашка и уведомления — сводка на завтра и о следующей паре.",
});
await call("setMyShortDescription", { short_description: "Расписание пар группы DNUI: переносы, домашка, уведомления" });
await call("setChatMenuButton", { menu_button: { type: "web_app", text: "Расписание", web_app: { url: `${base}/tg/` } } });
const info = await call("getWebhookInfo");
console.log(`вебхук: ${info.url}${info.last_error_message ? `, последняя ошибка: ${info.last_error_message}` : ""}`);
