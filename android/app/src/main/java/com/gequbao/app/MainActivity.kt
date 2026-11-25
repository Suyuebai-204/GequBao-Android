package com.yygzs.gqbs

import android.os.Bundle
import android.webkit.WebSettings
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // 注册自定义原生插件（后台播放控制 + 媒体库/HTTP 代理 + 状态栏控制）
        registerPlugin(GequbaoPlugin::class.java)
        registerPlugin(MusicControlsPlugin::class.java)
        registerPlugin(FlymeLyricPlugin::class.java)
        registerPlugin(BaiduStatPlugin::class.java)
        super.onCreate(savedInstanceState)

        // 尽早把系统级 TV 判定注入 WebView；JS 侧还会通过 Gequbao.isTv() 再确认一次，
        // 避免注入时机晚于页面脚本时漏判。
        try {
            val tv = GequbaoPlugin.isTvDevice(this)
            bridge.webView.evaluateJavascript(
                "window.__GQB_TV_NATIVE__=$tv;window.isTV=$tv;",
                null
            )
        } catch (_: Exception) {
        }

        try {
            val settings = bridge.webView.settings
            // 允许混合内容（http 封面/直链在 https 容器内可正常加载，避免软件内封面不显示）
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            // 遵循服务端 Cache-Control 复用图片/静态资源，避免页面重开时重复下载
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            settings.domStorageEnabled = true
        } catch (_: Exception) {
        }
    }
}
