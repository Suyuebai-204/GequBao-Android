import { reactive } from 'vue'

const state = reactive({ items: [] })
let seq = 0

export function showToast(message, opts = {}) {
  const id = ++seq
  const duration = opts.duration ?? 2200
  // duration <= 0 表示常驻，需由调用方在异步流程结束时 dismissToast(id)
  const item = { id, message, type: opts.type || 'info', sticky: duration <= 0 }
  state.items.push(item)
  if (duration > 0) setTimeout(() => dismissToast(id), duration)
  return id
}

export function dismissToast(id) {
  const i = state.items.findIndex((x) => x.id === id)
  if (i >= 0) state.items.splice(i, 1)
}

/** 是否已有更具体的常驻提示（如「正在解析歌曲页面…」），用于抑制全局「正在请求…」 */
export function hasStickyToast() {
  return state.items.some((x) => x.sticky)
}

export function useToast() {
  return state
}
