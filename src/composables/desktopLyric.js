import { reactive, watch } from 'vue'
import { MusicControls } from '../native/bridge.js'
import { player, activeLyricIndex } from './player.js'
import { getSettings, updateSettings } from '../services/settings.js'
import { showToast } from './toast.js'

// 桌面歌词（悬浮窗）全局状态：开关、当前句、下一句、行号、歌曲信息、播放态
export const desktopLyric = reactive({
  enabled: false, text: '', next: '', title: '', artist: '', playing: false, index: -1
})

let bound = false

// 组织悬浮窗卡片所需的全部内容；index 用于原生按行号奇偶左右交替
function computeLyric() {
  const song = player.song
  const lrc = song?.lrc
  let text = ''
  let next = ''
  let index = -1
  if (Array.isArray(lrc) && lrc.length) {
    const i = activeLyricIndex.value
    if (i >= 0) {
      index = i
      text = String(lrc[Math.min(i, lrc.length - 1)]?.text || '').trim()
      const n = lrc[i + 1]
      if (n) next = String(n.text || '').trim()
    } else {
      // 尚未唱到第一句：先预告前两句
      index = 0
      text = String(lrc[0]?.text || '').trim()
      next = String(lrc[1]?.text || '').trim()
    }
  }
  return {
    text,
    next,
    index,
    title: String(song?.title || '').trim(),
    artist: String(song?.artist || '').trim(),
    playing: player.playing
  }
}

// 把歌词/歌曲信息/播放态推送到原生悬浮窗（仅在开启时）
function pushLyric() {
  if (!desktopLyric.enabled) return
  Object.assign(desktopLyric, computeLyric())
  try {
    MusicControls.updateDesktopLyric({
      text: desktopLyric.text,
      next: desktopLyric.next,
      title: desktopLyric.title,
      artist: desktopLyric.artist,
      playing: desktopLyric.playing,
      index: desktopLyric.index
    })
  } catch {
    /* 原生不可用时静默降级 */
  }
}

/**
 * 开关桌面歌词。
 * @param enabled 目标状态
 * @param silent  静默模式（启动恢复时用，缺少悬浮窗权限不弹提示、不引导）
 */
export async function setDesktopLyricEnabled(enabled, silent = false) {
  desktopLyric.enabled = enabled
  if (enabled) pushLyric()
  try {
    const res = await MusicControls.setDesktopLyric({ enabled })
    if (enabled && res && res.granted === false) {
      // 缺少悬浮窗权限：回退状态，提示并引导去设置
      desktopLyric.enabled = false
      if (!silent) {
        showToast('请在系统设置中开启「悬浮窗」权限', { type: 'error' })
        try {
          MusicControls.openOverlayPermissionSettings()
        } catch {
          /* ignore */
        }
      }
    }
    await updateSettings({ desktopLyric: desktopLyric.enabled })
  } catch {
    if (enabled) desktopLyric.enabled = false
    if (!silent) showToast('桌面歌词开启失败', { type: 'error' })
  }
}

export function toggleDesktopLyric() {
  return setDesktopLyricEnabled(!desktopLyric.enabled)
}

export async function initDesktopLyric() {
  // 恢复上次设置
  try {
    const s = await getSettings()
    if (s && s.desktopLyric) {
      await setDesktopLyricEnabled(true, true)
    }
  } catch {
    /* ignore */
  }

  // 监听通知栏/系统媒体播放器的桌面歌词开关回调
  if (!bound) {
    bound = true
    try {
      await MusicControls.addListener('controlsNotification', ({ message, enabled }) => {
        if (message !== 'desktopLyric') return
        // 通知栏按钮触发：走完整开关流程（含悬浮窗创建/销毁与权限校验）
        setDesktopLyricEnabled(!!enabled)
      })
    } catch {
      /* ignore */
    }
  }

  // 歌词行 / 播放态变化时实时推送
  watch(
    [
      activeLyricIndex,
      () => player.playing,
      () => player.song?.lrc,
      () => player.song?.title,
      () => player.song?.artist
    ],
    () => pushLyric(),
    { flush: 'post' }
  )
}
