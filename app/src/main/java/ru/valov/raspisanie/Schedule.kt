package ru.valov.raspisanie

import android.content.Context
import org.json.JSONObject
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime

/** Строка поиска для карты. Промахивается - подставь точное название кампуса. */
const val CAMPUS = "软件园校区"

data class Lesson(
    val id: String,
    val day: Int,            // 1 = понедельник
    val slot: Int,
    val start: LocalTime,
    val end: LocalTime,
    val name: String,
    val nameRu: String,
    val teacher: String,
    val room: String,
    val roomRu: String,
    val building: String,
    val weekFrom: Int,
    val weekTo: Int,
) {
    /** Куда вести карту: ищем корпус внутри кампуса, координаты не нужны. */
    val mapQuery: String get() = "$CAMPUS $building"
}

/**
 * Короткий код предмета для сетки недели: аббревиатура из слов,
 * готовое сокращение вроде ООП - как есть, одно слово - первые четыре буквы.
 */
fun shortCode(name: String): String {
    val words = name.split(' ').filter { it.length > 2 && it.any { c -> c.isLetter() } }
    words.firstOrNull { w -> w.all { !it.isLetter() || it.isUpperCase() } }?.let { return it }
    return if (words.size >= 2) words.take(3).map { it.first().uppercaseChar() }.joinToString("")
    else name.take(4)
}

/** A6-413 -> 413, а спорткомплекс оставляем как есть - ячейка обрежет сама. */
fun shortRoom(room: String): String = room.substringAfterLast('-')

class Schedule(private val week1Monday: LocalDate, val lessons: List<Lesson>) {

    /** Предметы в стабильном порядке - по нему выбирается цвет предмета. */
    val subjects: List<String> = lessons.map { it.nameRu }.distinct().sorted()

    /** Номер пары -> её начало (пара 1 бывает и сдвоенной, берём раннее начало). */
    val slots: List<Pair<Int, LocalTime>> =
        lessons.groupBy { it.slot }.toSortedMap().map { (n, ls) -> n to ls.minOf { it.start } }


    /** Номер учебной недели. До начала семестра уходит в 0 и минус - так и надо. */
    fun weekOf(date: LocalDate): Int =
        Math.floorDiv(date.toEpochDay() - week1Monday.toEpochDay(), 7L).toInt() + 1

    fun mondayOf(week: Int): LocalDate = week1Monday.plusDays((week - 1) * 7L)

    fun on(date: LocalDate): List<Lesson> {
        val week = weekOf(date)
        val day = date.dayOfWeek.value
        return lessons
            .filter { it.day == day && week >= it.weekFrom && week <= it.weekTo }
            .sortedBy { it.start }
    }

    /** Пара, идущая прямо сейчас (для «до конца пары»). */
    fun current(now: LocalDateTime): Lesson? =
        on(now.toLocalDate()).firstOrNull {
            !now.toLocalTime().isBefore(it.start) && now.toLocalTime().isBefore(it.end)
        }

    companion object {
        fun load(ctx: Context, klass: Int): Schedule {
            val root = JSONObject(
                ctx.assets.open("schedule.$klass.json").bufferedReader().use { it.readText() }
            )
            val arr = root.getJSONArray("lessons")
            val lessons = (0 until arr.length()).map { i ->
                val o = arr.getJSONObject(i)
                val weeks = o.getJSONArray("weeks")
                Lesson(
                    id = o.getString("id"),
                    day = o.getInt("day"),
                    slot = o.getInt("slot"),
                    start = LocalTime.parse(o.getString("start")),
                    end = LocalTime.parse(o.getString("end")),
                    name = o.getString("name"),
                    nameRu = o.getString("name_ru"),
                    teacher = o.getString("teacher"),
                    room = o.getString("room"),
                    roomRu = o.getString("room_ru"),
                    building = o.getString("building"),
                    weekFrom = weeks.getInt(0),
                    weekTo = weeks.getInt(1),
                )
            }
            val meta = root.getJSONObject("meta")
            return Schedule(LocalDate.parse(meta.getString("week1_monday")), lessons)
        }
    }
}
