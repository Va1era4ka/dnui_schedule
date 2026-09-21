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

    fun setNote(id: String, date: LocalDate, text: String) =
        sp.edit().putString("note:$id:$date", text.trim()).apply()
}

/** Заметка с ближайшей прошлой пары по тому же предмету: её дата и текст. */
fun Prefs.lastNote(schedule: Schedule, l: Lesson, date: LocalDate): Pair<LocalDate, String>? =
    schedule.earlier(l, date)
        .map { (p, d) -> d to note(p.id, d) }
        .firstOrNull { it.second.isNotEmpty() }
