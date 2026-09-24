# Сервер расписания

Cloudflare Worker + D1. Чтение публичное, запись (`/v1/admin/*`) и админка (`/admin/`) —
через Cloudflare Access. Контракт — [docs/api.md](../docs/api.md).

Админка — [admin/](admin): React + Vite + Tailwind, собирается в `public/admin` перед каждым
`wrangler deploy`/`dev` и отдаётся тем же Worker. xlsx разбирается прямо в браузере
([admin/src/xlsx.ts](admin/src/xlsx.ts) — копия `Xlsx.kt` из приложения, оба сверяются
с эталонами в `fixtures/`).
Бесплатного тарифа Cloudflare хватает с запасом.

## Разработка

Нужен Node 22+ (тестовый пакет Cloudflare на 20-й не поддерживается).

```bash
npm install         # заодно ставит зависимости admin/
npm test            # Worker с локальной D1 + разбор xlsx в админке
npm run typecheck
npm run dev         # http://localhost:8787, база в .wrangler/, админка на /admin/
```

Локально Access нет: вход в админку берётся из `.dev.vars` (в git не попадает):

```
DEV_USER=me@localhost
```

Работает только на localhost. Правишь админку — в соседнем терминале
`npm --prefix admin run dev` пересобирает её на лету, страницу достаточно обновить.

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

## Свой сервер

Поменяй в `wrangler.toml` имя, домен и `database_id`, дальше всё так же. `[vars]` там же —
для ссылок-приглашений: `APP_CERTS` (отпечатки ключей подписи APK для App Links, у чужого
сервера без своей сборки приложения не нужны) и `APK_URL` (где скачать приложение). Группы заводятся
SQL-вставкой по образцу `scripts/seed.mjs` — пока админки нет.
