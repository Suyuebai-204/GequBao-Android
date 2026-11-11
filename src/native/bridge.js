// 原生能力桥接层：封装 Capacitor 自定义插件 Gequbao（后台播放/媒体库/下载导出）。
// 在浏览器（vite dev）下所有原生调用返回安全兜底，保证界面不崩。
import { Capacitor, registerPlugin } from '@capacitor/core'

// 自定义原生插件（Android 端实现见 android/app/src/main/java/.../GequbaoPlugin.kt）
export const Gequbao = registerPlugin('Gequbao')

export function isNative() {
  return Capacitor.isNativePlatform()
}

export function isTV() {
  // 由原生注入到 window.isTV；打包时也可通过 flavor 区分
  return !!window.isTV
}

/* 本地音乐库扫描（MediaStore / SAF）
 * 原生返回 { tracks: [{ id, title, artist, album, year, durationSec, size, format, uri }] } */
export async function scanLibraryNative() {
  if (!isNative()) return { tracks: [] }
  try {
    return await Gequbao.scanLibrary()
  } catch (e) {
    return { tracks: [], error: e?.message || '扫描失败' }
  }
}

/* 原生 HTTP 代理：在安卓端由 Java 侧发起请求，绕开 WebView 的 CORS 限制。
 * 入参 { url, method, headers, body, timeout }，返回 { status, headers, bodyBase64 }。
 * bodyBase64 为原始响应字节（便于在 JS 侧用 TextDecoder 按正确编码解码）。 */
export async function nativeHttp(req) {
  if (!isNative()) throw new Error('native http 仅在原生环境可用')
  const res = await Gequbao.http({
    url: req.url,
    method: req.method || 'GET',
    headers: req.headers || {},
    body: req.body || '',
    timeout: req.timeout || 12000
  })
  return {
    status: res.status,
    headers: res.headers || {},
    bodyBase64: res.bodyBase64 || '',
    finalUrl: res.finalUrl || null,
    redirected: !!res.redirected,
    cookies: res.cookies || ''
  }
}

/* 把下载结果（base64）导出到系统「下载」目录
 * 入参：{ name, dataBase64, mime } —— 原生用 MediaStore 写入 Downloads/歌曲宝；
 * mime 缺省 audio/mpeg，封面/歌词另传 image/jpeg、text/plain 等 */
export async function saveToDownloadsNative(name, dataBase64, mime = 'audio/mpeg') {
  if (!isNative()) {
    // 浏览器：直接触发下载
    try {
      const link = document.createElement('a')
      link.href = `data:${mime};base64,${dataBase64}`
      link.download = name
      link.click()
      return { ok: true }
    } catch {
      return { ok: false, error: '浏览器环境不支持保存' }
    }
  }
  return Gequbao.saveToDownloads({ name, dataBase64, mime })
}

/* 后台播放 / 锁屏控制器（MusicControls 原生插件） */
export const MusicControls = registerPlugin('MusicControls')
