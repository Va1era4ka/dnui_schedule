package ru.valov.raspisanie

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId

sealed interface Event {
    val at: LocalDateTime
}

/** Вечером: что будет завтра. */
data class Digest(override val at: LocalDateTime, val forDate: LocalDate) : Event

/** За N минут до конца пары: какая следующая. */
data class NextUp(
    override val at: LocalDateTime,
    val current: Lesson,
    val next: Lesson?,
) : Event

/**
 * Ближайшее событие после [now]. Чистая функция - вся логика уведомлений тут,
 * поэтому её и проверяет NotifierTest.
 */
fun nextEvent(
    s: Schedule,
    now: LocalDateTime,
    digestOn: Boolean,
    digestAt: LocalTime,
    nextUpOn: Boolean,
    leadMin: Int,
): Event? = (0L..14L).flatMap { off ->
    val date = now.toLocalDate().plusDays(off)
    val events = ArrayList<Event>()
    // Молчим, если завтра пар нет - иначе каждую пятницу прилетает "завтра ничего".
    if (digestOn && s.on(date.plusDays(1)).isNotEmpty()) {
        events.add(Digest(date.atTime(digestAt), date.plusDays(1)))
    }
    if (nextUpOn) {
        val today = s.on(date)
        today.forEachIndexed { i, l ->
            events.add(
                NextUp(
                    date.atTime(l.end).minusMinutes(leadMin.toLong()),
                    l,
                    today.getOrNull(i + 1),
                )
            )
        }
    }
    events
}.filter { it.at.isAfter(now) }.minByOrNull { it.at }

object Notifier {

    private const val CHANNEL = "lessons"
    private const val REQ = 100
    private const val NL = "\n"

    fun title(e: Event): String = when (e) {
        is Digest -> "Завтра"
        is NextUp -> if (e.next == null) "Последняя пара" else "Следующая пара"
    }

    fun text(e: Event, s: Schedule, prefs: Prefs): String = when (e) {
        is Digest -> s.on(e.forDate).joinToString(NL) { l -> line(s, prefs, l, e.forDate) }
        is NextUp -> {
            val n = e.next
            if (n == null) e.current.nameRu + " скоро закончится, дальше пар нет"
            else line(s, prefs, n, e.at.toLocalDate())
        }
    }

    /** Своя заметка на эту дату, а нет - что записали на прошлой такой паре. */
    private fun line(s: Schedule, prefs: Prefs, l: Lesson, date: LocalDate): String {
        val head = l.start.toString() + " " + l.nameRu + " - " + l.roomRu
        val own = prefs.note(l.id, date)
        if (own.isNotEmpty()) return head + NL + "Заметка: " + own
        val last = prefs.lastNote(s, l, date) ?: return head
        return head + NL + "С прошлой пары: " + last.second
    }

    fun notify(ctx: Context, e: Event, body: String) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, "Пары", NotificationManager.IMPORTANCE_HIGH)
        )
        val open = PendingIntent.getActivity(
            ctx, 0, Intent(ctx, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val n = Notification.Builder(ctx, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_menu_my_calendar)
            .setContentTitle(title(e))
            .setContentText(body.lineSequence().first())
            .setStyle(Notification.BigTextStyle().bigText(body))
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        nm.notify(if (e is Digest) 1 else 2, n)
    }

    /** Ставит будильник на ближайшее событие. Вызывать после любой правки настроек. */
    fun schedule(ctx: Context) {
        val prefs = Prefs(ctx)
        val s = Schedule.load(ctx, prefs.klass)
        val e = nextEvent(
            s, LocalDateTime.now(), prefs.digestOn, prefs.digestAt, prefs.nextUpOn, prefs.leadMin
        ) ?: return
        val am = ctx.getSystemService(AlarmManager::class.java)
        val pi = PendingIntent.getBroadcast(
            ctx, REQ, Intent(ctx, AlarmReceiver::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val ms = e.at.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
        val exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()
        if (exact) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, ms, pi)
        } else {
            // Без разрешения "Будильники и напоминания" Doze может задержать на ~15 минут.
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, ms, pi)
        }
    }
}

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val prefs = Prefs(ctx)
        val s = Schedule.load(ctx, prefs.klass)
        // now минус минута: событие, ради которого нас разбудили, ещё "в будущем".
        val now = LocalDateTime.now()
        val e = nextEvent(
            s, now.minusMinutes(1), prefs.digestOn, prefs.digestAt, prefs.nextUpOn, prefs.leadMin
        )
        if (e != null && !e.at.isAfter(now.plusMinutes(1))) {
            Notifier.notify(ctx, e, Notifier.text(e, s, prefs))
        }
        Notifier.schedule(ctx)   // сразу заводим следующий
    }
}

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        // Обновились - скачанный APK в кэше больше не нужен.
        if (intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) Updater.clearDownload(ctx)
        Notifier.schedule(ctx)
    }
}
