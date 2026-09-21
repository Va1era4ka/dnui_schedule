package ru.valov.raspisanie

import org.junit.Assert.assertEquals
import org.junit.Test

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
    fun `остаток времени - часы и минуты`() {
        assertEquals("48 мин", humanMinutes(48))
        assertEquals("1 ч 08 мин", humanMinutes(68))
        assertEquals("2 ч 00 мин", humanMinutes(120))
    }
}
