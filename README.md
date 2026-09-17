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
