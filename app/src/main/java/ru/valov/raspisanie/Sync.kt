package ru.valov.raspisanie

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONException
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.net.URLDecoder

/** Ошибка синхронизации. Текст показывается пользователю как есть. */
class SyncError(msg: String) : Exception(msg)

/**
 * Синхронизация с сервером расписания по контракту docs/api.md.
 * Сервер - любой, лишь бы https и тот же API; по умолчанию наш.
 */
object Sync {
    const val DEFAULT_SERVER = "https://dnui-schedule.hsryata.com"

    // Чужой сервер может прислать что угодно - больше расписанию не нужно.
    private const val LIMIT = 2 shl 20
    private const val NOT_SERVER = "По этому адресу нет сервера расписания"
    private const val BAD_DATA = "Сервер прислал расписание, которое не получилось прочитать"
    private val CODE = Regex("[a-z0-9]{1,32}")
    private val LINK = Regex("(.*)/g/([a-z0-9]{1,32})/?", RegexOption.IGNORE_CASE)

    /** «my.host/» -> «https://my.host». Только https: расписание не должно подменяться по дороге. */
    fun normalizeServer(input: String): String? {
        val s = input.trim().trimEnd('/')
        val u = runCatching { URI(if ("://" in s) s else "https://$s") }.getOrNull() ?: return null
        if (u.scheme != "https" || u.rawAuthority.isNullOrEmpty() || u.rawQuery != null || u.rawFragment != null) {
            return null
        }
        return "https://" + u.rawAuthority + (u.rawPath ?: "").trimEnd('/')
    }

    /**
     * Что ввели в поле подключения: код группы («gtu47z») - на [server],
     * или ссылку-приглашение («https://host/g/gtu47z») - тогда и сервер из неё.
     */
    fun parseTarget(input: String, server: String): Pair<String, String>? {
        val s = input.trim()
        if (CODE.matches(s.lowercase())) return server to s.lowercase()
        val u = runCatching { URI(s) }.getOrNull() ?: return null
        if (u.scheme != "https" || u.rawAuthority == null) return null
        val m = LINK.matchEntire(u.rawPath ?: "") ?: return null
        val base = normalizeServer("https://" + u.rawAuthority + m.groupValues[1]) ?: return null
        return base to m.groupValues[2].lowercase()
    }

    /**
     * Ссылка, которой открыли приложение: https://сервер/g/код (App Links нашего домена)
     * или raspisanie://connect?server=…&group=… - для любого сервера.
     */
    fun parseLink(link: String): Pair<String, String>? {
        val u = runCatching { URI(link) }.getOrNull() ?: return null
        if (u.scheme == "raspisanie") {
            if (u.host != "connect") return null
            val q = (u.rawQuery ?: "").split('&')
                .mapNotNull { it.split('=', limit = 2).takeIf { kv -> kv.size == 2 } }
                .associate { (k, v) -> k to URLDecoder.decode(v, "UTF-8") }
            val server = normalizeServer(q["server"] ?: DEFAULT_SERVER) ?: return null
            // в group ждём код, а не ссылку на третий сервер
            return parseTarget(q["group"] ?: return null, server)?.takeIf { it.first == server }
        }
        return if (u.scheme == "https") parseTarget(link, DEFAULT_SERVER) else null
    }

    /** Группы, открытые для списка: код -> название. */
    suspend fun groups(server: String): List<Pair<String, String>> = withContext(Dispatchers.IO) {
        val (status, body) = get("$server/v1/groups", null)
        if (status != 200) throw SyncError(NOT_SERVER)
        parseGroups(body)
    }

    internal fun parseGroups(body: String): List<Pair<String, String>> = try {
        val a = JSONObject(body).getJSONArray("groups")
        (0 until a.length()).map { a.getJSONObject(it).let { g -> g.getString("code") to g.getString("title") } }
    } catch (e: JSONException) {
        throw SyncError(NOT_SERVER)
    }

    /** Первое подключение: скачивает расписание группы и делает сервер источником. */
    suspend fun connect(ctx: Context, server: String, code: String) = withContext(Dispatchers.IO) {
        val (json, etag) = fetch(server, code, null) ?: throw SyncError(BAD_DATA)
        Schedule.save(ctx, json)
        Prefs(ctx).apply {
            source = "server"
            this.server = server
            group = code
            groupTitle = json.optString("title", code)
            this.etag = etag
            syncedAt = System.currentTimeMillis()
        }
    }

    /** Сверка с сервером при открытии приложения. true - расписание поменялось и уже сохранено. */
    suspend fun refresh(ctx: Context, timeoutMs: Int = 10_000): Boolean = withContext(Dispatchers.IO) {
        val p = Prefs(ctx)
        val code = p.group ?: return@withContext false
        val fresh = fetch(p.server, code, p.etag, timeoutMs)
        // пока качали, могли переключиться на другой источник - тогда ответ уже не нужен
        if (p.source != "server" || p.group != code) return@withContext false
        p.syncedAt = System.currentTimeMillis()
        if (fresh == null) return@withContext false
        Schedule.save(ctx, fresh.first)
        p.etag = fresh.second
        p.groupTitle = fresh.first.optString("title", code)
        true
    }

    fun message(e: Throwable): String = when (e) {
        is SyncError -> e.message ?: BAD_DATA
        is IOException -> "Нет связи с сервером"
        else -> "Не удалось обновить расписание"
    }

    /** Расписание группы и его ETag; null - не менялось с [etag]. */
    private fun fetch(server: String, code: String, etag: String?, timeoutMs: Int = 10_000): Pair<JSONObject, String?>? {
        val (status, body, newTag) = get("$server/v1/groups/$code", etag, timeoutMs)
        return when (status) {
            304 -> null
            // сохраняем только то, что целиком разобралось: битый ответ не затрёт рабочее расписание
            200 -> runCatching { JSONObject(body).also { Schedule.parse(it, emptyMap()) } }
                .getOrElse { throw SyncError(BAD_DATA) } to newTag
            404 -> throw SyncError("Группа «$code» не найдена")
            else -> throw SyncError("Сервер ответил ошибкой $status")
        }
    }

    /** (код ответа, тело, ETag). Тело читаем только у 200. */
    private fun get(url: String, etag: String?, timeoutMs: Int = 10_000): Triple<Int, String, String?> {
        val c = URL(url).openConnection() as HttpURLConnection
        try {
            c.connectTimeout = timeoutMs
            c.readTimeout = timeoutMs
            c.useCaches = false
            c.setRequestProperty("Accept", "application/json")
            if (etag != null) c.setRequestProperty("If-None-Match", etag)
            val status = c.responseCode
            if (status != 200) return Triple(status, "", null)
            return Triple(status, c.inputStream.use(::readLimited), c.getHeaderField("ETag"))
        } finally {
            c.disconnect()
        }
    }

    private fun readLimited(s: InputStream): String {
        val out = ByteArrayOutputStream()
        val buf = ByteArray(8192)
        while (true) {
            val n = s.read(buf)
            if (n < 0) break
            out.write(buf, 0, n)
            if (out.size() > LIMIT) throw SyncError("Сервер прислал слишком большой ответ")
        }
        return out.toString("UTF-8")
    }
}
