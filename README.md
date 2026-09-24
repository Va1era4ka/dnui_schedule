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

Лежит в `app/src/main/assets/schedule.1.xlsx` и `schedule.2.xlsx` (по классу) — это
выгрузки DNUI как есть, приложение разбирает их само ([Xlsx.kt](app/src/main/java/ru/valov/raspisanie/Xlsx.kt)).

Поменялось расписание — открой новый xlsx в Excel, **удали лист 学生名单** (там ФИО и номера
студенческих), сохрани под тем же именем в ассеты, пересобери. Лишний лист тест не пропустит.

## Остальное

- [docs/schedule.md](docs/schedule.md) — что править руками, как работают уведомления
- [docs/release.md](docs/release.md) — CI, секреты, обновление в приложении

## Лицензия

MIT, см. [LICENSE](LICENSE).
