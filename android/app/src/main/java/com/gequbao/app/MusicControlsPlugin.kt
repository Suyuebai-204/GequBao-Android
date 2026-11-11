package com.yygzs.gqbs

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.animation.ValueAnimator
import android.graphics.PixelFormat
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.view.animation.DecelerateInterpolator
import android.widget.ImageView
import android.widget.TextView
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.net.HttpURLConnection
import java.net.URL

/**
 * 后台播放控制插件：
 * - 在通知栏/锁屏展示播放信息（MediaSession + MediaStyle 通知）
 * - 通过前台 Service 保持进程活跃，使 WebView 中 <audio> 在后台尽量不中断
 * - 锁屏/蓝牙耳机/通知栏的播放/暂停/上下首操作，回传 JS 事件（controlsNotification）
 *
 * 说明：实际音频解码仍在 WebView 的 <audio> 中完成，本插件负责“控制层”。
 * 若需绝对稳定的后台连续播放，后续可改用原生播放器接管音频。
 */
@CapacitorPlugin(name = "MusicControls")
class MusicControlsPlugin : Plugin() {

    private var mediaSession: MediaSession? = null
    private var receiverRegistered = false

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val action = intent?.action ?: return
            handleAction(action)
        }
    }

    companion object {
        const val CHANNEL_ID = "gequbao_music"
        const val NOTIF_ID = 4271
        const val ACTION_PLAY = "com.yygzs.gqbs.musiccontrols.PLAY"
        const val ACTION_PAUSE = "com.yygzs.gqbs.musiccontrols.PAUSE"
        const val ACTION_NEXT = "com.yygzs.gqbs.musiccontrols.NEXT"
        const val ACTION_PREV = "com.yygzs.gqbs.musiccontrols.PREV"
        const val ACTION_STOP = "com.yygzs.gqbs.musiccontrols.STOP"
        const val ACTION_REPEAT = "com.yygzs.gqbs.musiccontrols.REPEAT"
        const val ACTION_LYRIC = "com.yygzs.gqbs.musiccontrols.LYRIC"
        const val ACTION_DESKTOP_LYRIC = "com.yygzs.gqbs.musiccontrols.DESKTOP_LYRIC"
        // 桌面歌词开关状态（提升为 companion，供通知栏按钮图标复用）
        @Volatile var desktopLyricEnabled: Boolean = false
        // 循环模式（off / all / one），供通知栏/锁屏循环按钮文案反馈
        var stateRepeat: String = "off"
        // 歌词舞台：当前行大字 / 下一行小字（sp）
        const val LYRIC_SIZE_LARGE = 18f
        const val LYRIC_SIZE_SMALL = 13f

        @Volatile var stateTitle: String = "未知歌曲"
        @Volatile var stateArtist: String = "未知歌手"
        @Volatile var statePlaying: Boolean = false
        @Volatile var statePositionMs: Long = 0
        @Volatile var stateDurationMs: Long = 0
        var metaDurationMs: Long = -1
        // 缓存封面位图，避免 updateProgress 时重复下载
        @Volatile var stateCoverUrl: String = ""
        @Volatile var stateArt: Bitmap? = null

        // 由 ensureSession 写入，供通知构建使用
        var currentMediaSessionToken: android.media.session.MediaSession.Token? = null
    }

    // 桌面歌词悬浮窗状态
    private var lyricWM: WindowManager? = null
    private var lyricView: View? = null
    private var lyricParams: WindowManager.LayoutParams? = null
    private var lyricViews: LyricViews? = null
    @Volatile var lyricText: String = ""
    @Volatile var lyricNext: String = ""
    @Volatile var lyricTitle: String = ""
    @Volatile var lyricArtist: String = ""
    @Volatile var lyricPlaying: Boolean = false
    // 当前歌词行号，用于左右交替（偶数行在左、奇数行在右）
    @Volatile var lyricIndex: Int = -1
    // 仅 UI 线程读写：切句滚动动画进行中与动画实例
    private var scrollAnimating = false
    private var scrollAnimator: ValueAnimator? = null

    /** 悬浮窗内需要动态更新的控件引用 */
    private data class LyricViews(
        val root: View,
        val stage: View,
        val outgoing: TextView,
        val meta: TextView,
        val current: TextView,
        val upcoming: TextView,
        val play: ImageView
    )

    override fun load() {
        super.load()
        // 注意：Bridge 初始化阶段 context 可能尚未完全就绪，
        // 接收器注册与通知渠道创建延后到首次 create() 时执行（见 ensureReady）
    }

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        if (receiverRegistered) {
            try { context.unregisterReceiver(receiver) } catch (_: Exception) {}
            receiverRegistered = false
        }
        hideFloatingLyric()
        destroySession()
        stopService()
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            val mgr = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (mgr.getNotificationChannel(CHANNEL_ID) == null) {
                val ch = NotificationChannel(
                    CHANNEL_ID, "歌曲宝播放控制", NotificationManager.IMPORTANCE_LOW
                ).apply { setShowBadge(false) }
                mgr.createNotificationChannel(ch)
            }
        }
    }

    /** 在 context 就绪后（首次播放）创建通知渠道并注册媒体按键接收器 */
    private fun ensureReady() {
        createChannel()
        if (!receiverRegistered) {
            val filter = IntentFilter().apply {
                addAction(ACTION_PLAY)
                addAction(ACTION_PAUSE)
                addAction(ACTION_NEXT)
                addAction(ACTION_PREV)
                addAction(ACTION_STOP)
                addAction(ACTION_REPEAT)
                addAction(ACTION_LYRIC)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                context.registerReceiver(receiver, filter)
            }
            receiverRegistered = true
        }
    }

    @PluginMethod
    fun create(call: PluginCall) {
        ensureReady()
        val track = call.getObject("track")
        stateTitle = track?.optString("title", "未知歌曲") ?: "未知歌曲"
        stateArtist = track?.optString("artist", "未知歌手") ?: "未知歌手"
        statePlaying = call.getBoolean("isPlaying", false) ?: false
        statePositionMs = ((call.getDouble("position", 0.0) ?: 0.0) * 1000).toLong()
        stateDurationMs = ((track?.optDouble("duration", 0.0) ?: 0.0) * 1000).toLong()
        ensureSession()
        updateMetadata(track)
        updatePlaybackState(statePlaying)
        startService()
        call.resolve()
    }

    @PluginMethod
    fun update(call: PluginCall) {
        val track = call.getObject("track")
        if (track != null) {
            stateTitle = track.optString("title", stateTitle)
            stateArtist = track.optString("artist", stateArtist)
            stateDurationMs = ((track.optDouble("duration", stateDurationMs / 1000.0)) * 1000).toLong()
            updateMetadata(track)
        }
        statePlaying = call.getBoolean("isPlaying", statePlaying) ?: statePlaying
        if (call.hasOption("position")) {
            statePositionMs = ((call.getDouble("position", 0.0) ?: 0.0) * 1000).toLong()
        }
        call.getString("repeat", null)?.let { r ->
            if (r in listOf("off", "all", "one")) MusicControlsPlugin.stateRepeat = r
        }
        updatePlaybackState(statePlaying)
        postNotification()
        call.resolve()
    }

    /** JS 切换循环模式（off/all/one）后同步给原生，刷新通知栏/锁屏循环按钮文案 */
    @PluginMethod
    fun setRepeatMode(call: PluginCall) {
        val mode = call.getString("mode", "off") ?: "off"
        MusicControlsPlugin.stateRepeat = if (mode in listOf("off", "all", "one")) mode else "off"
        updatePlaybackState(statePlaying)
        postNotification()
        call.resolve()
    }

    /** 周期性上报播放进度（position/duration，单位秒），供系统媒体控制显示进度条 */
    @PluginMethod
    fun updateProgress(call: PluginCall) {
        val pos = call.getDouble("position", 0.0) ?: 0.0
        val dur = call.getDouble("duration", 0.0) ?: 0.0
        statePositionMs = (pos * 1000).toLong()
        if (dur > 0) stateDurationMs = (dur * 1000).toLong()
        val ms = mediaSession ?: run { call.resolve(); return }
        // 仅当总时长发生变化时重建 metadata（避免每次进度上报都刷新封面/锁屏）
        if (stateDurationMs != metaDurationMs) {
            ms.setMetadata(buildMetadata())
            metaDurationMs = stateDurationMs
        }
        updatePlaybackState(statePlaying)
        call.resolve()
    }

    /** 桌面歌词开关：开启时若未授予悬浮窗权限则不创建窗口，由 JS 引导用户去设置 */
    @PluginMethod
    fun setDesktopLyric(call: PluginCall) {
        val enabled = call.getBoolean("enabled", false) ?: false
        val res = JSObject()
        if (enabled) {
            if (Build.VERSION.SDK_INT >= 23 && !Settings.canDrawOverlays(context)) {
                res.put("granted", false)
                call.resolve(res)
                return
            }
            showFloatingLyric()
            res.put("granted", true)
        } else {
            hideFloatingLyric()
            res.put("granted", true)
        }
        // 仅在真正创建/销毁窗口后写入状态，避免缺权限时与实际不一致
        MusicControlsPlugin.desktopLyricEnabled = enabled
        postNotification()
        call.resolve(res)
    }

    /** 实时更新桌面歌词：当前句 / 下一句 / 行号 / 歌曲信息 / 播放状态 */
    @PluginMethod
    fun updateDesktopLyric(call: PluginCall) {
        val text = call.getString("text", "") ?: ""
        val next = call.getString("next", "") ?: ""
        val index = call.getInt("index", -1) ?: -1
        val lineChanged = text != lyricText || next != lyricNext || index != lyricIndex
        lyricText = text
        lyricNext = next
        lyricIndex = index
        lyricTitle = call.getString("title", "") ?: ""
        lyricArtist = call.getString("artist", "") ?: ""
        lyricPlaying = call.getBoolean("playing", false) ?: false
        renderLyric(lineChanged)
        call.resolve()
    }

    /** 跳转系统「悬浮窗」权限设置页 */
    @PluginMethod
    fun openOverlayPermissionSettings(call: PluginCall) {
        try {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:${context.packageName}")
            )
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        } catch (_: Exception) { /* ignore */ }
        call.resolve()
    }

    @PluginMethod
    fun setPlaybackState(call: PluginCall) {
        statePlaying = call.getBoolean("isPlaying", statePlaying) ?: statePlaying
        updatePlaybackState(statePlaying)
        postNotification()
        call.resolve()
    }

    @PluginMethod
    fun destroy(call: PluginCall) {
        destroySession()
        stopService()
        call.resolve()
    }

    private fun ensureSession() {
        if (mediaSession != null) return
        mediaSession = MediaSession(context, "GequbaoMusicSession").apply {
            setCallback(object : MediaSession.Callback() {
                override fun onPlay() = handleAction(ACTION_PLAY)
                override fun onPause() = handleAction(ACTION_PAUSE)
                override fun onSkipToNext() = handleAction(ACTION_NEXT)
                override fun onSkipToPrevious() = handleAction(ACTION_PREV)
                override fun onStop() = handleAction(ACTION_STOP)
                override fun onSeekTo(pos: Long) {
                    statePositionMs = pos
                    updatePlaybackState(statePlaying)
                    val data = JSObject()
                    data.put("message", "seek")
                    data.put("position", pos / 1000.0)
                    notifyListeners("controlsNotification", data)
                }
                override fun onCustomAction(action: String, extras: android.os.Bundle?) {
                    when (action) {
                        ACTION_DESKTOP_LYRIC -> {
                            // 锁屏/系统媒体控制器上的桌面歌词开关：交给 JS 统一处理（含创建/销毁与权限）
                            val data = JSObject()
                            data.put("message", "desktopLyric")
                            data.put("enabled", !MusicControlsPlugin.desktopLyricEnabled)
                            notifyListeners("controlsNotification", data)
                            return
                        }
                        ACTION_REPEAT -> {
                            // 锁屏/系统媒体控制器上的循环按钮：交给 JS 切换循环模式
                            val data = JSObject()
                            data.put("message", "cycleRepeat")
                            notifyListeners("controlsNotification", data)
                            return
                        }
                    }
                    super.onCustomAction(action, extras)
                }
            })
            isActive = true
        }
        currentMediaSessionToken = mediaSession?.sessionToken
    }

    private fun buildMetadata(): MediaMetadata {
        val b = MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE, stateTitle)
            .putString(MediaMetadata.METADATA_KEY_ARTIST, stateArtist)
        if (stateDurationMs > 0) {
            b.putLong(MediaMetadata.METADATA_KEY_DURATION, stateDurationMs)
        }
        stateArt?.let { b.putBitmap(MediaMetadata.METADATA_KEY_ART, it) }
        return b.build()
    }

    private fun updateMetadata(track: JSObject?) {
        val ms = mediaSession ?: return
        val cover = track?.optString("cover", "") ?: ""
        if (cover != stateCoverUrl) {
            stateCoverUrl = cover
            stateArt = null
            if (!cover.isNullOrBlank() && cover.startsWith("http")) {
                try {
                    val bitmap = downloadBitmap(cover)
                    if (bitmap != null) stateArt = bitmap
                } catch (_: Exception) { /* ignore */ }
            }
        }
        ms.setMetadata(buildMetadata())
        metaDurationMs = stateDurationMs
    }

    private fun updatePlaybackState(isPlaying: Boolean) {
        val ms = mediaSession ?: return
        val state = if (isPlaying) PlaybackState.STATE_PLAYING else PlaybackState.STATE_PAUSED
        // 播放时速度 1f（系统据时间戳自动推进进度条），暂停时 0f
        val lyricAction = PlaybackState.CustomAction.Builder(
            ACTION_DESKTOP_LYRIC,
            if (MusicControlsPlugin.desktopLyricEnabled) "关闭桌面歌词" else "桌面歌词",
            R.drawable.ic_lyric
        ).build()
        val repeatLabel = when (MusicControlsPlugin.stateRepeat) {
            "one" -> "单曲循环"
            "all" -> "列表循环"
            else -> "循环关"
        }
        val repeatIcon = when (MusicControlsPlugin.stateRepeat) {
            "one" -> R.drawable.ic_repeat_one
            "all" -> R.drawable.ic_repeat
            else -> R.drawable.ic_repeat_off
        }
        val repeatAction = PlaybackState.CustomAction.Builder(
            ACTION_REPEAT,
            repeatLabel,
            repeatIcon
        ).build()
        ms.setPlaybackState(
            PlaybackState.Builder()
                .setActions(
                    PlaybackState.ACTION_PLAY or PlaybackState.ACTION_PAUSE or
                        PlaybackState.ACTION_SKIP_TO_NEXT or PlaybackState.ACTION_SKIP_TO_PREVIOUS or
                        PlaybackState.ACTION_STOP or PlaybackState.ACTION_SEEK_TO
                )
                .addCustomAction(lyricAction)
                .addCustomAction(repeatAction)
                .setState(state, statePositionMs, if (isPlaying) 1f else 0f)
                .build()
        )
    }

    private fun handleAction(action: String) {
        val event = when (action) {
            ACTION_PLAY -> "play"
            ACTION_PAUSE -> "pause"
            ACTION_NEXT -> "next"
            ACTION_PREV -> "previous"
            ACTION_STOP -> "stop"
            ACTION_REPEAT -> "cycleRepeat"
            ACTION_LYRIC -> "desktopLyric"
            else -> return
        }
        when (action) {
            ACTION_PLAY -> statePlaying = true
            ACTION_PAUSE -> statePlaying = false
            ACTION_STOP -> statePlaying = false
        }
        if (action == ACTION_PLAY || action == ACTION_PAUSE || action == ACTION_STOP) {
            updatePlaybackState(statePlaying)
            postNotification()
        }
        val data = JSObject()
        data.put("message", event)
        // 桌面歌词交由 JS 统一开关（含悬浮窗创建/销毁与权限校验），这里只给出目标态
        if (action == ACTION_LYRIC) data.put("enabled", !MusicControlsPlugin.desktopLyricEnabled)
        notifyListeners("controlsNotification", data)
    }

    private fun startService() {
        val intent = Intent(context, MusicControlsService::class.java)
        if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent)
        else context.startService(intent)
    }

    private fun stopService() {
        context.stopService(Intent(context, MusicControlsService::class.java))
    }

    private fun postNotification() {
        val mgr = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        mgr.notify(NOTIF_ID, buildMusicNotification(context, MusicControlsPlugin.desktopLyricEnabled))
    }

    private fun destroySession() {
        mediaSession?.release()
        mediaSession = null
        currentMediaSessionToken = null
    }

    private fun downloadBitmap(src: String): Bitmap? {
        val conn = URL(src).openConnection() as HttpURLConnection
        conn.doInput = true
        conn.connect()
        val input = conn.inputStream
        return BitmapFactory.decodeStream(input)
    }

    /* ============ 桌面歌词悬浮窗 ============ */

    private fun dp(value: Int): Int =
        (value * context.resources.displayMetrics.density).toInt()

    /** 固定卡片宽度：歌词长短变化时不会忽宽忽窄，接近屏宽但留出边距 */
    private fun lyricWindowWidth(): Int {
        val dm = context.resources.displayMetrics
        return minOf(dm.widthPixels - dp(24), dp(360))
    }

    private fun lyricPrefs() =
        context.getSharedPreferences("gequbao_desktop_lyric", Context.MODE_PRIVATE)

    /** 恢复上次拖动位置；屏幕尺寸变化后做边界收敛，避免卡片跑出可视区 */
    private fun savedLyricPosition(width: Int): Pair<Int, Int> {
        val dm = context.resources.displayMetrics
        val sp = lyricPrefs()
        val defX = ((dm.widthPixels - width) / 2f).toInt()
        val defY = (dm.heightPixels * 0.16f).toInt()
        val maxX = (dm.widthPixels - width).coerceAtLeast(0)
        val maxY = (dm.heightPixels - dp(90)).coerceAtLeast(0)
        return Pair(
            sp.getInt("x", defX).coerceIn(0, maxX),
            sp.getInt("y", defY).coerceIn(0, maxY)
        )
    }

    private fun saveLyricPosition(x: Int, y: Int) {
        lyricPrefs().edit().putInt("x", x).putInt("y", y).apply()
    }

    private fun showFloatingLyric() {
        val act = context as android.app.Activity
        // 视图的创建/增删与后续文本更新必须都在同一个线程（UI 线程）
        act.runOnUiThread {
            if (lyricView != null) return@runOnUiThread
            val wm = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
            lyricWM = wm
            val views = buildLyricView()
            lyricView = views.root
            lyricViews = views
            val width = lyricWindowWidth()
            val (x, y) = savedLyricPosition(width)
            val params = WindowManager.LayoutParams(
                width,
                WindowManager.LayoutParams.WRAP_CONTENT,
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                    WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                else
                    WindowManager.LayoutParams.TYPE_PHONE,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                PixelFormat.TRANSLUCENT
            )
            params.gravity = Gravity.TOP or Gravity.START
            params.x = x
            params.y = y
            lyricParams = params
            wm.addView(views.root, params)
            renderLyric(false)
        }
    }

    private fun hideFloatingLyric() {
        val act = context as android.app.Activity
        act.runOnUiThread {
            scrollAnimator?.cancel()
            scrollAnimator = null
            scrollAnimating = false
            lyricView?.let {
                try { lyricWM?.removeView(it) } catch (_: Exception) {}
            }
            lyricView = null
            lyricViews = null
            lyricParams = null
            lyricWM = null
        }
    }

    private fun buildLyricView(): LyricViews {
        val root = LayoutInflater.from(context).inflate(R.layout.floating_lyric, null)
        val views = LyricViews(
            root = root,
            stage = root.findViewById(R.id.fl_stage),
            outgoing = root.findViewById(R.id.fl_outgoing),
            meta = root.findViewById(R.id.fl_meta),
            current = root.findViewById(R.id.fl_current),
            upcoming = root.findViewById(R.id.fl_upcoming),
            play = root.findViewById(R.id.fl_play)
        )

        var lastX = 0f
        var lastY = 0f
        var downX = 0f
        var downY = 0f
        var moved = false
        val touch = View.OnTouchListener { v, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    lastX = event.rawX
                    lastY = event.rawY
                    downX = event.rawX
                    downY = event.rawY
                    moved = false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = event.rawX - lastX
                    val dy = event.rawY - lastY
                    lastX = event.rawX
                    lastY = event.rawY
                    lyricParams?.let {
                        it.x += dx.toInt()
                        it.y += dy.toInt()
                        lyricWM?.updateViewLayout(root, it)
                    }
                    if (Math.abs(event.rawX - downX) > 10 || Math.abs(event.rawY - downY) > 10) moved = true
                    true
                }
                MotionEvent.ACTION_UP -> {
                    if (moved) {
                        lyricParams?.let { saveLyricPosition(it.x, it.y) }
                    } else {
                        handleLyricTap(v.id)
                    }
                    true
                }
                else -> false
            }
        }
        // 全卡片（含按钮）共用一套触摸逻辑：任意位置可拖动，按钮轻点仍能被识别
        attachLyricTouch(root, touch)
        return views
    }

    private fun attachLyricTouch(view: View, listener: View.OnTouchListener) {
        view.setOnTouchListener(listener)
        if (view is ViewGroup) {
            for (i in 0 until view.childCount) attachLyricTouch(view.getChildAt(i), listener)
        }
    }

    private fun handleLyricTap(id: Int) {
        val data = JSObject()
        when (id) {
            R.id.fl_close -> {
                MusicControlsPlugin.desktopLyricEnabled = false
                // 等本次触摸派发结束后再移除窗口，避免在 dispatchTouchEvent 中删 View
                lyricView?.let { it.post { hideFloatingLyric() } }
                data.put("message", "desktopLyric")
                data.put("enabled", false)
            }
            R.id.fl_prev -> data.put("message", "previous")
            R.id.fl_skip_next -> data.put("message", "next")
            // 播放按钮或卡片空白处：切换播放/暂停
            else -> data.put("message", if (lyricPlaying) "pause" else "play")
        }
        notifyListeners("controlsNotification", data)
    }

    private fun renderLyric(lineChanged: Boolean) {
        val views = lyricViews ?: return
        (context as android.app.Activity).runOnUiThread {
            if (lyricViews !== views) return@runOnUiThread
            when {
                lineChanged -> scrollToNextLine(views)
                // 动画途中只同步头部/播放态，不重置三行位置，避免打断滚动
                scrollAnimating -> updateHeaderAndControls(views)
                else -> applyLyricContent(views)
            }
        }
    }

    /**
     * 三行同时向上滚动一行，下一句原地升格并放大成当前句。
     * t=0 与切句前稳态、t=1 与切句后稳态画面完全一致，且全程不改 alpha，因此不会闪。
     */
    private fun scrollToNextLine(views: LyricViews) {
        scrollAnimator?.cancel()
        val offset = dp(30).toFloat()

        // 视图上仍是上一帧稳态，把旧的当前句交给离场行
        views.outgoing.text = views.current.text
        views.outgoing.gravity = views.current.gravity
        views.outgoing.setTextSize(TypedValue.COMPLEX_UNIT_SP, LYRIC_SIZE_LARGE)
        views.outgoing.translationY = 0f
        views.outgoing.visibility = View.VISIBLE

        val currentLeft = lyricIndex < 0 || lyricIndex % 2 == 0
        views.current.gravity = if (currentLeft) Gravity.START else Gravity.END
        views.upcoming.gravity = if (currentLeft) Gravity.END else Gravity.START
        views.current.text = if (lyricText.isBlank()) "纯音乐，请欣赏" else lyricText
        views.upcoming.text = lyricNext
        views.upcoming.visibility = if (lyricNext.isBlank()) View.GONE else View.VISIBLE

        // 新当前句从「小字 + 下一行位置」起步，新下一句从舞台下方进入
        views.current.setTextSize(TypedValue.COMPLEX_UNIT_SP, LYRIC_SIZE_SMALL)
        views.current.translationY = offset
        views.upcoming.setTextSize(TypedValue.COMPLEX_UNIT_SP, LYRIC_SIZE_SMALL)
        views.upcoming.translationY = offset * 2f

        updateHeaderAndControls(views)

        scrollAnimating = true
        scrollAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 320
            interpolator = DecelerateInterpolator(1.4f)
            addUpdateListener { anim ->
                if (lyricViews !== views) return@addUpdateListener
                val t = anim.animatedValue as Float
                views.outgoing.translationY = -offset * t
                views.current.translationY = offset * (1f - t)
                views.current.setTextSize(
                    TypedValue.COMPLEX_UNIT_SP,
                    LYRIC_SIZE_SMALL + (LYRIC_SIZE_LARGE - LYRIC_SIZE_SMALL) * t
                )
                views.upcoming.translationY = offset * (2f - t)
            }
            addListener(object : android.animation.AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: android.animation.Animator) {
                    scrollAnimating = false
                    if (lyricViews !== views) return
                    views.outgoing.visibility = View.GONE
                    views.outgoing.translationY = 0f
                    views.current.setTextSize(TypedValue.COMPLEX_UNIT_SP, LYRIC_SIZE_LARGE)
                    views.current.translationY = 0f
                    views.upcoming.translationY = offset
                }
            })
            start()
        }
    }

    /** 稳态渲染：当前行大字在 y=0，下一行小字在 y=30dp */
    private fun applyLyricContent(views: LyricViews) {
        val currentLeft = lyricIndex < 0 || lyricIndex % 2 == 0
        views.current.gravity = if (currentLeft) Gravity.START else Gravity.END
        views.upcoming.gravity = if (currentLeft) Gravity.END else Gravity.START
        views.current.text = if (lyricText.isBlank()) "纯音乐，请欣赏" else lyricText
        views.upcoming.text = lyricNext
        views.upcoming.visibility = if (lyricNext.isBlank()) View.GONE else View.VISIBLE
        views.current.setTextSize(TypedValue.COMPLEX_UNIT_SP, LYRIC_SIZE_LARGE)
        views.current.translationY = 0f
        views.upcoming.setTextSize(TypedValue.COMPLEX_UNIT_SP, LYRIC_SIZE_SMALL)
        views.upcoming.translationY = dp(30).toFloat()
        views.outgoing.visibility = View.GONE
        views.outgoing.translationY = 0f
        updateHeaderAndControls(views)
    }

    /** 与滚动无关的信息，随时可更新 */
    private fun updateHeaderAndControls(views: LyricViews) {
        val meta = listOf(lyricTitle, lyricArtist)
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .joinToString(" · ")
        views.meta.text = if (meta.isEmpty()) "歌曲宝" else meta
        views.play.setImageResource(
            if (lyricPlaying) R.drawable.ic_fl_pause else R.drawable.ic_fl_play
        )
        views.root.alpha = if (lyricPlaying) 1f else 0.78f
    }
}

/** 构建锁屏/通知栏通知（供插件与服务共用）；lyricOn 决定桌面歌词按钮图标 */
private fun buildMusicNotification(context: Context, lyricOn: Boolean): Notification {
    val pi = { action: String ->
        val intent = Intent(action).setPackage(context.packageName)
        PendingIntent.getBroadcast(
            context, action.hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    val builder = Notification.Builder(context, MusicControlsPlugin.CHANNEL_ID)
        .setContentTitle(MusicControlsPlugin.stateTitle)
        .setContentText(MusicControlsPlugin.stateArtist)
        .setSmallIcon(getAppIcon(context))
        .setVisibility(Notification.VISIBILITY_PUBLIC)
        .setOngoing(MusicControlsPlugin.statePlaying)
        .setOnlyAlertOnce(true)
        .addAction(android.R.drawable.ic_media_previous, "上一首", pi(MusicControlsPlugin.ACTION_PREV))
        .addAction(
            if (MusicControlsPlugin.statePlaying)
                Notification.Action(android.R.drawable.ic_media_pause, "暂停", pi(MusicControlsPlugin.ACTION_PAUSE))
            else
                Notification.Action(android.R.drawable.ic_media_play, "播放", pi(MusicControlsPlugin.ACTION_PLAY))
        )
        .addAction(android.R.drawable.ic_media_next, "下一首", pi(MusicControlsPlugin.ACTION_NEXT))
        .addAction(
            when (MusicControlsPlugin.stateRepeat) {
                "one" -> R.drawable.ic_repeat_one
                "all" -> R.drawable.ic_repeat
                else -> R.drawable.ic_repeat_off
            },
            "循环", pi(MusicControlsPlugin.ACTION_REPEAT)
        )
        .addAction(
            R.drawable.ic_lyric,
            if (lyricOn) "关闭桌面歌词" else "桌面歌词",
            pi(MusicControlsPlugin.ACTION_LYRIC)
        )

    if (MusicControlsPlugin.currentMediaSessionToken != null) {
        builder.style = Notification.MediaStyle()
            .setMediaSession(MusicControlsPlugin.currentMediaSessionToken)
            .setShowActionsInCompactView(0, 1, 2)
    }
    return builder.build()
}

private fun getAppIcon(context: Context): Int {
    val id = context.resources.getIdentifier("ic_launcher", "mipmap", context.packageName)
    return if (id != 0) id else android.R.drawable.sym_def_app_icon
}

/** 前台服务：保持通知常驻，维持进程活跃以支持后台播放 */
class MusicControlsService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notif = buildMusicNotification(this, MusicControlsPlugin.desktopLyricEnabled)
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(
                MusicControlsPlugin.NOTIF_ID, notif,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            )
        } else {
            startForeground(MusicControlsPlugin.NOTIF_ID, notif)
        }
        return START_STICKY
    }
}
