package ru.valov.raspisanie

import android.annotation.SuppressLint
import android.net.Uri
import android.view.ViewGroup
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView

/**
 * Веб-админка сервера (/admin/) внутри приложения. Вход - тот же Cloudflare Access с кодом на почту,
 * его cookie WebView хранит сам, так что код вводится раз в сессию Access, как в браузере.
 * ponytail: обёртка над готовой админкой, а не своя на Compose - вторую админку пришлось бы
 * держать в ногу с первой.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun AdminScreen(server: String, onBack: () -> Unit) {
    var web by remember { mutableStateOf<WebView?>(null) }
    // <input type="file"> админки (импорт xlsx): WebView сам системный выбор файла не открывает
    var pick by remember { mutableStateOf<ValueCallback<Array<Uri>>?>(null) }
    val chooser = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        pick?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(it.resultCode, it.data))
        pick = null
    }

    BackHandler { web?.takeIf { it.canGoBack() }?.goBack() ?: onBack() }
    AndroidView(
        factory = { ctx ->
            WebView(ctx).apply {
                // без явного MATCH_PARENT AndroidView отдаёт WRAP_CONTENT, и WebView считает экраном
                // всю высоту страницы: окна <dialog> (position: fixed, по центру) уезжают за край
                layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                webViewClient = WebViewClient()
                // свой WebChromeClient включает и confirm() перед удалением - без него он молча «нет»
                webChromeClient = object : WebChromeClient() {
                    override fun onShowFileChooser(
                        v: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams,
                    ): Boolean {
                        pick?.onReceiveValue(null)
                        pick = cb
                        return runCatching { chooser.launch(params.createIntent()) }
                            .onFailure { pick = null; cb.onReceiveValue(null) }
                            .isSuccess
                    }
                }
                loadUrl("$server/admin/")
                web = this
            }
        },
        onRelease = { it.destroy() },
        modifier = Modifier.fillMaxSize().safeDrawingPadding(),
    )
}
