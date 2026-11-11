import { computed, reactive } from 'vue'
import { recordRecent } from './recent.js'
import { showToast } from './toast.js'
import { MusicControls } from '../native/bridge.js'

/**
 * 播放器全局状态：audio 实例、播放队列、浮层显隐都放在模块作用域，
 * 与 PlayerSheet 组件的挂载/显隐解耦 —— 收起浮层不会中断播放。
 */
export const player = reactive({
  open: false,
  loading: false,
  error: '',
  song: null,
  url: '',
  source: '',
  queue: [],
  index: -1,
  playing: false,
  currentTime: 0,
  duration: 0,
  volume: 0.8,
  muted: false,
  repeat: 'all', // off 顺序播放 / all 列表循环 / one 单曲循环
  shuffle: false, // 随机播放
  download: { active: false, percent: 0, message: '' }
})

let autoOpenPlayer = false

let audio = null
let loadToken = 0
let retried = false

/* ============ audio 实例 ============ */

function ensureAudio() {
  if (audio) return audio

  audio = new Audio()
  audio.preload = 'metadata'
  audio.volume = player.volume

  audio.addEventListener('timeupdate', () => {
    player.currentTime = audio.currentTime || 0
    const now = Date.now()
    if (now - lastProgressSync >= 1000) {
      lastProgressSync = now
      syncProgress()
    }
  })
  audio.addEventListener('seeked', () => {
    syncProgress()
  })
  audio.addEventListener('durationchange', () => {
    player.duration = Number.isFinite(audio.duration) ? audio.duration : player.duration
  })
  audio.addEventListener('loadedmetadata', () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) player.duration = audio.duration
  })
  audio.addEventListener('play', () => {
    player.playing = true
  })
  audio.addEventListener('pause', () => {
    player.playing = false
  })
  audio.addEventListener('ended', () => {
    if (player.repeat === 'one') {
      audio.currentTime = 0
      audio.play().catch(() => {})
      return
    }
    if (player.index < player.queue.length - 1) next()
    else if (player.repeat === 'all' && player.queue.length) {
      player.index = 0
      loadCurrent()
    } else player.playing = false
  })
  audio.addEventListener('error', () => {
    if (player.song?.local) {
      player.error = '本地文件无法播放，可能已被移动或删除'
      player.loading = false
      player.playing = false
      return
    }
    if (!retried) {
      retried = true
      refreshUrl(true)
      return
    }
    player.error = '音频加载失败，可重试或换一首'
    player.loading = false
    player.playing = false
  })

  return audio
}

/* ============ 播放控制 ============ */

function toTrack(item = {}) {
  const musicId = Number(item.musicId ?? item.id)
  return {
    musicId: Number.isFinite(musicId) ? musicId : null,
    title: String(item.title ?? item.label ?? ''),
    artist: String(item.artist ?? ''),
    cover: String(item.cover ?? '')
  }
}

function isSameSong(track) {
  return Number(track?.musicId) === Number(player.song?.id) && !!player.url
}

function resumeCurrent() {
  if (autoOpenPlayer) player.open = true
  if (!player.playing) {
    const el = ensureAudio()
    el.play().catch(() => {})
  }
}

export function playTrack(track) {
  const item = toTrack(track)
  if (!item.musicId) return
  if (isSameSong(item)) return resumeCurrent()
  player.queue = [item]
  player.index = 0
  return loadCurrent()
}

export function playList(list, index = 0) {
  const tracks = (Array.isArray(list) ? list : []).map(toTrack).filter((t) => t.musicId)
  if (!tracks.length) return
  const safeIndex = Math.min(Math.max(index, 0), tracks.length - 1)
  if (isSameSong(tracks[safeIndex])) return resumeCurrent()
  player.queue = tracks
  player.index = safeIndex
  return loadCurrent()
}

// 跳转到当前播放列表中的指定曲目
export function playIndex(i) {
  const n = player.queue.length
  if (!n) return
  const idx = ((i % n) + n) % n
  if (idx === player.index && isSameSong(player.queue[idx])) return resumeCurrent()
  player.index = idx
  return loadCurrent()
}

/* ============ 本地音乐播放 ============ */

// 移动端 filePath 是 content:// URI，<audio> 无法直接播放；
// 通过原生本地音频流服务转成 http://127.0.0.1 的直链；桌面端走 localmusic:// 协议
async function localSrc(filePath) {
  if (window.isMobile) {
    try {
      const res = await window.api.player.localAudioUrl({ uri: filePath })
      if (res?.ok && res.data?.url) return res.data.url
    } catch (e) {
      /* 兜底：退回原始路径 */
    }
    return filePath
  }
  return `localmusic://${encodeURIComponent(filePath)}`
}

export function playLocalList(list, index = 0) {
  const tracks = (Array.isArray(list) ? list : [])
    .filter((t) => t?.path)
    .map((t) => ({
      local: true,
      path: t.path,
      src: '',
      title: t.title || t.name || '未知曲目',
      artist: t.artist || '',
      durationSec: t.durationSec || 0
    }))
  if (!tracks.length) return

  const safeIndex = Math.min(Math.max(index, 0), tracks.length - 1)
  const current = player.queue[player.index]
  if (current?.local && current.path === tracks[safeIndex].path && player.url) {
    return resumeCurrent()
  }

  player.queue = tracks
  player.index = safeIndex
  return loadCurrent()
}

async function loadLocal(track) {
  const token = ++loadToken
  retried = false
  resetDownload()
  player.loading = false
  player.error = ''
  player.currentTime = 0
  player.duration = track.durationSec || 0
  player.song = {
    id: null,
    local: true,
    title: track.title,
    artist: track.artist,
    cover: '',
    lrc: [],
    durationSec: track.durationSec || 0,
    netdiskUrl: '',
    playId: '',
    urlA: ''
  }
  player.url = ''
  player.source = 'local'
  if (autoOpenPlayer) player.open = true

  const src = await localSrc(track.path)
  if (token !== loadToken) return
  player.url = src

  const el = ensureAudio()
  el.src = src
  el.currentTime = 0
  el.play().catch(() => {
    player.playing = false
  })
}

export async function initPlayerSettings() {
  try {
    const res = await window.api?.settings?.get?.()
    if (!res?.ok) return
    const s = res.data || {}
    if (Number.isFinite(Number(s.volume))) setVolume(Number(s.volume) / 100)
    if (['off', 'all', 'one'].includes(s.repeatMode)) player.repeat = s.repeatMode
    if (typeof s.shuffle === 'boolean') player.shuffle = s.shuffle
    autoOpenPlayer = !!s.autoOpenPlayer
  } catch {
    /* 设置不可用时使用内置默认 */
  }
}

function persistSettings(patch) {
  window.api?.settings?.set?.(patch).catch(() => {})
}

export function setRepeat(mode) {
  if (!['off', 'all', 'one'].includes(mode)) return
  player.repeat = mode
  persistSettings({ repeatMode: mode })
  // 同步给原生，刷新通知栏/锁屏循环按钮文案
  try { MusicControls.setRepeatMode?.({ mode }) } catch {}
}

export function setAutoOpenPlayer(value) {
  autoOpenPlayer = !!value
  persistSettings({ autoOpenPlayer: autoOpenPlayer })
}

export function setShuffle(value) {
  player.shuffle = !!value
  persistSettings({ shuffle: player.shuffle })
}

export function toggleShuffle() {
  setShuffle(!player.shuffle)
}

export function cycleRepeat() {
  const order = ['off', 'all', 'one']
  const nextMode = order[(order.indexOf(player.repeat) + 1) % order.length]
  setRepeat(nextMode)
}

// 随机模式下选一个与当前不同的曲目索引
function randomOtherIndex() {
  const n = player.queue.length
  if (n <= 1) return player.index
  let i = player.index
  while (i === player.index) i = Math.floor(Math.random() * n)
  return i
}

// 规范化封面 URL：补全协议相对地址（//xxx），避免 WebView 拒绝加载
export function fullCover(url) {
  if (!url) return ''
  if (url.startsWith('//')) return 'https:' + url
  return url
}

/**
 * 所有网络曲目（含云端歌单返回的 title/author/pic/url）一律经 /music/{id} 解析：
 * 歌单接口只给了歌曲基本信息与直链，没有歌词、playId、备用直链和封面全集；
 * 直接拿 url 播放会让播放页永远「暂无歌词」，也无法在直链失效时刷新。
 * title/artist/cover 只作为解析期间占位的展示数据。
 */
async function loadCurrent() {
  const track = player.queue[player.index]
  if (!track) return
  if (track.local) return loadLocal(track)
  if (!track.musicId) return

  const token = ++loadToken
  retried = false
  resetDownload()
  if (autoOpenPlayer) player.open = true
  player.loading = true
  player.error = ''
  player.currentTime = 0
  player.duration = 0
  player.song = {
    id: track.musicId,
    title: track.title,
    artist: track.artist,
    cover: fullCover(track.cover),
    lrc: [],
    durationSec: 0,
    netdiskUrl: '',
    playId: '',
    urlA: ''
  }

  try {
    const res = await window.api.player.song(track.musicId)
    if (token !== loadToken) return

    if (!res?.ok) {
      player.error = res?.error || '获取播放地址失败'
      return
    }

    const { detail, url, source } = res.data
    player.song = detail
    if (player.song) player.song.cover = fullCover(player.song.cover)
    player.url = url
    player.source = source
    player.duration = detail.durationSec || 0
    recordRecent(detail)

    // 同步到原生锁屏/通知栏控制器
    syncMusicControls(detail, true)

    const el = ensureAudio()
    el.src = url
    el.currentTime = 0
    try {
      await el.play()
    } catch {
      player.playing = false
    }
  } catch (error) {
    if (token === loadToken) player.error = error?.message || '获取播放地址失败'
  } finally {
    if (token === loadToken) player.loading = false
  }
}

async function refreshUrl(silent = false) {
  const song = player.song
  if (!song?.playId) {
    if (!silent) player.error = '播放地址已失效'
    return
  }

  try {
    const res = await window.api.player.refreshUrl({
      playId: song.playId,
      musicId: song.id,
      urlA: song.urlA || ''
    })
    if (!res?.ok) throw new Error(res?.error || '播放地址已失效')

    const keepTime = player.currentTime
    player.url = res.data.url
    player.source = res.data.source

    const el = ensureAudio()
    el.src = res.data.url
    el.currentTime = keepTime
    await el.play().catch(() => {})
    player.error = ''
  } catch (error) {
    player.error = error?.message || '播放地址已失效'
  }
}

export function retry() {
  retried = false
  if (player.url) {
    const el = ensureAudio()
    el.load()
    el.play().catch(() => {})
    player.error = ''
    return
  }
  loadCurrent()
}

export function play() {
  const el = ensureAudio()
  if (!player.song) return
  player.playing = true
  el.play().catch(() => {
    player.playing = false
  })
  syncPlayState(true)
}

export function pause() {
  const el = ensureAudio()
  player.playing = false
  el.pause()
  syncPlayState(false)
}

export function toggle() {
  if (player.playing) pause()
  else play()
}

export function seek(seconds) {
  const el = ensureAudio()
  const total = player.duration || 0
  const next = Math.min(Math.max(Number(seconds) || 0, 0), total || Infinity)
  el.currentTime = next
  player.currentTime = next
}

export function setVolume(value) {
  const volume = Math.min(Math.max(Number(value) || 0, 0), 1)
  player.volume = volume
  player.muted = volume === 0
  const el = ensureAudio()
  el.volume = volume
  el.muted = volume === 0
  clearTimeout(volumeSaveTimer)
  volumeSaveTimer = setTimeout(() => persistSettings({ volume: Math.round(volume * 100) }), 400)
}

export function toggleMute() {
  const el = ensureAudio()
  const target = player.volume > 0 ? 0 : 0.8
  setVolume(target)
  el.muted = target === 0
}

export function next() {
  const n = player.queue.length
  if (player.shuffle && n > 1) {
    player.index = randomOtherIndex()
    loadCurrent()
    return
  }
  if (player.index < n - 1) {
    player.index += 1
    loadCurrent()
  } else if (player.repeat === 'all' && n) {
    player.index = 0
    loadCurrent()
  }
}

export function prev() {
  if (player.currentTime > 3) {
    seek(0)
    return
  }
  const n = player.queue.length
  if (player.shuffle && n > 1) {
    player.index = randomOtherIndex()
    loadCurrent()
    return
  }
  if (player.index > 0) {
    player.index -= 1
    loadCurrent()
  } else {
    seek(0)
  }
}

/* ============ 后台播放 / 锁屏控制器 ============ */

let musicControlsReady = false
let lastProgressSync = 0

// 把当前曲目同步到原生通知栏/锁屏；需要在原生插件就绪后调用
async function syncMusicControls(song, isPlaying) {
  try {
    if (!MusicControls) return
    const payload = {
      track: {
        title: song?.title || '未知歌曲',
        artist: song?.artist || '未知歌手',
        cover: song?.cover || '',
        duration: Number(player.duration) || Number(song?.durationSec) || 0
      },
      isPlaying: !!isPlaying,
      position: Number(player.currentTime) || 0,
      repeat: player.repeat
    }
    if (!musicControlsReady) {
      await MusicControls.create(payload)
      musicControlsReady = true
    } else {
      await MusicControls.update(payload)
    }
  } catch {
    /* 原生插件不可用时静默降级 */
  }
}

// 周期性把播放进度（秒）上报给原生，驱动系统媒体控制进度条
function syncProgress() {
  if (!MusicControls || !musicControlsReady) return
  try {
    MusicControls.updateProgress({
      position: Number(player.currentTime) || 0,
      duration: Number(player.duration) || 0
    })
  } catch {
    /* 原生插件不可用时静默降级 */
  }
}

// 供播放/暂停切换时调用
export function syncPlayState(isPlaying) {
  syncMusicControls(player.song, isPlaying)
}

// 监听原生通知栏/锁屏/耳机的播放控制事件，回驱 WebView 中的 <audio>
export async function initMusicControlsListeners() {
  let lastMsg = ''
  let lastTime = 0
  try {
    await MusicControls.addListener('controlsNotification', ({ message, position }) => {
      // 去抖：play/pause/next/previous 可能经广播与 MediaSession 回调各触发一次
      const now = Date.now()
      if (message !== 'seek' && message === lastMsg && now - lastTime < 350) return
      lastMsg = message
      lastTime = now

      if (message === 'play') play()
      else if (message === 'pause') pause()
      else if (message === 'next') next()
      else if (message === 'previous') prev()
      else if (message === 'cycleRepeat') cycleRepeat()
      else if (message === 'seek') seek(Number(position) || 0)
    })
  } catch {
    /* 原生插件不可用时静默降级 */
  }
}

/* ============ 直链下载 ============ */

let downloadProgressBound = false
let volumeSaveTimer = null

function bindDownloadProgress() {
  if (downloadProgressBound || !window.api?.player?.onDownloadProgress) return
  downloadProgressBound = true
  window.api.player.onDownloadProgress(({ percent }) => {
    if (player.download.active) player.download.percent = Number(percent) || 0
  })
}

function resetDownload() {
  player.download.active = false
  player.download.percent = 0
  player.download.message = ''
}

function fallbackCopyText(text) {
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

export async function copyUrl() {
  const url = player.url
  if (!url) return false
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url)
      return true
    }
  } catch {
    /* clipboard API 失败则走兜底 */
  }
  return fallbackCopyText(url)
}

export async function download() {
  const song = player.song
  if (!song?.id || player.download.active) return

  bindDownloadProgress()
  player.download.active = true
  player.download.percent = 0
  player.download.message = ''

  // 读取「下载个性化」设置，决定是否一并下载封面 / 歌词
  let downloadCover = true
  let downloadLyric = true
  try {
    const sres = await window.api.settings.get()
    const s = sres?.data ?? sres
    if (s) {
      if (typeof s.downloadCover === 'boolean') downloadCover = s.downloadCover
      if (typeof s.downloadLyric === 'boolean') downloadLyric = s.downloadLyric
    }
  } catch { /* 取不到则用默认 true */ }

  try {
    const res = await window.api.player.download({
      musicId: song.id,
      playId: song.playId,
      url: player.url,
      urlA: song.urlA,
      title: song.title,
      artist: song.artist,
      cover: song.cover || '',
      lrc: Array.isArray(player.song?.lrc) ? player.song.lrc : [],
      downloadCover,
      downloadLyric
    })

    if (!res?.ok) throw new Error(res?.error || '下载失败')
    if (res.data?.canceled) {
      resetDownload()
      return
    }

    player.download.active = false
    player.download.percent = 100
    player.download.message = '已保存'
    showToast('已保存到下载目录', { type: 'success' })
    setTimeout(() => {
      if (player.download.message === '已保存') resetDownload()
    }, 3000)
  } catch (error) {
    player.download.active = false
    player.download.percent = 0
    player.download.message = error?.message || '下载失败'
    showToast(player.download.message, { type: 'error' })
  }
}

export function open() {
  if (player.song) player.open = true
}

export function close() {
  player.open = false
}

/* ============ 派生状态 ============ */

export const progress = computed(() => {
  const total = player.duration || player.song?.durationSec || 0
  if (!total) return 0
  return Math.min(player.currentTime / total, 1)
})

export const activeLyricIndex = computed(() => {
  const lrc = player.song?.lrc
  if (!Array.isArray(lrc) || !lrc.length) return -1
  const t = player.currentTime + 0.15
  let index = -1
  for (let i = 0; i < lrc.length; i++) {
    if (lrc[i].time <= t) index = i
    else break
  }
  return index
})

export function formatTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
