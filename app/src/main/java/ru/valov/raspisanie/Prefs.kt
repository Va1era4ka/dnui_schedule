package ru.valov.raspisanie

import android.content.Context
import java.time.LocalDate
import java.time.LocalTime

/** ponytail: SharedPreferences. Room понадобится, когда заметки обрастут полями. */
class Prefs(ctx: Context) {
    private val sp = ctx.getSharedPreferences("raspisanie", Context.MODE_PRIVATE)

    var klass: Int
        get() = sp.getInt("klass", 1)
        set(v) = sp.edit().putInt("klass", v).apply()

    /** Оформление: 0 - системная тема, 1 - светлая, 2 - тёмная. */
    var theme: Int
        get() = sp.getInt("theme", 0)
        set(v) = sp.edit().putInt("theme", v).apply()

    var digestOn: Boolean
        get() = sp.getBoolean("digestOn", true)
        set(v) = sp.edit().putBoolean("digestOn", v).apply()

    /** Время вечернего дайджеста, минуты от полуночи. */
    var digestAt: LocalTime
        get() = LocalTime.ofSecondOfDay(sp.getInt("digestAt", 20 * 60) * 60L)
        set(v) = sp.edit().putInt("digestAt", v.hour * 60 + v.minute).apply()

    var nextUpOn: Boolean
        get() = sp.getBoolean("nextUpOn", true)
        set(v) = sp.edit().putBoolean("nextUpOn", v).apply()

    /** За сколько минут до конца пары предупредить о следующей. */
    var leadMin: Int
        get() = sp.getInt("leadMin", 5)
        set(v) = sp.edit().putInt("leadMin", v).apply()

    /**
     * Правки расписания: дата -> чьи пары идут (0 = выходной).
     * ponytail: набор строк «2026-09-20=1»; на десяток дат в семестре хватает.
     */
    var shifts: Map<LocalDate, Int>
        get() = (sp.getStringSet("shifts", null) ?: emptySet()).associate {
            val (d, day) = it.split("=")
            LocalDate.parse(d) to day.toInt()
        }
        set(v) = sp.edit()
            .putStringSet("shifts", v.map { "" + it.key + "=" + it.value }.toSet()).apply()

    // Заметка привязана к конкретной дате, а не к паре вообще:
    // домашка на четверг не должна висеть на следующей неделе.
    fun note(id: String, date: LocalDate): String = sp.getString("note:$id:$date", "") ?: ""

    /** Докуда заметку видно на следующих парах. null - у заметок, написанных до этой версии. */
    fun noteUntil(id: String, date: LocalDate): LocalDate? =
        sp.getString("until:$id:$date", null)?.let(LocalDate::parse)

    fun setNote(id: String, date: LocalDate, text: String, until: LocalDate?) =
        sp.edit()
            .putString("note:$id:$date", text.trim())
            .putString("until:$id:$date", until?.toString())
            .apply()
}

/**
 * Заметка с прошлой пары по тому же предмету: её дата и текст.
 * Обычная видна только на следующей паре, помеченная «показывать до» - вплоть до той даты.
 */
fun Prefs.lastNote(schedule: Schedule, l: Lesson, date: LocalDate): Pair<LocalDate, String>? {
    schedule.earlier(l, date).forEachIndexed { i, (p, d) ->
        val text = note(p.id, d)
        val until = noteUntil(p.id, d)
        val visible = if (until != null) !date.isAfter(until) else i == 0
        if (text.isNotEmpty() && visible) return d to text
    }
    return null
}
