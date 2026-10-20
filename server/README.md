# Сервер расписания

Cloudflare Worker + D1. Чтение публичное, запись (`/v1/admin/*`) и админка (`/admin/`) —
через Cloudflare Access. Контракт — [docs/api.md](../docs/api.md).

Админка — [admin/](admin): React + Vite + Tailwind, собирается в `public/admin` перед каждым
`wrangler deploy`/`dev` и отдаётся тем же Worker. xlsx разбирается прямо в браузере
([admin/src/xlsx.ts](admin/src/xlsx.ts) — копия `Xlsx.kt` из приложения, оба сверяются
с эталонами в `fixtures/`).
Mini App бота — [tg/](tg): тот же стек, собирается в `public/tg` и отдаётся по `/tg/`.
Бесплатного тарифа Cloudflare хватает с запасом.

Логика расписания — [shared/](shared), общая для Worker, админки и Mini App: какие пары в какую дату,
из чего пара состоит, какая к ней домашка, когда что напомнить. Это копия `Schedule.kt` и
`nextEvent` из `Notifier.kt`: тесты рядом сверяют те же случаи, что `NotifierTest`, `UiTextTest`
и `SyncTest` в приложении, — поменял правило в одном, поменяй и в другом.

## Разработка

Нужен Node 22+ (тестовый пакет Cloudflare на 20-й не поддерживается).

```bash
npm install         # заодно ставит зависимости admin/ и tg/
npm test            # Worker с локальной D1, shared/, разбор xlsx в админке, подписи Mini App
npm run typecheck   # Worker, админка и Mini App
npm run dev         # http://localhost:8787, база в .wrangler/, админка на /admin/, Mini App на /tg/
```

Локально Access и Telegram нет: вход в админку и в настройки бота (`/tg/api/me`) берётся
из `.dev.vars` (в git не попадает), для бота нужны ещё любые токен и секрет:

```
DEV_USER=me@localhost
DEV_TG_USER=123
TG_BOT_TOKEN=dev
TG_WEBHOOK_SECRET=dev
```

Работает только на localhost. Правишь админку — в соседнем терминале
`npm --prefix admin run dev` пересобирает её на лету, страницу достаточно обновить; Mini App —
так же, `npm --prefix tg run dev`. Вне Telegram она открывается как обычная страница, а тема — по системе.

Локальная база для `npm run dev`:

```bash
npx wrangler d1 migrations apply dnui-schedule --local
npm run seed
npx wrangler d1 execute dnui-schedule --local --file seed.sql
```

## Первый деплой

Домен из `wrangler.toml` должен быть в том же аккаунте Cloudflare.

```bash
npx wrangler login
npx wrangler d1 create dnui-schedule
```

`database_id` из ответа — в `wrangler.toml` вместо заглушки. Дальше:

```bash
npx wrangler d1 migrations apply dnui-schedule --remote
npm run seed        # печатает коды групп и пишет seed.sql - запускать один раз
npx wrangler d1 execute dnui-schedule --remote --file seed.sql
npx wrangler deploy
curl https://dnui-schedule.hsryata.com/v1/groups
```

Потом — только `npx wrangler deploy` после правок кода (админка соберётся сама) и
`npx wrangler d1 migrations apply dnui-schedule --remote` после новых миграций.

## Вход в админку (Cloudflare Access)

Один раз в панели Cloudflare, бесплатно до 50 пользователей:

1. **Zero Trust** → выбрать имя команды (оно станет `<команда>.cloudflareaccess.com`) и план Free.
2. **Settings → Authentication → Login methods**: включён **One-time PIN** — код на почту.
3. **Access → Applications → Add → Self-hosted**:
   - домен `dnui-schedule.hsryata.com`, пути `v1/admin` и `admin` (второй — для будущего фронта);
   - Session duration — 1 month;
   - Policy: Allow, Include → Emails — адреса редакторов.
4. В `wrangler.toml` вписать `ACCESS_TEAM` (имя команды) и `ACCESS_AUD` (Application Audience
   Tag из обзора приложения), затем `npx wrangler deploy`.
5. Проверка: открыть в браузере `https://dnui-schedule.hsryata.com/v1/admin/me` → письмо с кодом
   → в ответе свой email.

Пока `ACCESS_TEAM`/`ACCESS_AUD` пустые, запись закрыта для всех. Добавить редактора — дописать
email в Policy, код менять не нужно.

## Бот в Telegram

[@dnui_schedule_bot](https://t.me/dnui_schedule_bot) — для тех, у кого нет Android: [src/tg.ts](src/tg.ts),
подписчики и их настройки — таблица `tg_users`. Пока секретов нет, `/tg/*` отвечает 404. Включить:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # секрет вебхука
npx wrangler secret put TG_BOT_TOKEN        # токен от @BotFather, команда спросит значение
npx wrangler secret put TG_WEBHOOK_SECRET   # строка из первой команды
npm run tg-setup                            # вебхук, команды, описание, кнопка меню
```

Команды одинаковые в bash и PowerShell. `tg-setup` спросит токен и секрет — те же, что у Worker, —
и не покажет их на экране; можно и передать их переменными `TG_BOT_TOKEN` и `TG_WEBHOOK_SECRET`.
Запускать после деплоя: кнопка меню ведёт на `/tg/`. В @BotFather: Bot Settings → Configure Mini App,
адрес `https://dnui-schedule.hsryata.com/tg/` — с ним работают ссылки `t.me/dnui_schedule_bot?startapp=код`.
Их же ставит страница приглашения `/g/{код}`, как только у Worker появился токен: с айфона и
компьютера — единственной кнопкой, на Android — запасной под «Открыть в приложении».

Mini App ([tg/](tg)) повторяет приложение без того, что живёт только на телефоне: онбординг (группа,
уведомления — по умолчанию только сводка в 20:00), «Сегодня», неделя, экран пары с домашкой, настройки.
Расписание берёт из `/v1/groups/{код}`, настройки — из `/tg/api/me`, последнее скачанное держит в
`localStorage`, чтобы открываться сразу.

Уведомления рассылает cron раз в минуту ([src/notify.ts](src/notify.ts)) — по тем же правилам, что
будильники приложения, и по часам `SCHEDULE_TZ` из `wrangler.toml`. Пишет тем, кто прошёл онбординг
и разрешил боту писать; заблокировали бота — перестаёт. Сводка всегда со свежей домашкой: сервер
читает её в момент отправки. За минуту — не больше 45 сообщений (лимит запросов бесплатного Worker),
кому не хватило — получат следующей минутой; пропущенный запуск догоняется до 10 минут назад.
Локально: `npx wrangler dev --test-scheduled` и `curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"`.

## Свой сервер

Поменяй в `wrangler.toml` имя, домен и `database_id`, дальше всё так же. `[vars]` там же —
для ссылок-приглашений: `APP_CERTS` (отпечатки ключей подписи APK для App Links, у чужого
сервера без своей сборки приложения не нужны) и `APK_URL` (где скачать приложение). Бот — по желанию:
имя своего в `TG_BOT_USERNAME` и его секреты (раздел «Бот в Telegram»), без токена бота просто нет. Группы заводятся
SQL-вставкой по образцу `scripts/seed.mjs` — пока админки нет.
