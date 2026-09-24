package ru.valov.raspisanie

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
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

/** За [SOON_MIN] минут до начала первой пары дня или пары после большой перемены. */
data class Soon(override val at: LocalDateTime, val lesson: Lesson) : Event

const val SOON_MIN = 20L

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
            // Обычная перемена 20 минут - там хватает NextUp с прошлой пары.
            val prev = today.getOrNull(i - 1)
            if (prev == null || prev.end.plusMinutes(SOON_MIN).isBefore(l.start)) {
                events.add(Soon(date.atTime(l.start).minusMinutes(SOON_MIN), l))
            }
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
        is Soon -> "Через $SOON_MIN минут пара"
    }

    fun text(e: Event, s: Schedule, prefs: Prefs): String = when (e) {
        is Digest -> s.on(e.forDate).joinToString(NL) { l -> line(s, prefs, l, e.forDate) }
        is NextUp -> {
            val n = e.next
            if (n == null) e.current.nameRu + " скоро закончится, дальше пар нет"
            else line(s, prefs, n, e.at.toLocalDate())
        }
        is Soon -> line(s, prefs, e.lesson, e.at.toLocalDate())
    }

    /**
     * Строка в свёрнутом уведомлении. У дайджеста там счётчики домашки и заметок,
     * иначе они видны только если развернуть.
     */
    fun summary(e: Event, s: Schedule, prefs: Prefs, body: String): String {
        if (e !is Digest) return body.lineSequence().first()
        val today = s.on(e.forDate)
        val notes = today.count { noteLine(s, prefs, it, e.forDate) != null }
        val homework = today.count { s.homeworkFor(it, e.forDate) != null }
        return listOfNotNull(
            "Первая пара в " + today.first().start,
            "домашка: $homework".takeIf { homework > 0 },
            "заметок: $notes".takeIf { notes > 0 },
        ).joinToString(" · ")
    }

    private fun line(s: Schedule, prefs: Prefs, l: Lesson, date: LocalDate): String {
        val head = l.start.toString() + " " + l.nameRu + " - " + l.roomRu
        val homework = s.homeworkFor(l, date)?.let { "Домашка: " + it.second }
        return listOfNotNull(head, homework, noteLine(s, prefs, l, date)).joinToString(NL)
    }

    /** Своя заметка на эту дату, а нет - что записали на прошлой такой паре. */
    private fun noteLine(s: Schedule, prefs: Prefs, l: Lesson, date: LocalDate): String? {
        val own = prefs.note(l.id, date)
        if (own.isNotEmpty()) return "Заметка: " + own
        val last = prefs.lastNote(s, l, date) ?: return null
        return "С прошлой пары: " + last.second
    }

    fun notify(ctx: Context, e: Event, body: String, short: String) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, "Пары", NotificationManager.IMPORTANCE_HIGH)
        )
        val open = PendingIntent.getActivity(
            ctx, 0, Intent(ctx, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val n = Notification.Builder(ctx, CHANNEL)
            // Маленькая иконка у Android - одноцветная маска, цветная картинка стала бы белым
            // квадратом. Поэтому там силуэт, а сама иконка приложения крупная, в теле уведомления.
            .setSmallIcon(R.drawable.ic_notification)
            .setLargeIcon(Icon.createWithResource(ctx, R.mipmap.ic_launcher_bg))
            .setContentTitle(title(e))
            .setContentText(short)
            .setStyle(Notification.BigTextStyle().bigText(body))
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        nm.notify(if (e is Digest) 1 else 2, n)
    }

    /** Ставит будильник на ближайшее событие. Вызывать после любой правки настроек. */
    fun schedule(ctx: Context) {
        val prefs = Prefs(ctx)
        if (prefs.source == null) return   // онбординг не пройден - напоминать не о чем
        val s = Schedule.load(ctx)
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
        val s = Schedule.load(ctx)
        // now минус минута: событие, ради которого нас разбудили, ещё "в будущем".
        val now = LocalDateTime.now()
        val e = nextEvent(
            s, now.minusMinutes(1), prefs.digestOn, prefs.digestAt, prefs.nextUpOn, prefs.leadMin
        )
        if (e != null && !e.at.isAfter(now.plusMinutes(1))) {
            val body = Notifier.text(e, s, prefs)
            Notifier.notify(ctx, e, body, Notifier.summary(e, s, prefs, body))
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
