// 最近播放持久化（安卓端）—— 移植自 Windows 端 main/store.js
// 桌面端用 fs 读写 play-history.json；安卓端换成 @capacitor/preferences（KV 存储）。
import { Preferences } from '@capacitor/preferences'

const MAX_HISTORY = 100
const KEY = 'play-history'

let cache = null

async function readAll() {
  if (cache) return cache
  try {
    const { value } = await Preferences.get({ key: KEY })
    const parsed = value ? JSON.parse(value) : []
    cache = Array.isArray(parsed) ? parsed : []
  } catch {
    cache = []
  }
  return cache
}

async function writeAll(list) {
  cache = list
  await Preferences.set({ key: KEY, value: JSON.stringify(list) })
}

function toEntry(raw = {}) {
  const id = Number(raw.id ?? raw.musicId)
  if (!Number.isFinite(id) || id <= 0) return null
  return {
    id,
    title: String(raw.title || '未知歌曲').slice(0, 200),
    artist: String(raw.artist || '').slice(0, 200),
    cover: String(raw.cover || ''),
    duration: String(raw.duration || ''),
    durationSec: Number(raw.durationSec) || 0,
    playId: String(raw.playId || ''),
    urlA: String(raw.urlA || ''),
    netdiskUrl: String(raw.netdiskUrl || ''),
    playedAt: Number(raw.playedAt) || Date.now()
  }
}

export async function getHistory(limit = MAX_HISTORY) {
  const list = await readAll()
  return list.slice(0, limit)
}

export async function pushHistory(raw) {
  const entry = toEntry(raw)
  if (!entry) return getHistory()
  const list = await readAll()
  const next = [entry, ...list.filter((item) => item.id !== entry.id)].slice(0, MAX_HISTORY)
  await writeAll(next)
  return next
}

export async function removeHistory(id) {
  const target = Number(id)
  const list = await readAll()
  const next = list.filter((item) => Number(item.id) !== target)
  await writeAll(next)
  return next
}

export async function clearHistory() {
  await writeAll([])
  return []
}
