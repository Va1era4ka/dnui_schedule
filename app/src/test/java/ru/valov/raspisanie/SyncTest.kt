package ru.valov.raspisanie

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
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
    }
}
