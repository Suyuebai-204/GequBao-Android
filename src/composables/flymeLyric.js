import { watch } from 'vue'
import { FlymeLyric, isNative } from '../native/bridge.js'
import { player, activeLyricIndex } from './player.js'

// 仅用于调试/诊断：是否检测到 Flyme 状态栏歌词能力
export const flymeLyricState = { supported: false }

let bound = false
let initialized = false
let lastText = ''
let lastPlaying = false

/** 取当前应显示的歌词行；前奏期间预告首句，无歌词返回空串 */
function currentLine() {
  const lrc = player.song?.lrc
  if (!Array.isArray(lrc) || !lrc.length) return ''
  const i = activeLyricIndex.value
  return String((i >= 0 ? lrc[i] : lrc[0])?.text || '').trim()
}

/** 只在切句 / 播放态变化时推送，避免逐帧刷新导致状态栏歌词闪烁 */
async function pushLyric() {
  if (!flymeLyricState.supported) return
  const text = player.playing ? currentLine() : ''
  const playing = !!player.playing
  // 启动瞬间没有歌词时不触发 clear，避免产生一条空媒体通知
  if (!initialized && !text) return
  if (text === lastText && playing === lastPlaying) return
  initialized = true
  lastText = text
  lastPlaying = playing
  try {
    if (text) await FlymeLyric.setLyric({ text, playing })
    else await FlymeLyric.clearLyric()
  } catch {
    /* 原生不可用时静默降级 */
  }
}

/**
 * 初始化 Flyme 状态栏歌词：申请通知权限 → 探测机型 → 绑定歌词时间轴。
 * 在 app 启动时调用一次即可；非 Flyme 机型全程无副作用。
 */
export async function initFlymeLyric() {
  if (!isNative()) return
  try {
    await FlymeLyric.requestNotificationPermission()
    const res = await FlymeLyric.isFlymeSupport()
    flymeLyricState.supported = !!res?.support
  } catch {
    flymeLyricState.supported = false
  }
  if (!flymeLyricState.supported) return

  if (!bound) {
    bound = true
    watch(
      [activeLyricIndex, () => player.song?.lrc, () => player.playing],
      () => pushLyric(),
      { flush: 'post' }
    )
  }
  await pushLyric()
}
