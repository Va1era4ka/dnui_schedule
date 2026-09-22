package ru.valov.raspisanie

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDate

class UiTextTest {

    @Test
    fun `код предмета - аббревиатура, готовое сокращение или обрезка`() {
        assertEquals("БД", shortCode("Базы данных I"))
        assertEquals("БДФ", shortCode("Большие данные в финансах"))
        assertEquals("ООП", shortCode("Основы ООП I"))
        assertEquals("Fron", shortCode("Frontend-разработка I"))
        assertEquals("Физк", shortCode("Физкультура 3"))
    }

    @Test
    fun `аудитория в ячейке - номер без корпуса`() {
        assertEquals("413", shortRoom("A6-413"))
        assertEquals("спорткомплекс", shortRoom("спорткомплекс"))
    }

    @Test
    fun `подряд идущие правки расписания - одна строка`() {
        val shifts = (1..7).associate { LocalDate.of(2026, 10, it) to 0 } +
            mapOf(LocalDate.of(2026, 9, 20) to 1, LocalDate.of(2026, 10, 10) to 0)
        assertEquals(
            listOf(
                "вс, 20 сентября · пары за понедельник",
                "1–7 октября · выходные",
                "сб, 10 октября · выходной",
            ),
            shiftRanges(shifts).map { it.label },
        )
    }

    @Test
    fun `заголовок дня - вчера, сегодня, завтра или день недели`() {
        val today = LocalDate.of(2026, 9, 22)   // вторник
        assertEquals("Сегодня", dayTitle(today, today))
        assertEquals("Завтра", dayTitle(today.plusDays(1), today))
        assertEquals("Вчера", dayTitle(today.minusDays(1), today))
        assertEquals("Пятница", dayTitle(today.plusDays(3), today))
    }

    @Test
    fun `остаток времени - часы и минуты`() {
        assertEquals("48 мин", humanMinutes(48))
        assertEquals("1 ч 08 мин", humanMinutes(68))
        assertEquals("2 ч 00 мин", humanMinutes(120))
    }
}
