package ru.valov.raspisanie

import android.content.Context
import org.json.JSONObject
import java.io.File
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

/** Правка расписания на подряд идущие даты: 1-7 октября - одна строка, а не семь. */
data class ShiftRange(val from: LocalDate, val to: LocalDate, val day: Int) {

    val dates: List<LocalDate>
        get() = generateSequence(from) { it.plusDays(1) }.takeWhile { !it.isAfter(to) }.toList()

    /** «1–7 октября · выходные», «вс, 20 сентября · пары за понедельник». */
    val label: String
        get() {
            val period = when {
                from == to ->
                    DAYS_SHORT[from.dayOfWeek.value - 1].lowercase() + ", " + from.format(DATE_FMT)
                from.month == to.month -> "" + from.dayOfMonth + "–" + to.format(DATE_FMT)
                else -> from.format(DATE_FMT) + " – " + to.format(DATE_FMT)
            }
            val what =
                if (day != 0) "пары за " + DAYS[day - 1].lowercase()
                else if (from == to) "выходной" else "выходные"
            return period + " · " + what
        }
}

/** Соседние даты с одинаковой правкой сливаются в один диапазон. */
fun shiftRanges(shifts: Map<LocalDate, Int>): List<ShiftRange> {
    val out = ArrayList<ShiftRange>()
    shifts.toSortedMap().forEach { (d, day) ->
        val last = out.lastOrNull()
        if (last != null && last.day == day && last.to.plusDays(1) == d) {
            out[out.lastIndex] = last.copy(to = d)
        } else {
            out.add(ShiftRange(d, d, day))
        }
    }
    return out
}

/** Насколько далеко смотрим по предмету назад и вперёд: семестр, дальше домашку не задают. */
private const val HORIZON = 120

/** A6-413 -> 413, а спорткомплекс оставляем как есть - ячейка обрежет сама. */
fun shortRoom(room: String): String = room.substringAfterLast('-')

class Schedule(
    private val week1Monday: LocalDate,
    val lessons: List<Lesson>,
    /** Правки расписания: дата -> чьи пары идут. 1 = понедельник, 0 = выходной. */
    private val shifts: Map<LocalDate, Int> = emptyMap(),
) {

    /** Предметы в стабильном порядке - по нему выбирается цвет предмета. */
    val subjects: List<String> = lessons.map { it.nameRu }.distinct().sorted()

    /** Номер пары -> её начало (пара 1 бывает и сдвоенной, берём раннее начало). */
    val slots: List<Pair<Int, LocalTime>> =
        lessons.groupBy { it.slot }.toSortedMap().map { (n, ls) -> n to ls.minOf { it.start } }


    /** Номер учебной недели. До начала семестра уходит в 0 и минус - так и надо. */
    fun weekOf(date: LocalDate): Int =
        Math.floorDiv(date.toEpochDay() - week1Monday.toEpochDay(), 7L).toInt() + 1

    fun mondayOf(week: Int): LocalDate = week1Monday.plusDays((week - 1) * 7L)

    /**
     * Пары на дату. Перенос делает воскресенье понедельником, праздник - пустым днём.
     * ponytail: неделя берётся по самой дате; понадобится «пары за пятницу
     * пятой недели» - храни в переносе ещё и номер недели.
     */
    fun on(date: LocalDate): List<Lesson> {
        val day = shifts[date] ?: date.dayOfWeek.value
        if (day == 0) return emptyList()
        val week = weekOf(date)
        return lessons
            .filter { it.day == day && week >= it.weekFrom && week <= it.weekTo }
            .sortedBy { it.start }
    }

    /**
     * Колонка дня для сетки недели: пара (или пусто) и сколько слотов она занимает.
     * Сдвоенная пара идёт одной записью 08:00-11:40 - это два слота, а не один.
     */
    fun column(date: LocalDate): List<Pair<Lesson?, Int>> {
        val today = on(date)
        val out = ArrayList<Pair<Lesson?, Int>>()
        var i = 0
        while (i < slots.size) {
            val l = today.firstOrNull { it.slot == slots[i].first }
            val span =
                if (l == null) 1
                else slots.count { !it.second.isBefore(l.start) && it.second.isBefore(l.end) }
            out.add(l to span)
            i += maxOf(span, 1)
        }
        return out
    }

    /** Дата помечена выходным - в сетке недели это одна плашка на весь день. */
    fun isHoliday(date: LocalDate): Boolean = shifts[date] == 0

    /**
     * Прошлые занятия по тому же предмету, ближайшее первым - там пишут домашку
     * к этой паре. Докуда заметка живёт, решает её пометка, а не этот горизонт.
     */
    fun earlier(l: Lesson, date: LocalDate): Sequence<Pair<Lesson, LocalDate>> =
        (0..HORIZON).asSequence().flatMap { back ->
            val d = date.minusDays(back.toLong())
            on(d).filter { it.nameRu == l.nameRu && (d < date || it.start < l.start) }
                .reversed().map { it to d }.asSequence()
        }

    /** Следующие занятия по тому же предмету, ближайшее первым - до какого показывать заметку. */
    fun later(l: Lesson, date: LocalDate): Sequence<Pair<Lesson, LocalDate>> =
        (0..HORIZON).asSequence().flatMap { ahead ->
            val d = date.plusDays(ahead.toLong())
            on(d).filter { it.nameRu == l.nameRu && (d > date || it.start > l.start) }
                .map { it to d }.asSequence()
        }

    /** Пара, идущая прямо сейчас (для «до конца пары»). */
    fun current(now: LocalDateTime): Lesson? =
        on(now.toLocalDate()).firstOrNull {
            !now.toLocalTime().isBefore(it.start) && now.toLocalTime().isBefore(it.end)
        }

    companion object {
        /** Активное расписание - один файл, откуда бы оно ни пришло: ассеты, свой xlsx, сервер. */
        private fun file(ctx: Context) = File(ctx.filesDir, "schedule.json")

        fun load(ctx: Context): Schedule {
            val prefs = Prefs(ctx)
            val f = file(ctx)
            // Встроенное пересобираем после обновления APK: с ним могли приехать новые xlsx.
            val updated = ctx.packageManager.getPackageInfo(ctx.packageName, 0).lastUpdateTime
            if (!f.exists() || prefs.source == "bundled" && f.lastModified() < updated) {
                useBundled(ctx, prefs.klass)
            }
            return parse(JSONObject(f.readText()), prefs.shifts)
        }

        fun useBundled(ctx: Context, klass: Int) {
            save(ctx, ctx.assets.open("schedule.$klass.xlsx").use { Xlsx.parse(it, WEEK1_MONDAY) })
            Prefs(ctx).apply { this.klass = klass; source = "bundled" }
        }

        /** Свой xlsx, уже разобранный [Xlsx.parse]. Прежнее расписание он заменяет целиком. */
        fun useFile(ctx: Context, json: JSONObject) {
            save(ctx, json)
            Prefs(ctx).source = "file"
        }

        // Сначала во временный файл: оборвётся запись - прежнее расписание останется целым.
        internal fun save(ctx: Context, json: JSONObject) {
            val tmp = File(ctx.filesDir, "schedule.json.tmp")
            tmp.writeText(json.toString())
            if (!tmp.renameTo(file(ctx))) error("Не удалось сохранить расписание")
        }

        /** JSON формата ассетов -> расписание. [local] - свои переносы из настроек. */
        internal fun parse(root: JSONObject, local: Map<LocalDate, Int>): Schedule {
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
            // переносы с сервера - основа, свои из настроек поверх: можно отметить себе и личный выходной
            val server = root.optJSONObject("shifts")
                ?.let { o -> o.keys().asSequence().associate { LocalDate.parse(it) to o.getInt(it) } }
                ?: emptyMap()
            return Schedule(LocalDate.parse(meta.getString("week1_monday")), lessons, server + local)
        }
    }
}
