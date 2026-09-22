# Расписание

Оффлайн Android-приложение с расписанием пар: экран «Сегодня», листаемые дни,
сетка недели, заметки к парам и локальные уведомления. Расписание зашито в APK,
сеть нужна только чтобы обновить само приложение.

Android 8+ (minSdk 26), Kotlin + Compose.

## Установка

<https://svin-assets.hsryata.com/dnui-app-release/dnui-schedule-latest.apk>

Дальше приложение обновляет себя само: Настройки → «Обновить».

## Сборка

Нужен **JDK 17** — на более новых Kotlin DSL падает.

```bash
./gradlew test assembleRelease
```

APK — в `app/build/outputs/apk/release/`. Локально подписывается отладочным ключом.

## Расписание

Лежит в `app/src/main/assets/schedule.1.json` и `schedule.2.json` (по классу),
генерируется из файлов `*课表.xlsx`:

```bash
python parse.py
```

Поменялось расписание — заменил xlsx, перезапустил скрипт, пересобрал.

## Остальное

- [docs/schedule.md](docs/schedule.md) — что править руками, как работают уведомления
- [docs/release.md](docs/release.md) — CI, секреты, обновление в приложении
