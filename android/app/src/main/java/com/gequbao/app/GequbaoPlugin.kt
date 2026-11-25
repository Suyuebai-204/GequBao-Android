package com.yygzs.gqbs

import android.Manifest
import android.app.UiModeManager
import android.content.ContentUris
import android.content.Context
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.os.Build
import android.provider.MediaStore
import android.util.Base64
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.getcapacitor.Plugin
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.PluginCall
import com.getcapacitor.JSObject
import com.getcapacitor.JSArray
import android.graphics.Color
import android.net.Uri
import android.view.View
import android.view.WindowInsetsController
import android.view.WindowManager
import java.io.BufferedReader
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.util.zip.GZIPInputStream
import java.util.zip.InflaterInputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.URL
import java.net.URLDecoder
import java.net.URLEncoder
import org.json.JSONObject

/**
 * 自定义原生插件：
 * - http：由 Java 侧发起请求，绕开 WebView 的 CORS 限制（返回原始字节 base64）
 * - scanLibrary：通过 MediaStore 扫描系统媒体库（替代桌面端的 fs 递归遍历）
 * - saveToDownloads：将直链下载结果（base64）通过 MediaStore 写入系统下载目录
 */
@CapacitorPlugin(name = "Gequbao")
class GequbaoPlugin : Plugin() {

    companion object {
        /** 系统级 TV 判定：UI 模式 + Leanback/Television 硬件特性，比 UA 可靠 */
        fun isTvDevice(context: Context): Boolean {
            val uiModeType = try {
                (context.getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager)?.currentModeType
            } catch (_: Exception) {
                null
            }
            val leanback = try {
                context.packageManager.hasSystemFeature("android.software.leanback")
            } catch (_: Exception) {
                false
            }
            val television = try {
                context.packageManager.hasSystemFeature("android.hardware.television")
            } catch (_: Exception) {
                false
            }
            return uiModeType == Configuration.UI_MODE_TYPE_TELEVISION || leanback || television
        }
    }

    @PluginMethod
    fun isTv(call: PluginCall) {
        val result = JSObject()
        result.put("value", isTvDevice(context))
        call.resolve(result)
    }

    @PluginMethod
    fun http(call: PluginCall) {
        val url = call.getString("url")
        if (url.isNullOrBlank()) { call.reject("missing url"); return }
        val method = (call.getString("method") ?: "GET").uppercase()
        val body = call.getString("body") ?: ""
        val timeout = call.getInt("timeout", 12000) ?: 12000
        val headersObj = (try { call.getObject("headers") } catch (_: Exception) { null }) ?: JSObject()

        Thread {
            try {
                // 关键：HttpURLConnection 默认跟随重定向会丢掉 302 响应里的 Set-Cookie，
                // 导致「登录成功却仍是游客会话」。这里改成手动逐跳跟随，自己维护 cookie。
                var curUrl = URL(url)
                var curMethod = method
                var curBody: ByteArray? = if (body.isEmpty()) null else body.toByteArray(Charsets.UTF_8)
                var redirects = 0
                var status = 0
                var respHeaders: Map<String, List<String>> = emptyMap()
                var bytes = ByteArray(0)

                // 用 JS 侧持久化的 cookie 作为种子（App 重启后恢复会话）
                seedCookies(headersObj.getString("cookie"))
                seedCookies(headersObj.getString("Cookie"))

                while (true) {
                    val conn = curUrl.openConnection() as HttpURLConnection
                    conn.instanceFollowRedirects = false
                    conn.connectTimeout = timeout
                    conn.readTimeout = timeout
                    conn.requestMethod = curMethod

                    val keys = headersObj.keys()
                    while (keys.hasNext()) {
                        val k = keys.next()
                        if (k.equals("cookie", true) || k.equals("accept-encoding", true)) continue
                        conn.setRequestProperty(k, headersObj.getString(k))
                    }
                    // 允许服务端压缩（HTML/JSON 通常可缩小 60%~80%），读取时按 Content-Encoding 解压
                    conn.setRequestProperty("Accept-Encoding", "gzip, deflate")
                    val ck = cookieString()
                    if (ck.isNotEmpty()) conn.setRequestProperty("Cookie", ck)

                    val outBytes = curBody
                    if ((curMethod == "POST" || curMethod == "PUT" || curMethod == "PATCH") &&
                        outBytes != null && outBytes.isNotEmpty()
                    ) {
                        conn.doOutput = true
                        conn.outputStream.use { it.write(outBytes) }
                    }

                    status = conn.responseCode
                    respHeaders = conn.headerFields ?: emptyMap()
                    storeSetCookies(respHeaders)

                    val loc = conn.getHeaderField("Location")
                    if (status in 300..399 && !loc.isNullOrBlank() && redirects < 8) {
                        try { curUrl = URL(curUrl, loc) } catch (_: Exception) { /* 保持原地址 */ }
                        // 301/302/303 之后改 GET 并丢弃请求体；307/308 保留方法与请求体
                        if (status == 301 || status == 302 || status == 303) {
                            curMethod = "GET"
                            curBody = null
                        }
                        redirects++
                        conn.disconnect()
                        continue
                    }

                    val rawStream = if (status < 400) conn.inputStream else conn.errorStream
                    val encoding = conn.getHeaderField("Content-Encoding")?.lowercase()?.trim().orEmpty()
                    val bodyStream: InputStream? = when {
                        rawStream == null -> null
                        encoding == "gzip" -> GZIPInputStream(rawStream)
                        encoding == "deflate" -> InflaterInputStream(rawStream)
                        else -> rawStream
                    }
                    bytes = try {
                        if (bodyStream == null) ByteArray(0) else {
                            val hinted = conn.getHeaderField("Content-Length")?.toIntOrNull() ?: 0
                            val initial = if (hinted in 1..(8 * 1024 * 1024)) hinted else 8192
                            val out = ByteArrayOutputStream(initial)
                            val buf = ByteArray(16 * 1024)
                            while (true) {
                                val n = bodyStream.read(buf)
                                if (n < 0) break
                                out.write(buf, 0, n)
                            }
                            out.toByteArray()
                        }
                    } catch (_: Exception) {
                        ByteArray(0)
                    }
                    try { bodyStream?.close() } catch (_: Exception) { }
                    if (bodyStream !== rawStream) try { rawStream?.close() } catch (_: Exception) { }
                    conn.disconnect()
                    break
                }

                val headerJSON = JSObject()
                respHeaders.forEach { (name, values) ->
                    if (name.isNullOrBlank()) return@forEach
                    // 返回给 JS 的已是解压后的字节，原压缩长度/编码头会误导上层
                    if (name.equals("Content-Encoding", true) || name.equals("Content-Length", true)) return@forEach
                    headerJSON.put(name, values.joinToString(","))
                }

                val result = JSObject()
                result.put("status", status)
                result.put("headers", headerJSON)
                result.put("bodyBase64", Base64.encodeToString(bytes, Base64.NO_WRAP))
                // 回传最终落点 / 是否重定向 / 当前 cookie，供 JS 判定登录成败并持久化
                result.put("finalUrl", curUrl.toString())
                result.put("redirected", redirects > 0)
                result.put("cookies", cookieString())
                runOnMain { call.resolve(result) }
            } catch (e: Exception) {
                runOnMain { call.reject("http error: ${e.message}") }
            }
        }.start()
    }

    /**
     * 直链 → Downloads 流式落盘。
     * 原来的链路是 nativeHttp(base64) → JS 解码 → Blob → base64 → 原生写盘，
     * 一首 5MB 的歌会产生约 18MB 的字符串拷贝；这里直接在 Java 层边读边写。
     */
    @PluginMethod
    fun downloadUrl(call: PluginCall) {
        val url = call.getString("url")
        val name = call.getString("name")
        if (url.isNullOrBlank() || name.isNullOrBlank()) {
            call.reject("missing url or name")
            return
        }
        val mime = call.getString("mime", "audio/mpeg") ?: "audio/mpeg"
        val timeout = call.getInt("timeout", 30000) ?: 30000
        val headersObj = (try { call.getObject("headers") } catch (_: Exception) { null }) ?: JSObject()

        Thread {
            var itemUri: android.net.Uri? = null
            var pending = false
            try {
                val conn = URL(url).openConnection() as HttpURLConnection
                conn.instanceFollowRedirects = true
                conn.connectTimeout = timeout
                conn.readTimeout = timeout
                conn.setRequestProperty("Accept", "*/*")
                conn.setRequestProperty("Accept-Encoding", "identity")
                val keys = headersObj.keys()
                while (keys.hasNext()) {
                    val k = keys.next()
                    if (k.equals("accept-encoding", true)) continue
                    conn.setRequestProperty(k, headersObj.getString(k))
                }

                val status = conn.responseCode
                if (status >= 400) {
                    runOnMain { call.reject("download http $status") }
                    return@Thread
                }

                val cr = activity?.contentResolver
                if (cr == null) {
                    runOnMain { call.reject("no content resolver") }
                    return@Thread
                }
                val collection = if (Build.VERSION.SDK_INT >= 29)
                    MediaStore.Downloads.EXTERNAL_CONTENT_URI
                else
                    MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
                val values = android.content.ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, name)
                    put(MediaStore.MediaColumns.MIME_TYPE, mime)
                    if (Build.VERSION.SDK_INT >= 29) {
                        put(MediaStore.MediaColumns.RELATIVE_PATH,
                            android.os.Environment.DIRECTORY_DOWNLOADS + "/歌曲宝")
                        put(MediaStore.MediaColumns.IS_PENDING, 1)
                    }
                }
                itemUri = cr.insert(collection, values)
                if (itemUri == null) {
                    runOnMain { call.reject("insert failed") }
                    return@Thread
                }
                pending = Build.VERSION.SDK_INT >= 29

                val input = conn.inputStream
                var total = 0L
                val output = cr.openOutputStream(itemUri)
                if (output == null) {
                    runOnMain { call.reject("open output failed") }
                    return@Thread
                }
                output.use { out ->
                    val buf = ByteArray(64 * 1024)
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        out.write(buf, 0, n)
                        total += n
                    }
                    out.flush()
                }
                input.close()
                conn.disconnect()

                if (pending) {
                    val done = android.content.ContentValues().apply {
                        put(MediaStore.MediaColumns.IS_PENDING, 0)
                    }
                    cr.update(itemUri, done, null, null)
                }
                val result = JSObject()
                result.put("ok", true)
                result.put("uri", itemUri.toString())
                result.put("bytes", total)
                runOnMain { call.resolve(result) }
            } catch (e: Exception) {
                if (itemUri != null && pending) {
                    try { activity?.contentResolver?.delete(itemUri, null, null) } catch (_: Exception) { }
                }
                runOnMain { call.reject("download failed: ${e.message}") }
            }
        }.start()
    }

    /* ---- 进程内 cookie jar：手动跟随重定向时逐跳维护 ---- */
    private val cookieJar = HashMap<String, String>()

    @Synchronized
    private fun seedCookies(header: String?) {
        if (header.isNullOrBlank()) return
        header.split(";").forEach { part ->
            val p = part.trim()
            val i = p.indexOf('=')
            if (i > 0) cookieJar[p.substring(0, i).trim()] = p.substring(i + 1).trim()
        }
    }

    @Synchronized
    private fun cookieString(): String =
        cookieJar.entries.joinToString("; ") { "${it.key}=${it.value}" }

    @Synchronized
    private fun storeSetCookies(fields: Map<String, List<String>>) {
        val list = fields.entries.firstOrNull { it.key.equals("Set-Cookie", true) }?.value ?: return
        for (raw in list) {
            val head = raw.substringBefore(';')
            val i = head.indexOf('=')
            if (i <= 0) continue
            val name = head.substring(0, i).trim()
            val value = head.substring(i + 1).trim()
            if (name.isEmpty()) continue
            if (raw.lowercase().contains("max-age=0")) cookieJar.remove(name)
            else cookieJar[name] = value
        }
    }

    @PluginMethod
    fun scanLibrary(call: PluginCall) {
        val act = activity
        if (act == null) { call.reject("no activity"); return }

        val perm = if (Build.VERSION.SDK_INT >= 33)
            Manifest.permission.READ_MEDIA_AUDIO
        else
            Manifest.permission.READ_EXTERNAL_STORAGE

        val granted = ContextCompat.checkSelfPermission(act, perm) == PackageManager.PERMISSION_GRANTED
        if (!granted) {
            ActivityCompat.requestPermissions(act, arrayOf(perm), 0x1001)
            val r = JSObject()
            r.put("tracks", JSArray())
            r.put("needPermission", true)
            call.resolve(r)
            return
        }

        Thread {
            try {
                val cr = act.contentResolver
                val uri = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
                val projection = arrayOf(
                    MediaStore.Audio.Media._ID,
                    MediaStore.Audio.Media.TITLE,
                    MediaStore.Audio.Media.ARTIST,
                    MediaStore.Audio.Media.ALBUM,
                    MediaStore.Audio.Media.YEAR,
                    MediaStore.Audio.Media.DURATION,
                    MediaStore.Audio.Media.SIZE,
                    MediaStore.Audio.Media.MIME_TYPE
                )
                val cursor = cr.query(uri, projection, null, null, "${MediaStore.Audio.Media.TITLE} ASC")
                val arr = JSArray()
                cursor?.use {
                    val idxId = it.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
                    val idxTitle = it.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE)
                    val idxArtist = it.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST)
                    val idxAlbum = it.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM)
                    val idxYear = it.getColumnIndexOrThrow(MediaStore.Audio.Media.YEAR)
                    val idxDur = it.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION)
                    val idxSize = it.getColumnIndexOrThrow(MediaStore.Audio.Media.SIZE)
                    val idxMime = it.getColumnIndexOrThrow(MediaStore.Audio.Media.MIME_TYPE)
                    while (it.moveToNext()) {
                        val mime = it.getString(idxMime) ?: ""
                        if (!mime.startsWith("audio")) continue
                        val dur = (it.getLong(idxDur) / 1000)
                        if (dur <= 0) continue
                        val id = it.getLong(idxId)
                        val item = JSObject()
                        item.put("id", id)
                        item.put("title", it.getString(idxTitle) ?: "")
                        item.put("artist", it.getString(idxArtist) ?: "")
                        item.put("album", it.getString(idxAlbum) ?: "")
                        item.put("year", it.getInt(idxYear))
                        item.put("durationSec", dur)
                        item.put("size", it.getLong(idxSize))
                        item.put("format", mime.substringAfter('/').uppercase())
                        item.put("uri", ContentUris.withAppendedId(uri, id).toString())
                        arr.put(item)
                    }
                }
                val res = JSObject()
                res.put("tracks", arr)
                runOnMain { call.resolve(res) }
            } catch (e: Exception) {
                runOnMain { call.reject("scan failed: ${e.message}") }
            }
        }.start()
    }

    @PluginMethod
    fun saveToDownloads(call: PluginCall) {
        val name = call.getString("name")
        val dataB64 = call.getString("dataBase64")
        val mime = call.getString("mime", "audio/mpeg") ?: "audio/mpeg"
        if (name.isNullOrBlank() || dataB64.isNullOrBlank()) { call.reject("missing name or data"); return }

        Thread {
            try {
                val cr = activity?.contentResolver
                if (cr == null) { runOnMain { call.reject("no content resolver") }; return@Thread }

                val bytes = Base64.decode(dataB64, Base64.DEFAULT)
                val collection = if (Build.VERSION.SDK_INT >= 29)
                    MediaStore.Downloads.EXTERNAL_CONTENT_URI
                else
                    MediaStore.Audio.Media.EXTERNAL_CONTENT_URI

                val values = android.content.ContentValues().apply {
                    put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, name)
                    put(android.provider.MediaStore.MediaColumns.MIME_TYPE, mime)
                    if (Build.VERSION.SDK_INT >= 29) {
                        put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH,
                            android.os.Environment.DIRECTORY_DOWNLOADS + "/歌曲宝")
                        put(android.provider.MediaStore.MediaColumns.IS_PENDING, 1)
                    }
                }

                val itemUri = cr.insert(collection, values)
                if (itemUri == null) { runOnMain { call.reject("insert failed") }; return@Thread }

                cr.openOutputStream(itemUri)?.use { it.write(bytes) }

                if (Build.VERSION.SDK_INT >= 29) {
                    values.clear()
                    values.put(android.provider.MediaStore.MediaColumns.IS_PENDING, 0)
                    cr.update(itemUri, values, null, null)
                }

                val res = JSObject()
                res.put("ok", true)
                res.put("uri", itemUri.toString())
                runOnMain { call.resolve(res) }
            } catch (e: Exception) {
                runOnMain { call.reject("save failed: ${e.message}") }
            }
        }.start()
    }

    @PluginMethod
    fun localAudioUrl(call: PluginCall) {
        val uri = call.getString("uri")
        if (uri.isNullOrBlank()) { call.reject("missing uri"); return }
        try {
            val url = LocalAudioServer.getUrl(context.applicationContext, uri)
            val res = JSObject()
            res.put("url", url)
            call.resolve(res)
        } catch (e: Exception) {
            call.reject("localAudioUrl failed: ${e.message}")
        }
    }

    @PluginMethod
    fun setStatusBar(call: PluginCall) {
        val color = call.getString("color", "000000") ?: "000000"
        val dark = call.getBoolean("dark", false) ?: false
        runOnMain { applyStatusBar(color, dark) }
        call.resolve()
    }

    @PluginMethod
    fun setNavigationBar(call: PluginCall) {
        val color = call.getString("color", "000000") ?: "000000"
        val dark = call.getBoolean("dark", false) ?: false
        runOnMain { applyNavigationBar(color, dark) }
        call.resolve()
    }

    private fun parseColor(hex: String): Int {
        return try {
            Color.parseColor(if (hex.startsWith("#")) hex else "#$hex")
        } catch (_: Exception) {
            Color.BLACK
        }
    }

    private fun applyStatusBar(colorHex: String, darkIcons: Boolean) {
        val act = activity ?: return
        val win = act.window
        win.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS)
        win.statusBarColor = parseColor(colorHex)
        val controller = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) win.insetsController else null
        if (controller != null) {
            val mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
            controller.setSystemBarsAppearance(if (darkIcons) mask else 0, mask)
        } else {
            var vis = win.decorView.systemUiVisibility
            vis = if (darkIcons) {
                vis or View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
            } else {
                vis and View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR.inv()
            }
            win.decorView.systemUiVisibility = vis
        }
    }

    private fun applyNavigationBar(colorHex: String, darkIcons: Boolean) {
        val act = activity ?: return
        val win = act.window
        win.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS)
        win.navigationBarColor = parseColor(colorHex)
        val controller = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) win.insetsController else null
        if (controller != null) {
            val mask = WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
            controller.setSystemBarsAppearance(if (darkIcons) mask else 0, mask)
        } else {
            var vis = win.decorView.systemUiVisibility
            vis = if (darkIcons) {
                vis or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
            } else {
                vis and View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR.inv()
            }
            win.decorView.systemUiVisibility = vis
        }
    }

    private fun runOnMain(block: () -> Unit) {
        val act = activity ?: return
        act.runOnUiThread(block)
    }
}

/**
 * 本地音频流服务：把 MediaStore 的 content:// 音频通过 127.0.0.1 的 HTTP 流式输出，
 * 解决 WebView <audio> 无法直接播放 content:// 的问题。支持 Range 以允许拖动进度。
 */
private object LocalAudioServer {
    private const val PORT = 18765
    @Volatile private var started = false

    @Synchronized
    fun getUrl(ctx: Context, contentUri: String): String {
        ensureStarted(ctx)
        return "http://127.0.0.1:$PORT/audio?u=" + URLEncoder.encode(contentUri, "UTF-8")
    }

    private fun ensureStarted(ctx: Context) {
        if (started) return
        started = true
        val appCtx = ctx
        Thread {
            try {
                val ss = ServerSocket()
                ss.reuseAddress = true
                ss.bind(InetSocketAddress(InetAddress.getByName("127.0.0.1"), PORT))
                while (true) {
                    val client = ss.accept()
                    Thread { handle(client, appCtx) }.start()
                }
            } catch (e: Exception) {
                started = false
            }
        }.start()
    }

    private fun handle(socket: Socket, ctx: Context) {
        try {
            socket.soTimeout = 20000
            val reader = BufferedReader(InputStreamReader(socket.getInputStream()))
            val requestLine = reader.readLine() ?: return
            val parts = requestLine.split(" ")
            val path = if (parts.size >= 2) parts[1] else "/"
            var range: String? = null
            var line: String?
            while (reader.readLine().also { line = it } != null) {
                if (line!!.isEmpty()) break
                if (line!!.startsWith("Range:", ignoreCase = true)) range = line!!.substring(6).trim()
            }
            val query = path.substringAfter('?', "")
            val u = query.split("&").firstOrNull { it.startsWith("u=") }
                ?.substring(2)?.let { URLDecoder.decode(it, "UTF-8") }
            if (u.isNullOrBlank()) { sendError(socket, 400, "missing u"); return }
            streamAudio(socket, ctx, u, range)
        } catch (_: Exception) {
        } finally {
            try { socket.close() } catch (_: Exception) {}
        }
    }

    private fun streamAudio(socket: Socket, ctx: Context, uriStr: String, rangeHeader: String?) {
        val uri = Uri.parse(uriStr)
        val cr = ctx.contentResolver
        val afd = try { cr.openAssetFileDescriptor(uri, "r") } catch (_: Exception) { null }
        if (afd == null) { sendError(socket, 404, "not found"); return }
        val total = afd.length
        afd.close()
        val mime = cr.getType(uri) ?: "audio/mpeg"
        val input = cr.openInputStream(uri) ?: run { sendError(socket, 404, "no stream"); return }
        try {
            var start: Long = 0
            var end: Long = if (total > 0) total - 1 else 0
            if (!rangeHeader.isNullOrBlank() && rangeHeader.startsWith("bytes=")) {
                val r = rangeHeader.substring(6).split("-")
                start = r.getOrNull(0)?.toLongOrNull() ?: 0L
                if (r.size > 1 && r[1].isNotBlank()) end = r[1].toLongOrNull() ?: end
            }
            if (start > 0) input.skip(start)
            val length = if (total > 0) { val raw = end - start + 1; if (raw < 0) 0 else raw } else -1
            val out = socket.getOutputStream()
            val sb = StringBuilder()
            val partial = !rangeHeader.isNullOrBlank() && total > 0
            sb.append(if (partial) "HTTP/1.1 206 Partial Content\r\n" else "HTTP/1.1 200 OK\r\n")
            sb.append("Content-Type: $mime\r\n")
            sb.append("Access-Control-Allow-Origin: *\r\n")
            sb.append("Accept-Ranges: bytes\r\n")
            if (length >= 0) sb.append("Content-Length: $length\r\n")
            if (partial) sb.append("Content-Range: bytes $start-$end/$total\r\n")
            sb.append("Cache-Control: no-store\r\n")
            sb.append("Connection: close\r\n")
            sb.append("\r\n")
            out.write(sb.toString().toByteArray(Charsets.UTF_8))
            val buf = ByteArray(16 * 1024)
            var remaining = length
            while (remaining != 0L) {
                val toRead = if (remaining > 0) {
                    val t = remaining.toInt()
                    if (buf.size < t) buf.size else t
                } else buf.size
                val n = input.read(buf, 0, toRead)
                if (n <= 0) break
                out.write(buf, 0, n)
                if (remaining > 0) remaining -= n
            }
            out.flush()
        } finally {
            try { input.close() } catch (_: Exception) {}
        }
    }

    private fun sendError(socket: Socket, code: Int, msg: String) {
        try {
            val out = socket.getOutputStream()
            val body = "$code $msg"
            val payload = body.toByteArray(Charsets.UTF_8)
            out.write(
                ("HTTP/1.1 $code $msg\r\nContent-Type: text/plain\r\nContent-Length: ${payload.size}\r\n" +
                    "Connection: close\r\n\r\n").toByteArray(Charsets.UTF_8)
            )
            out.write(payload)
            out.flush()
        } catch (_: Exception) {}
    }
}
