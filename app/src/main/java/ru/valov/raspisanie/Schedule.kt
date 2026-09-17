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

class Schedule(private val week1Monday: LocalDate, val lessons: List<Lesson>) {

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
