package ru.valov.raspisanie

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * Обновление по фетчу: версия и запасная ссылка - из последнего релиза на GitHub,
 * сам APK - с зеркала в R2, туда же его кладёт workflow.
 */
object Updater {
    private const val API =
        "https://api.github.com/repos/Va1era4ka/dnui_schedule/releases/latest"
    private const val MIRROR = "https://svin-assets.hsryata.com/dnui-app-release/"
    private const val LATEST = MIRROR + "dnui-schedule-latest.apk"

    data class Release(val version: String, val apkUrl: String?)

    // ponytail: два поля регуляркой вместо JSON-парсера - ответ GitHub стабилен,
    // а так парсер тестируется без org.json, который в unit-тестах замокан.
    private val TAG_RE = Regex("\"tag_name\"\\s*:\\s*\"v?([^\"]+)\"")
    private val APK_RE = Regex("\"browser_download_url\"\\s*:\\s*\"([^\"]+\\.apk)\"")

    fun parse(json: String): Release? {
        val v = TAG_RE.find(json)?.groupValues?.get(1) ?: return null
        return Release(v, APK_RE.find(json)?.groupValues?.get(1))
    }

    fun installed(ctx: Context): String =
        ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName ?: "dev"

    /** Проверяет, качает и отдаёт APK системному установщику. Возвращает строку для UI. */
    suspend fun update(ctx: Context): String = withContext(Dispatchers.IO) {
        // Приватный репозиторий отвечает 404, сеть может отвалиться - тогда версию
        // узнать негде: качаем latest с зеркала, а разницу версий покажет установщик.
        val r = runCatching { parse(get(API)) }.getOrNull()
            ?: run {
                install(ctx, download(ctx, LATEST))
                return@withContext "GitHub не ответил, ставим latest с зеркала"
            }
        // ponytail: сравнение строк, а не версий - на master стоит master-<N>,
        // он не равен тегу и апдейт предложится; порядковое сравнение нужно
        // только если появятся ветки релизов.
        if (r.version == installed(ctx)) return@withContext "Уже последняя: " + r.version
        // Сначала зеркало: оно раздаёт с CDN и не упирается в лимиты GitHub.
        install(ctx, download(ctx, MIRROR + "dnui-schedule-" + r.version + ".apk", r.apkUrl, LATEST))
        "Ставим " + r.version
    }

    /**
     * Автопроверка: раз в неделю спрашивает GitHub, вышла ли новая версия.
     * null - рано, нечего ставить или сеть не ответила (тогда спросим на следующем запуске).
     * ponytail: проверка при открытии приложения, без WorkManager - его и так открывают каждый день.
     */
    suspend fun weekly(ctx: Context, prefs: Prefs): Release? = withContext(Dispatchers.IO) {
        // master-<N> и dev новее любого релиза: «обновление» до релиза было бы откатом,
        // который Android всё равно не поставит. Их обновляют кнопкой.
        val v = installed(ctx)
        if (v == "dev" || v.startsWith("master-")) return@withContext null
        val now = System.currentTimeMillis()
        if (now - prefs.updateCheckedAt < 7 * 24 * 3600_000L) return@withContext null
        val r = runCatching { parse(get(API)) }.getOrNull() ?: return@withContext null
        prefs.updateCheckedAt = now
        r.takeIf { it.version != v }
    }

    /** Скачанный APK после установки не нужен: зовётся по MY_PACKAGE_REPLACED. */
    fun clearDownload(ctx: Context) {
        apk(ctx).delete()
    }

    private fun apk(ctx: Context) = File(ctx.cacheDir, "update.apk")

    private fun get(url: String): String = open(url).bufferedReader().use { it.readText() }

    private fun download(ctx: Context, vararg urls: String?): File {
        val out = apk(ctx)
        var last: IOException? = null
        for (url in urls.filterNotNull()) {
            try {
                open(url).use { input -> out.outputStream().use { input.copyTo(it) } }
                return out
            } catch (e: IOException) {
                last = e
            }
        }
        throw last ?: IOException("нет ссылки на APK")
    }

    private fun install(ctx: Context, apk: File) {
        val uri = FileProvider.getUriForFile(ctx, ctx.packageName + ".files", apk)
        ctx.startActivity(
            Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    }

    private fun open(url: String) = (URL(url).openConnection() as HttpURLConnection).run {
        connectTimeout = 10_000
        readTimeout = 30_000
        setRequestProperty("Accept", "application/vnd.github+json")
        if (responseCode !in 200..299) throw IOException(url + " -> " + responseCode)
        inputStream
    }
}
