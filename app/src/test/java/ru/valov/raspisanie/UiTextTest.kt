package ru.valov.raspisanie

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.json.JSONObject
import java.io.File
import java.time.LocalDate
import java.time.LocalTime

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

    @Test
    fun `пара по сетке - 45 + 10 + 45, сдвоенная - две таких через перемену, своя из админки`() {
        val root = JSONObject(File("../fixtures/schedule.1.json").readText())
        val s = Schedule.parse(root, emptyMap())
        val single = s.lessons.first { it.end.toString() == "09:40" }
        val double = s.lessons.first { it.end.toString() == "11:40" && it.start.toString() == "08:00" }
        assertEquals(listOf(45, 10, 45), single.parts)
        assertEquals(listOf(45, 10, 45, 20, 45, 10, 45), double.parts)
        assertEquals("45 мин · перемена 10 · 45 мин", single.structure)
        assertEquals("Сдвоенная: 08:00–09:40 и 10:00–11:40\nв каждой 45 мин · перемена 10 · 45 мин", double.structure)

        fun at(t: String) = double.phase(LocalTime.parse(t))
        assertEquals("Перемена в 08:45", at("08:30"))
        assertEquals("Перемена до 08:55", at("08:50"))
        assertEquals("Первая пара до 09:40", at("09:00"))
        assertEquals("Большая перемена до 10:00", at("09:45"))
        assertEquals("Перемена в 10:45", at("10:10"))
        assertNull(at("11:00"))          // дальше перемен нет - хватает «осталось»
        assertNull(at("07:59"))
        assertEquals(listOf(0.45f..0.55f), single.breakFractions)

        // своя раскладка из админки, если сходится по длине; не сходится - по сетке
        val o = root.getJSONArray("lessons").getJSONObject(0)
        assertEquals("08:00", o.getString("start"))
        o.put("end", "09:30").put("parts", org.json.JSONArray(listOf(40, 5, 45)))
        assertEquals(listOf(40, 5, 45), Schedule.parse(root, emptyMap()).lessons[0].parts)
        o.put("parts", org.json.JSONArray(listOf(40, 5)))
        assertEquals(emptyList<Int>(), Schedule.parse(root, emptyMap()).lessons[0].parts)  // 09:30 - не по сетке
        assertNull(Schedule.parse(root, emptyMap()).lessons[0].structure)
    }
}
