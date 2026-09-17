# Расписание

Оффлайн Android-приложение для расписания из `*课表.xlsx`. Сервера нет, интернета не требует.

## Что править руками

| Что | Где |
|---|---|
| Понедельник 1-й недели семестра | `WEEK1_MONDAY` в [parse.py](parse.py) |
| Названия предметов по-русски | словарь `RU` там же |
| Строка поиска корпуса на карте | `CAMPUS` в [Schedule.kt](app/src/main/java/ru/valov/raspisanie/Schedule.kt) |

## Уведомления

Локальный `AlarmManager`, по одному будильнику на ближайшее событие — переживает
перезагрузку и переустановку. Вся логика выбора события в функции `nextEvent`
([Notifier.kt](app/src/main/java/ru/valov/raspisanie/Notifier.kt)), её проверяет
[NotifierTest.kt](app/src/test/java/ru/valov/raspisanie/NotifierTest.kt).

На Android 12+ в настройках приложения нужно разрешить «Будильники и напоминания»,
иначе Doze может задержать уведомление минут на 15. Приложение само предложит.

## Сборка в CI

[`.github/workflows/release.yml`](.github/workflows/release.yml) гоняет тесты, собирает
подписанный release-APK, кладёт его в GitHub Releases и в Cloudflare R2.

- **пуш в `master`** → APK только в R2 и артефактом к прогону, версия `master-<номер сборки>`
- **тег `v1.2`** → обычный релиз `v1.2`
- **вручную** → вкладка Actions, кнопка Run workflow

В R2 каждая сборка ложится двумя объектами: с версией в имени и всегда свежий
`dnui-schedule-latest.apk`. Ссылка на последнюю:
<https://svin-assets.hsryata.com/dnui-app-release/dnui-schedule-latest.apk>

### Секреты репозитория

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

**`release.jks` терять нельзя** — подписанные другим ключом APK не встанут поверх
установленного, придётся сносить приложение вместе с заметками. Файл в `.gitignore`,
копия лежит в секрете `KEYSTORE_BASE64`.

Локально `assembleRelease` подписывается отладочным ключом, если переменных
`KEYSTORE_*` в окружении нет.
