package ru.valov.raspisanie

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime

/**
 * ponytail: одна проверка на всю логику будильников. Ломается расчёт недели,
 * порядок событий или пропуск пустого дня - падает здесь.
 */
class NotifierTest {

    private fun lesson(day: Int, slot: Int, from: String, to: String, name: String,
                       w: IntRange = 1..16) = Lesson(
        id = "$day-$slot-$name", day = day, slot = slot,
        start = LocalTime.parse(from), end = LocalTime.parse(to),
        name = name, nameRu = name, teacher = "t", room = "A6-1", roomRu = "A6-1",
        building = "A6", weekFrom = w.first, weekTo = w.last,
    )

    // Пн: две пары. Вт: одна. Ср: одна, только первые 8 недель. Чт и Пт пустые.
    private val s = Schedule(
        LocalDate.parse("2026-08-31"),
        listOf(
            lesson(1, 1, "08:00", "09:40", "первая"),
            lesson(1, 2, "10:00", "11:40", "вторая"),
            lesson(2, 1, "08:00", "09:40", "вторник"),
            lesson(3, 1, "08:00", "09:40", "среда", 1..8),
        ),
    )

    private val digestAt: LocalTime = LocalTime.of(20, 0)

    private fun next(now: String) =
        nextEvent(s, LocalDateTime.parse(now), true, digestAt, true, 5)

    @Test fun `неделя считается от первого понедельника`() {
        assertEquals(1, s.weekOf(LocalDate.parse("2026-08-31")))
        assertEquals(1, s.weekOf(LocalDate.parse("2026-09-06")))   // вс той же недели
        assertEquals(3, s.weekOf(LocalDate.parse("2026-09-16")))
    }

    @Test fun `диапазон недель отсекает предмет`() {
        assertEquals(1, s.on(LocalDate.parse("2026-09-02")).size)       // неделя 1, среда
        assertTrue(s.on(LocalDate.parse("2026-11-04")).isEmpty())       // неделя 10, среда
    }

    @Test fun `во время первой пары ждём сигнал за 5 минут до её конца`() {
        val e = next("2026-08-31T08:30") as NextUp
        assertEquals(LocalDateTime.parse("2026-08-31T09:35"), e.at)
        assertEquals("первая", e.current.name)
        assertEquals("вторая", e.next?.name)
    }

    @Test fun `у последней пары дня следующей нет`() {
        val e = next("2026-08-31T10:30") as NextUp
        assertEquals(LocalDateTime.parse("2026-08-31T11:35"), e.at)
        assertEquals(null, e.next)
    }

    @Test fun `после пар ближайшее - вечерний дайджест про завтра`() {
        val e = next("2026-08-31T12:00") as Digest
        assertEquals(LocalDateTime.parse("2026-08-31T20:00"), e.at)
        assertEquals(LocalDate.parse("2026-09-01"), e.forDate)
    }

    @Test fun `дайджест молчит, если завтра пар нет`() {
        // Вт вечер: среда есть -> дайджест. Ср вечер: четверг пуст -> пропуск,
        // ближайшее уезжает на вс перед понедельником.
        assertEquals(
            LocalDateTime.parse("2026-09-06T20:00"),
            (next("2026-09-02T12:00") as Digest).at,
        )
    }

    @Test fun `выключенные типы не стреляют`() {
        assertEquals(null, nextEvent(s, LocalDateTime.parse("2026-08-31T12:00"),
            false, digestAt, false, 5))
    }
}
