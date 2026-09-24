package ru.valov.raspisanie

import org.json.JSONArray
import org.json.JSONObject
import org.w3c.dom.Element
import java.io.InputStream
import java.time.LocalDate
import java.util.TreeMap
import java.util.zip.ZipInputStream
import javax.xml.parsers.DocumentBuilderFactory

/** Пн 1-й недели семестра у встроенного расписания: в самом xlsx его нет. ПРОВЕРЬ каждый семестр. */
val WEEK1_MONDAY: LocalDate = LocalDate.of(2026, 8, 31)

/** Файл не похож на выгрузку расписания DNUI. Текст показывается пользователю как есть. */
class ScheduleFormatError(msg: String) : Exception(msg)

// ponytail: словарь в коде. Нет перевода - в приложении останется китайское название.
private val RU = mapOf(
    "汉语口语1" to "Разговорный китайский 1",
    "汉语1" to "Китайский язык 1",
    "面向对象编程基础 I" to "Основы ООП I",
    "前端开发技术 I" to "Frontend-разработка I",
    "数据库原理与技术I" to "Базы данных I",
    "机器学习 I" to "Машинное обучение I",
    "金融大数据分析" to "Большие данные в финансах",
    "概率论与数理统计Ⅱ" to "Теорвер и матстатистика II",
    "体育3" to "Физкультура 3",
)
private val RU_BUILDING = mapOf("A6" to "корпус A6", "A7" to "корпус A7", "体育馆" to "спорткомплекс")
private val RU_ROOM = mapOf("体育馆-羽毛球场" to "спорткомплекс, корт для бадминтона")

private val CN_DAYS = mapOf(
    "星期一" to 1, "星期二" to 2, "星期三" to 3, "星期四" to 4, "星期五" to 5, "星期六" to 6, "星期日" to 7,
)
private val RE_WEEKS = Regex("""(\d+)\s*-\s*(\d+)\s*周\s*(.*)""")
// ponytail: комната = "буквацифра-цифры" либо всё с 体育馆. Хватает на все 3 корпуса.
private val RE_ROOM = Regex("""^[A-Za-z]\d+-\S+$|^体育馆""")
private val RE_PAIR = Regex("""\((\d+)-(\d+)节\)""")
private val RE_TIME = Regex("""(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})""")
private const val REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"

/**
 * xlsx-выгрузка расписания DNUI -> JSON того же вида, что встроенные ассеты.
 * Лист 课表: столбец A - пары («第一大节 (1-2节) 8:00-9:40»), дальше дни недели;
 * в ячейке «предмет / 1-8周 препод / аудитория», объединённая по вертикали - сдвоенная пара.
 * Эталон разбора - fixtures/, с ним же сверяется парсер админки.
 */
object Xlsx {

    fun parse(input: InputStream, week1Monday: LocalDate): JSONObject =
        try {
            parse(unzip(input), week1Monday)
        } catch (e: ScheduleFormatError) {
            throw e
        } catch (e: Exception) {
            throw ScheduleFormatError("Не получилось прочитать файл: " + (e.message ?: e.javaClass.simpleName))
        }

    private class Entry(val name: String?, val from: Int, val to: Int, val teacher: String) {
        var room: String? = null
    }

    private class Found(val e: Entry, val cell: String, val day: Int, val slot: Int, val start: String, var end: String, val span: Int)

    private fun parse(files: Map<String, ByteArray>, week1Monday: LocalDate): JSONObject {
        val sheet = sheet(files)
        val cells = cells(files, sheet)

        // какие ячейки объединены по вертикали -> пара на несколько слотов
        val spans = sheet.all("mergeCell").mapNotNull {
            val (a, b) = it.getAttribute("ref").split(":").map(::ref)
            if (a.second == b.second && b.first > a.first) a to b.first else null
        }.toMap()

        val hdr = (1..10).firstOrNull { r -> cells.any { it.key.first == r && it.value in CN_DAYS } }
            ?: throw ScheduleFormatError("Не нашёл строку с днями недели (星期一, 星期二…) - это точно расписание DNUI?")
        val colDay = cells.filter { it.key.first == hdr && it.value in CN_DAYS }
            .map { it.key.second to CN_DAYS.getValue(it.value) }.toMap().toSortedMap()

        val slots = TreeMap<Int, Pair<String, String>>()
        val found = ArrayList<Found>()
        for (r in hdr + 1..cells.keys.maxOf { it.first }) {
            val (n, start, end) = slot(cells[r to 1] ?: "") ?: continue
            slots[n] = start to end
            for ((col, day) in colDay) {
                val text = cells[r to col]?.takeIf { it.isNotEmpty() } ?: continue
                for (e in cell(text)) {
                    found.add(Found(e, colName(col) + r, day, n, start, end, (spans[r to col] ?: r) - r + 1))
                }
            }
        }
        if (found.isEmpty()) throw ScheduleFormatError("Не распознано ни одной пары")

        val ids = HashSet<String>()
        val lessons = found.onEach { f ->
            // сдвоенная пара -> конец следующего слота
            if (f.span > 1) slots[f.slot + f.span - 1]?.let { f.end = it.second }
        }.sortedWith(compareBy({ it.day }, { it.slot }, { it.e.from })).map { f ->
            val e = f.e
            val name = e.name!!
            val room = e.room
                ?: throw ScheduleFormatError("Ячейка ${f.cell}: у пары «$name» нет аудитории")
            if (e.from !in 1..30 || e.to !in e.from..30)
                throw ScheduleFormatError("Ячейка ${f.cell}: странные недели ${e.from}-${e.to} у пары «$name»")
            val id = "${f.day}-${f.slot}-$name-${e.from}"
            if (!ids.add(id)) throw ScheduleFormatError("Ячейка ${f.cell}: пара «$name» записана дважды")
            val building = room.substringBefore('-')
            JSONObject()
                .put("name", name)
                .put("weeks", JSONArray().put(e.from).put(e.to))
                .put("teacher", e.teacher)
                .put("room", room)
                .put("day", f.day)
                .put("slot", f.slot)
                .put("start", f.start)
                .put("end", f.end)
                .put("building", building)
                .put("name_ru", RU[name] ?: name)
                .put("room_ru", RU_ROOM[room] ?: room)
                .put("building_ru", RU_BUILDING[building] ?: building)
                .put("id", id)
        }

        return JSONObject()
            .put("meta", JSONObject()
                .put("title", cells[1 to 1] ?: "")
                .put("week1_monday", week1Monday.toString())
                .put("weeks", found.maxOf { it.e.to }))
            .put("slots", JSONArray(slots.map { (n, t) ->
                JSONObject().put("n", n).put("start", t.first).put("end", t.second)
            }))
            .put("lessons", JSONArray(lessons))
    }

    /** Ячейка -> список пар. Формат: имя / '1-8周 препод' / [аудитория]. */
    private fun cell(text: String): List<Entry> {
        val out = ArrayList<Entry>()
        var name: String? = null
        for (l in text.split('\n').map { it.trim() }.filter { it.isNotEmpty() }) {
            val m = RE_WEEKS.matchEntire(l)
            when {
                m != null -> {
                    val (from, to, teacher) = m.destructured
                    out.add(Entry(name, from.toInt(), to.toInt(), teacher.trim()))
                    name = null
                }
                // хвостовая аудитория -> всем без своей
                RE_ROOM.containsMatchIn(l) -> out.filter { it.room == null }.forEach { it.room = l }
                else -> name = l
            }
        }
        return out.filter { it.name != null }
    }

    /** '第一大节\n(1-2节)\n8:00-9:40' -> (1, "08:00", "09:40") */
    private fun slot(text: String): Triple<Int, String, String>? {
        val m = RE_PAIR.find(text) ?: return null
        val t = RE_TIME.find(text)?.groupValues ?: return null
        return Triple(
            (m.groupValues[1].toInt() + 1) / 2,
            t[1].padStart(2, '0') + ":" + t[2],
            t[3].padStart(2, '0') + ":" + t[4],
        )
    }

    /** (строка, столбец) -> текст ячейки листа 课表. */
    private fun cells(files: Map<String, ByteArray>, sheet: Element): Map<Pair<Int, Int>, String> {
        val strings = if ("xl/sharedStrings.xml" in files) {
            xml(files, "xl/sharedStrings.xml").all("si").map { si ->
                // rPh - фонетическая подсказка к иероглифам, в текст ячейки не входит
                si.all("t").filter { it.parentNode.localName != "rPh" }.joinToString("") { it.textContent }
            }
        } else emptyList()
        val out = HashMap<Pair<Int, Int>, String>()
        for (c in sheet.all("c")) {
            val v = c.all("v").firstOrNull()?.textContent
            out[ref(c.getAttribute("r"))] = when (c.getAttribute("t")) {
                "s" -> v?.toInt()?.let { strings[it] }
                "inlineStr" -> c.all("t").joinToString("") { it.textContent }
                else -> v
            } ?: continue
        }
        return out
    }

    private fun sheet(files: Map<String, ByteArray>): Element {
        val rid = xml(files, "xl/workbook.xml").all("sheet")
            .firstOrNull { it.getAttribute("name") == "课表" }?.getAttributeNS(REL_NS, "id")
            ?: throw ScheduleFormatError("В файле нет листа «课表» - это не выгрузка расписания DNUI")
        val target = xml(files, "xl/_rels/workbook.xml.rels").all("Relationship")
            .first { it.getAttribute("Id") == rid }.getAttribute("Target")
        return xml(files, if (target.startsWith("/")) target.drop(1) else "xl/$target")
    }

    // ponytail: весь zip в память - выгрузка расписания весит килобайты.
    private fun unzip(input: InputStream): Map<String, ByteArray> {
        val out = HashMap<String, ByteArray>()
        ZipInputStream(input).use { z ->
            while (true) {
                val e = z.nextEntry ?: break
                if (!e.isDirectory) out[e.name] = z.readBytes()
            }
        }
        if ("xl/workbook.xml" !in out) throw ScheduleFormatError("Это не xlsx-файл")
        return out
    }

    private fun xml(files: Map<String, ByteArray>, path: String): Element {
        val bytes = files[path] ?: throw ScheduleFormatError("Файл повреждён: внутри нет $path")
        val f = DocumentBuilderFactory.newInstance()
        f.isNamespaceAware = true
        // DOCTYPE в xlsx не бывает, а внешние сущности из чужого файла грузить незачем.
        // Android такой настройки не знает - но и сущностей не подгружает.
        runCatching { f.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true) }
        return f.newDocumentBuilder().parse(bytes.inputStream()).documentElement
    }

    private fun Element.all(tag: String): List<Element> {
        val nl = getElementsByTagNameNS("*", tag)
        return (0 until nl.length).map { nl.item(it) as Element }
    }

    /** "D12" -> (12, 4) */
    private fun ref(r: String): Pair<Int, Int> {
        val letters = r.takeWhile { it.isLetter() }
        return r.drop(letters.length).toInt() to letters.fold(0) { acc, ch -> acc * 26 + (ch - 'A' + 1) }
    }

    private fun colName(col: Int): String =
        if (col <= 26) ('A' + col - 1).toString() else colName((col - 1) / 26) + ('A' + (col - 1) % 26)
}
