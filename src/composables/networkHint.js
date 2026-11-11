// 全局网络状态提示：用户点击后立刻知道「请求已经发出去了」。
// http.js 的 request() 是所有站点请求的统一入口，这里按并发请求数共用一条
// 单例常驻 toast，避免多个请求（详情页 + 直链 + 自动重登）刷出一串提示。
import { showToast, dismissToast, hasStickyToast } from './toast.js'

const SHOW_DELAY = 200 // 太快完成的请求不必闪一下提示
const HIDE_DELAY = 300 // 请求链之间的空隙也保持连续，不闪烁

let pending = 0
let tipId = null
let showTimer = null
let hideTimer = null

function clearShowTimer() {
  if (showTimer) clearTimeout(showTimer)
  showTimer = null
}

function clearHideTimer() {
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = null
}

function showTip() {
  if (tipId != null || pending === 0) return
  // 调用方已经给出更具体的常驻提示（解析歌曲页、下载、刷新登录态）时不重复打扰
  if (hasStickyToast()) return
  tipId = showToast('正在请求…', { duration: 0 })
}

function hideTip() {
  if (tipId == null) return
  dismissToast(tipId)
  tipId = null
}

export function beginNetwork() {
  pending += 1
  clearHideTimer()
  if (tipId == null && showTimer == null) {
    showTimer = setTimeout(() => {
      showTimer = null
      showTip()
    }, SHOW_DELAY)
  }
}

export function endNetwork() {
  pending = Math.max(0, pending - 1)
  if (pending > 0) return
  clearShowTimer()
  hideTimer = setTimeout(() => {
    hideTimer = null
    if (pending === 0) hideTip()
  }, HIDE_DELAY)
}

/** 包住绕过 request() 的网络任务（下载字节流、封面等），同样给出请求中提示 */
export async function withNetworkHint(task) {
  beginNetwork()
  try {
    return await task()
  } finally {
    endNetwork()
  }
}
