package com.yygzs.gqbs

import android.app.Notification
import android.content.Context

/**
 * Flyme（魅族）状态栏歌词核心逻辑。
 *
 * 原理：Flyme 把媒体通知的 tickerText 渲染为状态栏歌词，并依赖两个系统隐藏 Flag：
 * - FLAG_ALWAYS_SHOW_TICKER：让 Ticker 常驻状态栏
 * - FLAG_ONLY_UPDATE_TICKER：本次通知更新只刷新 Ticker，不重绘布局/封面/按钮
 *
 * 不硬编码 Flag 值，统一反射读取，兼容不同 Flyme 版本；反射失败即静默降级，
 * 非 Flyme 机型不会受到任何影响。
 *
 * 注意：这里不新建通知，只给 MusicControlsPlugin 的同一条前台媒体通知
 * （同 channel / 同 notificationId）附加歌词能力，避免出现两条音乐通知。
 */
object FlymeLyric {
    private const val EXTRA_TICKER_ICON = "ticker_icon"
    private const val EXTRA_TICKER_ICON_SWITCH = "ticker_icon_switch"

    @Volatile
    private var checked = false

    @Volatile
    private var alwaysShowTicker = 0

    @Volatile
    private var onlyUpdateTicker = 0

    /** 当前歌词文本，由 Vue 侧按「行」推送，通知构建时读取 */
    @Volatile
    var lyricText: String = ""
        private set

    /** 播放态：保留供插件 API 使用；状态栏歌词图标固定为音符 */
    @Volatile
    var playing: Boolean = false
        private set

    /**
     * 检测 Flyme 状态栏歌词能力。反射读取系统隐藏 Flag，读取失败即不支持。
     * context 预留给不同 Flyme 版本的 ROM 判定，当前仅做能力探测。
     */
    @Suppress("UNUSED_PARAMETER")
    fun checkSupport(context: Context): Boolean {
        if (checked) return alwaysShowTicker != 0 && onlyUpdateTicker != 0
        checked = true
        try {
            val cls = Notification::class.java
            alwaysShowTicker = readHiddenFlag(cls, "FLAG_ALWAYS_SHOW_TICKER")
            onlyUpdateTicker = readHiddenFlag(cls, "FLAG_ONLY_UPDATE_TICKER")
        } catch (_: Throwable) {
            // 非 Flyme / 老版本反射不到字段：清空并静默降级
            alwaysShowTicker = 0
            onlyUpdateTicker = 0
        }
        return alwaysShowTicker != 0 && onlyUpdateTicker != 0
    }

    private fun readHiddenFlag(cls: Class<*>, name: String): Int {
        val field = try {
            cls.getDeclaredField(name)
        } catch (_: NoSuchFieldException) {
            cls.getField(name)
        }
        field.isAccessible = true
        return field.getInt(null)
    }

    fun setLyric(text: String, isPlaying: Boolean) {
        lyricText = text.trim()
        playing = isPlaying
    }

    fun clearLyric() {
        lyricText = ""
    }

    /**
     * 把 Flyme 歌词参数附加到「已构建好」的媒体通知上。
     * @param onlyTicker true 表示本次只刷新歌词，叠加 ONLY_UPDATE_TICKER，
     *                   避免重建通知布局/封面/按钮导致闪烁。
     */
    fun decorate(notification: Notification, onlyTicker: Boolean) {
        if (!checked || alwaysShowTicker == 0 || onlyUpdateTicker == 0) return
        if (lyricText.isEmpty()) return

        // 状态栏歌词前统一显示音符图标（不再随播放/暂停切换）
        notification.extras.putInt(EXTRA_TICKER_ICON, R.drawable.ic_flyme_music)
        notification.extras.putBoolean(EXTRA_TICKER_ICON_SWITCH, false)

        var flags = notification.flags or alwaysShowTicker
        if (onlyTicker) flags = flags or onlyUpdateTicker
        notification.flags = flags
    }
}
