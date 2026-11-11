// 本地音乐库扫描（安卓端）—— 移植自 Windows 端 main/library.js
// 桌面端用 fs 递归遍历目录；安卓端改为 MediaStore / SAF 查询系统媒体库（原生插件完成）。
// 本文件负责把原生返回的 tracks 规整成与桌面一致的列表结构。
import { scanLibraryNative } from '../native/bridge.js'

const AUDIO_EXT = new Set(['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.ape'])

function formatBytes(bytes) {
  const n = Number(bytes) || 0
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${n} B`
}

// 「歌手 - 标题」兜底（原生已尽量给元数据；这里兜底文件名解析）
function fromFileName(name) {
  const base = String(name || '').replace(/\.[^.]+$/, '').trim()
  const m = /^(.+?)\s*[-–—]\s*(.+)$/.exec(base)
  return m ? { artist: m[1].trim(), title: m[2].trim() } : { artist: '', title: base }
}

function normalize(str = '') {
  return String(str).replace(/\s+/g, ' ').trim()
}

/**
 * 扫描本地音乐。安卓端 dir 参数忽略（总是查询系统媒体库）。
 * 返回 { dir, list, totalSize, totalSizeText }
 */
export async function scanLibrary(dir) {
  const result = await scanLibraryNative()
  const tracks = Array.isArray(result?.tracks) ? result.tracks : []

  const list = tracks.map((t) => {
    const fallback = fromFileName(t.title || t.displayName || '')
    const uri = t.uri || ''
    const size = Number(t.size) || 0
    return {
      // path 用 content URI，player.js 直接喂给 <audio>
      path: uri,
      title: normalize(t.title) || fallback.title,
      artist: normalize(t.artist) || fallback.artist,
      album: normalize(t.album) || '',
      year: Number(t.year) || 0,
      durationSec: Number(t.durationSec) || 0,
      size,
      sizeText: formatBytes(size),
      format: normalize(t.format) || (uri ? (uri.split('.').pop() || '').toUpperCase() : '')
    }
  })

  const totalSize = list.reduce((sum, item) => sum + (item.size || 0), 0)
  return {
    dir: '系统媒体库',
    list,
    totalSize,
    totalSizeText: formatBytes(totalSize)
  }
}

export { AUDIO_EXT }
