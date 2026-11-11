import { ref } from 'vue'

// 播放页反馈小窗开关。提升到全局共享，让系统返回键能优先关闭小窗，
// 而不是直接收起播放页甚至弹出退出确认框。
export const feedbackOpen = ref(false)

export function openFeedback() {
  feedbackOpen.value = true
}

export function closeFeedback() {
  feedbackOpen.value = false
}
