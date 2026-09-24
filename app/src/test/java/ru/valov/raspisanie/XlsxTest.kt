package ru.valov.raspisanie

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.util.zip.ZipFile

class XlsxTest {

    // Эталон - то, что выдавал parse.py до переезда на Kotlin; парсер админки сверяется с ним же.
    @Test fun `xlsx из fixtures разбирается ровно в эталонный JSON`() {
        for (k in 1..2) {
            val got = File("../fixtures/schedule.$k.xlsx").inputStream().use { Xlsx.parse(it, WEEK1_MONDAY) }
            val want = JSONObject(File("../fixtures/schedule.$k.json").readText())
            assertTrue("$k: meta", want.getJSONObject("meta").similar(got.getJSONObject("meta")))
            assertTrue("$k: slots", want.getJSONArray("slots").similar(got.getJSONArray("slots")))
            val w = want.getJSONArray("lessons")
            val g = got.getJSONArray("lessons")
            assertEquals("$k: число пар", w.length(), g.length())
            for (i in 0 until w.length()) {
                assertTrue("$k:\n${w[i]}\n${g[i]}", w.getJSONObject(i).similar(g.getJSONObject(i)))
            }
        }
    }

    @Test fun `встроенные xlsx - без списка студентов и с переводом всех предметов`() {
        for (f in File("src/main/assets").listFiles { f -> f.extension == "xlsx" }!!) {
            // в выгрузке есть лист 学生名单 с ФИО и номерами студенческих - в APK ему не место
            val wb = ZipFile(f).use { z -> z.getInputStream(z.getEntry("xl/workbook.xml")).readBytes().decodeToString() }
            assertEquals(f.name + ": лишние листы, оставь только 课表", 1, Regex("<sheet ").findAll(wb).count())

            val ls = f.inputStream().use { Xlsx.parse(it, WEEK1_MONDAY) }.getJSONArray("lessons")
            val miss = (0 until ls.length()).map { ls.getJSONObject(it) }
                .filter { it.getString("name") == it.getString("name_ru") }.map { it.getString("name") }.toSet()
            assertTrue(f.name + ": нет перевода, допиши в RU в Xlsx.kt: $miss", miss.isEmpty())
        }
    }

    @Test fun `не xlsx - понятная ошибка, а не падение`() {
        val e = assertThrows(ScheduleFormatError::class.java) {
            Xlsx.parse("просто текст".byteInputStream(), WEEK1_MONDAY)
        }
        assertEquals("Это не xlsx-файл", e.message)
    }
}
