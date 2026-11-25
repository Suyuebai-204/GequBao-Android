package com.yygzs.gqbs

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Flyme 状态栏歌词 Capacitor 桥接层：Vue 侧 setLyric / clearLyric / isFlymeSupport。
 * 原生侧复用 MusicControlsPlugin 的同一条前台媒体通知，不新建通知。
 */
@CapacitorPlugin(name = "FlymeLyric")
class FlymeLyricPlugin : Plugin() {

    override fun load() {
        super.load()
        // 尽早完成反射探测；context 在 Bridge 初始化早期可能未就绪，失败不影响后续调用
        try {
            FlymeLyric.checkSupport(context.applicationContext)
        } catch (_: Exception) {
            /* ignore */
        }
    }

    /** 推送一行歌词。playing 决定状态栏歌词左侧的播放/暂停小图标 */
    @PluginMethod
    fun setLyric(call: PluginCall) {
        val text = call.getString("text", "") ?: ""
        val playing = call.getBoolean("playing", true) ?: true
        FlymeLyric.setLyric(text, playing)
        refreshNotification(onlyTicker = text.isNotBlank())
        call.resolve()
    }

    @PluginMethod
    fun clearLyric(call: PluginCall) {
        FlymeLyric.clearLyric()
        // 重建完整通知（不带 ONLY_UPDATE_TICKER），确保状态栏旧歌词被移除
        refreshNotification(onlyTicker = false)
        call.resolve()
    }

    @PluginMethod
    fun isFlymeSupport(call: PluginCall) {
        val res = JSObject()
        res.put("support", FlymeLyric.checkSupport(appContext()))
        call.resolve(res)
    }

    /** Android 13+ 动态申请通知权限，否则媒体通知/状态栏歌词都会被系统拦截 */
    @PluginMethod
    fun requestNotificationPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= 33) {
            val activity = context as? Activity
            if (activity != null &&
                ContextCompat.checkSelfPermission(
                    activity,
                    Manifest.permission.POST_NOTIFICATIONS
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                try {
                    ActivityCompat.requestPermissions(
                        activity,
                        arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                        REQ_POST_NOTIFICATIONS
                    )
                } catch (_: Exception) { /* ignore */ }
            }
        }
        call.resolve()
    }

    private fun appContext(): Context = try {
        context.applicationContext
    } catch (_: Exception) {
        context
    }

    private fun refreshNotification(onlyTicker: Boolean) {
        if (!FlymeLyric.checkSupport(appContext())) return
        try {
            postMusicNotification(appContext(), onlyTicker)
        } catch (_: Exception) {
            /* 通知不可用时静默降级，不影响播放 */
        }
    }

    companion object {
        private const val REQ_POST_NOTIFICATIONS = 9137
    }
}
