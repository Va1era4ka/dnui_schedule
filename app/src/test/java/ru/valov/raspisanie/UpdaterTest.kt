package ru.valov.raspisanie

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class UpdaterTest {
    private val json = """
        {"tag_name":"v1.4","name":"v1.4","assets":[
          {"name":"dnui-schedule-1.4.apk",
           "browser_download_url":"https://github.com/x/y/releases/download/v1.4/dnui-schedule-1.4.apk"}
        ]}
    """.trimIndent()

    @Test fun parsesTagAndAsset() {
        val r = Updater.parse(json)!!
        assertEquals("1.4", r.version)
        assertEquals(
            "https://github.com/x/y/releases/download/v1.4/dnui-schedule-1.4.apk",
            r.apkUrl,
        )
    }

    @Test fun noReleaseYet() {
        assertNull(Updater.parse("""{"message":"Not Found"}"""))
    }

    @Test fun releaseWithoutApk() {
        assertNull(Updater.parse("""{"tag_name":"v2","assets":[]}""")!!.apkUrl)
    }
}
