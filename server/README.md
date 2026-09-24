# Сервер расписания

Cloudflare Worker + D1. Пока только публичное чтение — контракт в [docs/api.md](../docs/api.md).
Бесплатного тарифа Cloudflare хватает с запасом.

## Разработка

```bash
npm install
npm test            # тесты в рантайме Workers с локальной D1
npm run typecheck
npm run dev         # локально на http://127.0.0.1:8787, база в .wrangler/
```

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

Потом — только `npx wrangler deploy` после правок кода и
`npx wrangler d1 migrations apply dnui-schedule --remote` после новых миграций.

## Свой сервер

Поменяй в `wrangler.toml` имя, домен и `database_id`, дальше всё так же. Группы заводятся
SQL-вставкой по образцу `scripts/seed.mjs` — пока админки нет.
