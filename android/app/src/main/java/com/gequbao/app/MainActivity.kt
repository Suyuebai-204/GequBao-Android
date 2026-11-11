package com.yygzs.gqbs

import android.os.Bundle
import android.webkit.WebSettings
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // 注册自定义原生插件（后台播放控制 + 媒体库/HTTP 代理 + 状态栏控制）
        registerPlugin(GequbaoPlugin::class.java)
        registerPlugin(MusicControlsPlugin::class.java)
        super.onCreate(savedInstanceState)

        // 允许混合内容（http 封面/直链在 https 容器内可正常加载，避免软件内封面不显示）
        try {
            bridge.webView.settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        } catch (_: Exception) {
        }
    }
}
