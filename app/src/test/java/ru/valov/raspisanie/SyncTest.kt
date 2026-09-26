package ru.valov.raspisanie

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.time.LocalDate

class SyncTest {
    private val def = Sync.DEFAULT_SERVER

    @Test fun `код группы - на текущий сервер, заглавные с экрана не мешают`() {
        assertEquals(def to "gtu47z", Sync.parseTarget("  GTU47Z ", def))
        assertEquals("https://my.host" to "abc", Sync.parseTarget("abc", "https://my.host"))
    }

    @Test fun `ссылка-приглашение задаёт и сервер, и группу`() {
        assertEquals(def to "gtu47z", Sync.parseTarget("https://dnui-schedule.hsryata.com/g/gtu47z", def))
        assertEquals("https://my.host/sub" to "abc", Sync.parseTarget("https://my.host/sub/g/abc/", def))
    }

    @Test fun `не https и мусор не принимаются`() {
        assertNull(Sync.parseTarget("http://my.host/g/abc", def))
        assertNull(Sync.parseTarget("привет", def))
        assertNull(Sync.parseTarget("https://my.host/groups", def))
        assertNull(Sync.normalizeServer("http://my.host"))
        assertEquals("https://my.host", Sync.normalizeServer(" my.host/ "))
        assertEquals("https://my.host:8443/api", Sync.normalizeServer("https://my.host:8443/api/"))
    }

    @Test fun `список групп, а чужой JSON - понятная ошибка`() {
        assertEquals(
            listOf("gtu47z" to "Класс 1"),
            Sync.parseGroups("""{"groups":[{"code":"gtu47z","title":"Класс 1"}]}"""),
        )
        val e = assertThrows(SyncError::class.java) { Sync.parseGroups("""{"hello":"world"}""") }
        assertEquals("По этому адресу нет сервера расписания", e.message)
    }

    @Test fun `переносы с сервера - основа, свои поверх`() {
        val root = JSONObject(
            """{"meta":{"week1_monday":"2026-08-31"},"lessons":[],
               "shifts":{"2026-10-01":0,"2026-10-02":0}}"""
        )
        val s = Schedule.parse(root, mapOf(LocalDate.parse("2026-10-02") to 5))
        assertTrue(s.isHoliday(LocalDate.parse("2026-10-01")))
        assertFalse(s.isHoliday(LocalDate.parse("2026-10-02")))
        // настройкам - только серверные: свои там и так есть, с крестиком
        assertEquals(setOf(LocalDate.parse("2026-10-01"), LocalDate.parse("2026-10-02")), s.groupShifts.keys)
    }

    @Test fun `правка на дату - отмена и замена только в свою дату`() {
        val id = "4-3-金融大数据分析-1"
        val repl = JSONObject(File("../fixtures/schedule.1.json").readText()).getJSONArray("lessons")
            .let { a -> (0 until a.length()).map { a.getJSONObject(it) }.first { it.getString("id") == id } }
            .put("name_ru", "Физкультура").put("room", "спортзал")
        val root = JSONObject(File("../fixtures/schedule.1.json").readText()).put(
            "changes",
            JSONObject().put("2026-10-08", JSONObject().put(id, JSONObject.NULL))
                .put("2026-10-15", JSONObject().put(id, repl).put("нет-такой", JSONObject.NULL)),
        )
        val s = Schedule.parse(root, emptyMap())
        fun at(d: String) = s.on(LocalDate.parse(d)).firstOrNull { it.id == id }
        assertNull(at("2026-10-08"))
        assertEquals("Физкультура", at("2026-10-15")?.nameRu)
        assertEquals("спортзал", at("2026-10-15")?.room)
        assertEquals(4, at("2026-10-15")?.day)
        // через неделю - снова по расписанию
        assertEquals(s.lessons.first { it.id == id }, at("2026-10-22"))
    }

    @Test fun `ссылки-приглашения - App Links нашего домена и raspisanie для любого сервера`() {
        assertEquals(def to "gtu47z", Sync.parseLink("https://dnui-schedule.hsryata.com/g/gtu47z"))
        assertEquals(
            "https://my.host" to "abc",
            Sync.parseLink("raspisanie://connect?server=https%3A%2F%2Fmy.host&group=abc"),
        )
        assertEquals(def to "abc", Sync.parseLink("raspisanie://connect?group=abc"))
        assertNull(Sync.parseLink("raspisanie://connect?server=http%3A%2F%2Fevil&group=abc"))
        assertNull(Sync.parseLink("raspisanie://connect?group=https%3A%2F%2Fother%2Fg%2Fabc"))
        assertNull(Sync.parseLink("raspisanie://other?group=abc"))
    }

    @Test fun `домашка видна на следующей паре по предмету, с пометкой до - вплоть до даты`() {
        val root = JSONObject(File("../fixtures/schedule.1.json").readText()).put(
            "homework",
            org.json.JSONArray(
                """[{"lesson":"1-4-概率论与数理统计Ⅱ-1","date":"2026-09-21","text":"задачи 1-5","until":null},
                    {"lesson":"4-3-金融大数据分析-1","date":"2026-09-24","text":"глава 2","until":"2026-10-08"}]"""
            ),
        )
        val s = Schedule.parse(root, emptyMap())
        fun at(id: String) = s.lessons.first { it.id == id }
        val tv = at("4-4-概率论与数理统计Ⅱ-1")          // теорвер по четвергам
        assertEquals("задачи 1-5", s.homeworkFor(tv, LocalDate.parse("2026-09-24"))?.second)
        // следующая пара по теорверу уже в понедельник - без пометки «до» дальше не тянется
        assertNull(s.homeworkFor(at("1-4-概率论与数理统计Ⅱ-1"), LocalDate.parse("2026-09-28")))

        val bd = at("4-3-金融大数据分析-1")
        assertEquals("глава 2", s.homeworkAt(bd, LocalDate.parse("2026-09-24"))?.text)
        assertEquals("глава 2", s.homeworkFor(bd, LocalDate.parse("2026-10-08"))?.second)
        assertNull(s.homeworkFor(bd, LocalDate.parse("2026-10-15")))
    }
}
