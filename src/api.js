// 安卓端 window.api 实现 —— 统一接缝，签名与 Windows 端 preload/index.js 完全一致。
// 渲染层（components/views/composables）零改动调用；内部直接调用移植后的 services。
import { suggest, searchSongs, guessMusics, hotWords, hotMusic, topMusic } from './services/search.js'
import { openSong, refreshPlayUrl, downloadToFile, safeFileName, getPlayUrl } from './services/song.js'
import { getHistory, pushHistory, removeHistory, clearHistory } from './services/store.js'
import { getSettings, updateSettings } from './services/settings.js'
import { scanLibrary } from './services/library.js'
import { saveToDownloadsNative, isNative, nativeHttp, Gequbao } from './native/bridge.js'
import { UA } from './services/http.js'
import { withNetworkHint } from './composables/networkHint.js'

/* ---------- 下载进度事件总线（替代桌面端 ipc player:download-progress） ---------- */
const downloadListeners = new Set()
function emitDownloadProgress(progress) {
  for (const cb of downloadListeners) {
    try {
      cb(progress)
    } catch {
      /* ignore */
    }
  }
}

/* ---------- 工具 ---------- */
async function guard(task) {
  try {
    return { ok: true, data: await task() }
  } catch (error) {
    return { ok: false, error: error?.message || '未知错误' }
  }
}

async function blobToBase64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode.apply(null, buf.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/* ---------- 下载落盘 ---------- */
async function doDownload(payload, onProgress) {
  const name = safeFileName(
    `${payload?.title || '音乐'}${payload?.artist ? ' - ' + payload.artist : ''}`,
    `music-${payload?.musicId || ''}`
  )

  // 优先重新取直链，避免用过期的地址
  let url = ''
  try {
    const resolved = await getPlayUrl(payload?.playId, payload?.musicId)
    url = resolved.url
  } catch {
    /* 落到下面的兜底 */
  }
  if (!url) url = payload?.url || payload?.urlA || ''
  if (!url) throw new Error('播放地址已失效，请重新播放后再下载')

  let blob
  if (isNative()) {
    // 原生端直链下载也走原生 HTTP 代理，绕开 WebView 的 CORS 限制
    const res = await nativeHttp({
      url,
      method: 'GET',
      headers: { 'User-Agent': UA, Accept: '*/*', Range: 'bytes=0-' },
      timeout: 30000
    })
    const bin = atob(res.bodyBase64 || '')
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    blob = new Blob([bytes], { type: 'audio/mpeg' })
    onProgress?.({ percent: 100 })
    emitDownloadProgress({ percent: 100 })
  } else {
    const r = await downloadToFile(url, (percent) => {
      onProgress?.({ percent })
      emitDownloadProgress({ percent })
    })
    blob = r.blob
  }

  const fileName = `${name}.mp3`
  if (isNative()) {
    const base64 = await blobToBase64(blob)
    const res = await saveToDownloadsNative(fileName, base64)
    if (!res?.ok) throw new Error(res?.error || '保存到下载目录失败')
  } else {
    // 浏览器：直接触发下载
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = fileName
    a.click()
    setTimeout(() => URL.revokeObjectURL(href), 1000)
  }

  // 下载个性化：一并保存封面 / 歌词（失败不影响主流程）
  if (payload.downloadCover && payload.cover) {
    try {
      const coverUrl = normalizeCover(payload.cover)
      if (coverUrl) {
        const cres = await nativeHttp({ url: coverUrl, method: 'GET', headers: { 'User-Agent': UA }, timeout: 20000 })
        if (cres?.status === 200 && cres.bodyBase64) {
          if (isNative()) {
            await saveToDownloadsNative(`${name}.jpg`, cres.bodyBase64, 'image/jpeg')
          } else {
            downloadBase64Browser(cres.bodyBase64, `${name}.jpg`, 'image/jpeg')
          }
        }
      }
    } catch { /* 封面下载失败忽略 */ }
  }

  if (payload.downloadLyric && Array.isArray(payload.lrc) && payload.lrc.length) {
    try {
      const lrcText = buildLrc(payload.lrc)
      if (lrcText) {
        const lrcBase64 = utf8ToBase64(lrcText)
        if (isNative()) {
          await saveToDownloadsNative(`${name}.lrc`, lrcBase64, 'text/plain')
        } else {
          downloadBase64Browser(lrcBase64, `${name}.lrc`, 'text/plain')
        }
      }
    } catch { /* 歌词下载失败忽略 */ }
  }

  return { canceled: false, path: fileName, bytes: blob.size }
}

/* 规范化封面地址：补全协议相对地址 */
function normalizeCover(url) {
  if (!url) return ''
  if (url.startsWith('//')) return 'https:' + url
  return url
}

/* 由 [{ time: 秒, text }] 拼出标准 LRC 文本 */
function buildLrc(lrc) {
  const lines = []
  for (const it of lrc) {
    const t = Number(it?.time) || 0
    const mm = Math.floor(t / 60)
    const ss = Math.floor(t % 60)
    const xx = Math.round((t - Math.floor(t)) * 100)
    const stamp = `[${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(xx).padStart(2, '0')}]`
    lines.push(`${stamp}${it?.text || ''}`)
  }
  return lines.join('\n')
}

/* UTF-8 字符串 → base64 */
function utf8ToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)))
}

/* 浏览器环境：把 base64 内容作为指定类型文件触发下载 */
function downloadBase64Browser(base64, fileName, mime) {
  try {
    const bin = atob(base64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const blob = new Blob([bytes], { type: mime })
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = fileName
    a.click()
    setTimeout(() => URL.revokeObjectURL(href), 1000)
  } catch { /* 忽略 */ }
}

/* ---------- 打开外部链接 ---------- */
async function openExternal(url) {
  try {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      const { Browser } = await import('@capacitor/browser')
      await Browser.open({ url })
      return { ok: true }
    }
    return { ok: false, error: '无效的链接' }
  } catch (error) {
    return { ok: false, error: error?.message || '打开失败' }
  }
}

export function createApi() {
  return {
    theme: {
      // 移动端主题用 CSS 变量 + prefers-color-scheme 驱动，无需通知原生
      setNative: () => {},
      setStatusBar: (opts) => guard(() => Gequbao.setStatusBar(opts)),
      setNavigationBar: (opts) => guard(() => Gequbao.setNavigationBar(opts))
    },

    history: {
      list: () => guard(() => getHistory()),
      add: (entry) => guard(() => pushHistory(entry)),
      remove: (id) => guard(() => removeHistory(id)),
      clear: () => guard(() => clearHistory())
    },

    search: {
      suggest: (keyword) => guard(() => suggest(keyword)),
      songs: (keyword) => guard(() => searchSongs(keyword)),
      guess: (keyword) => guard(() => guessMusics(keyword)),
      hot: () => guard(() => hotWords()),
      hotMusic: (page) => guard(() => hotMusic(page)),
      top: (type, page) => guard(() => topMusic(type, page))
    },

    player: {
      song: (musicId) => guard(() => openSong(musicId)),
      refreshUrl: (payload) =>
        guard(() => refreshPlayUrl(payload?.playId, payload?.musicId, payload?.urlA)),
      // 下载字节流走 nativeHttp，不经过 http.js 的 request()，单独纳入网络提示
      download: (payload) => guard(() => withNetworkHint(() => doDownload(payload, () => {}))),
      localAudioUrl: (payload) => guard(() => Gequbao.localAudioUrl(payload)),
      onDownloadProgress: (callback) => {
        downloadListeners.add(callback)
        return () => downloadListeners.delete(callback)
      }
    },

    settings: {
      get: () => guard(() => getSettings()),
      set: (patch) => guard(() => updateSettings(patch || {}))
    },

    library: {
      scan: (dir) => guard(() => scanLibrary(dir))
    },

    dialog: {
      // 移动端无目录选择对话框：返回空路径表示「扫描整个系统媒体库」
      pickDirectory: () => Promise.resolve({ ok: true, canceled: false, path: '' })
    },

    openExternal: (url) => openExternal(url),

    // 窗口控制：移动端无需最小化/最大化/关闭
    window: {
      minimize: () => {},
      toggleMaximize: () => {},
      close: () => {},
      state: () => Promise.resolve({ maximized: false }),
      onStateChanged: () => () => {}
    }
  }
}
