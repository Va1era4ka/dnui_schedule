// Бот @dnui_schedule_bot: вебхук на Worker, команды, описание и кнопка меню. Запускать после деплоя
// и при смене домена: npm run tg-setup [-- https://dnui-schedule.hsryata.com]
// Токен и секрет вебхука - те же, что в секретах Worker (server/README.md). Берутся из TG_BOT_TOKEN
// и TG_WEBHOOK_SECRET, а нет их - скрипт спросит сам: так одинаково в bash и PowerShell.
const base = (process.argv[2] ?? "https://dnui-schedule.hsryata.com").replace(/\/+$/, "");

// набранное, но ещё не разобранное по строкам: вставили обе строки разом - вторая ждёт тут
let typed = "";

/**
 * Спросить, не показывая набранное, как пароль: токен не должен остаться ни на экране,
 * ни в истории терминала. Терминал - в сыром режиме, эхо не печатаем, Ctrl+C - выход.
 */
async function ask(question) {
  const stdin = process.stdin;
  if (!stdin.isTTY) fail("Нужны TG_BOT_TOKEN и TG_WEBHOOK_SECRET в окружении: ввод не из терминала, спросить негде");
  process.stdout.write(question);
  stdin.setRawMode(true);
  stdin.setEncoding("utf8");
  // после pause() прошлого вопроса поток сам не оживёт от нового слушателя
  stdin.resume();
  try {
    for (;;) {
      const end = typed.search(/[\r\n]/);
      if (end >= 0) {
        const line = typed.slice(0, end);
        typed = typed.slice(end + (typed.startsWith("\r\n", end) ? 2 : 1));
        process.stdout.write("\n");
        return line.trim();
      }
      const chunk = await new Promise((resolve) => stdin.once("data", resolve));
      for (const ch of chunk) {
        if (ch === "\u0003") fail("");
        typed = ch === "\u007f" || ch === "\b" ? typed.slice(0, -1) : typed + ch;
      }
    }
  } finally {
    stdin.setRawMode(false);
    stdin.pause();
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function call(token, method, params = {}) {
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

try {
  const token = process.env.TG_BOT_TOKEN || (await ask("Токен бота от @BotFather: "));
  const secret = process.env.TG_WEBHOOK_SECRET || (await ask("Секрет вебхука (тот же, что TG_WEBHOOK_SECRET у Worker): "));
  if (!/^\d+:[\w-]+$/.test(token)) fail("Токен не похож на токен бота: он вида 123456789:AA… - скопируйте его из @BotFather целиком");
  // Telegram пропускает в секрете только такие символы
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
    fail(`Секрет вебхука: только латиница, цифры, _ и -, до 256 символов. Новый:
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`);
  }

  await call(token, "setWebhook", { url: `${base}/tg/hook`, secret_token: secret, allowed_updates: ["message", "my_chat_member"] });
  await call(token, "setMyCommands", { commands: [{ command: "start", description: "Открыть расписание" }] });
  // видно в пустом чате до «Старт» и в профиле бота
  await call(token, "setMyDescription", {
    description: "Расписание пар группы DNUI: переносы, домашка и уведомления — сводка на завтра и о следующей паре.",
  });
  await call(token, "setMyShortDescription", { short_description: "Расписание пар группы DNUI: переносы, домашка, уведомления" });
  await call(token, "setChatMenuButton", { menu_button: { type: "web_app", text: "Расписание", web_app: { url: `${base}/tg/` } } });
  const info = await call(token, "getWebhookInfo");
  console.log(`вебхук: ${info.url}${info.last_error_message ? `, последняя ошибка: ${info.last_error_message}` : ""}`);
} catch (e) {
  // «Unauthorized» от Telegram - не тот токен
  fail(
    e.message === "fetch failed"
      ? "Не достучаться до api.telegram.org: нет сети или Telegram закрыт - включите VPN и запустите снова"
      : e.message,
  );
}
