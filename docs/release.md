# Релиз

## Сборка в CI

[`.github/workflows/release.yml`](../.github/workflows/release.yml) гоняет тесты, собирает
подписанный release-APK, кладёт его в GitHub Releases и в Cloudflare R2.

- **пуш в `master`** → APK только в R2 и артефактом к прогону, версия `master-<номер сборки>`
- **тег `v1.2`** → обычный релиз `v1.2`
- **вручную** → вкладка Actions, кнопка Run workflow

В R2 каждая сборка ложится двумя объектами: с версией в имени и всегда свежий
`dnui-schedule-latest.apk`. Ссылка на последнюю:
<https://svin-assets.hsryata.com/dnui-app-release/dnui-schedule-latest.apk>

Пуши, которые трогают только `server/`, APK не собирают.

## Сервер в CI

[`.github/workflows/server.yml`](../.github/workflows/server.yml) на каждый пуш и PR, которые
трогают `server/` или `fixtures/`, гоняет проверку типов и тесты Worker и админки (в том числе
сверку парсера xlsx с эталонами). Пуш в `master` с зелёными тестами дальше применяет миграции D1
и деплоит на `dnui-schedule.hsryata.com` — руками `wrangler deploy` больше не нужен.

## Обновление из приложения

Настройки → «Обновить». Версия берётся из последнего релиза на GitHub, APK качается
с зеркала `svin-assets.hsryata.com/dnui-app-release/dnui-schedule-<версия>.apk`,
при недоступности зеркала — с самого релиза. Если GitHub не ответил (репозиторий
приватный, нет сети), ставится `dnui-schedule-latest.apk` с зеркала — версию тогда
сравнить не с чем, это сделает сам установщик. Дальше APK отдаётся системному
установщику, при первом разе Android попросит разрешить установку из приложения.
Код — [Updater.kt](../app/src/main/java/ru/valov/raspisanie/Updater.kt).

Настройки → «Проверять обновления» (по умолчанию выключено): раз в неделю при запуске
приложение спрашивает GitHub о последнем релизе и, если версия другая, предлагает обновиться. Нет ответа от GitHub - спросит на следующем запуске.
На сборках `master-*` и `dev` автопроверка молчит: они новее релиза, их обновляют кнопкой.

## Секреты репозитория

Settings → Secrets and variables → Actions:

| Секрет | Что это |
|---|---|
| `KEYSTORE_BASE64` | `release.jks` в base64 |
| `KEYSTORE_PASSWORD` | пароль хранилища |
| `KEY_ALIAS` | `dnui` |
| `KEY_PASSWORD` | тот же пароль |
| `R2_ACCOUNT_ID` | ID аккаунта Cloudflare |
| `R2_ACCESS_KEY_ID` | из R2 API token |
| `R2_SECRET_ACCESS_KEY` | из R2 API token |
| `R2_BUCKET` | имя бакета |
| `CLOUDFLARE_API_TOKEN` | деплой сервера, см. ниже |

`CLOUDFLARE_API_TOKEN`: Cloudflare → My Profile → API Tokens → Create Token → шаблон
**Edit Cloudflare Workers**; Account Resources — свой аккаунт, Zone Resources — `hsryata.com`;
добавить строку **Account · D1 · Edit**. ID аккаунта берётся из `R2_ACCOUNT_ID` — сервер
в том же аккаунте, что и R2.

**`release.jks` терять нельзя** — подписанные другим ключом APK не встанут поверх
установленного, придётся сносить приложение вместе с заметками. Файл в `.gitignore`,
копия лежит в секрете `KEYSTORE_BASE64`.

Локально `assembleRelease` подписывается отладочным ключом, если переменных
`KEYSTORE_*` в окружении нет.
