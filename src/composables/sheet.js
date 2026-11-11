import { reactive } from 'vue'

/*
 * 统一的底部弹窗（ActionSheet）状态。调用 openSheet 传入标题与可选项，
 * 返回 Promise，用户选择后 resolve 对应 value，点击遮罩/取消则 resolve(null)。
 * options: [{ label, value, icon?, active?, danger? }]
 */
const state = reactive({
  open: false,
  title: '',
  options: [],
  resolve: null
})

export function openSheet({ title = '', options = [] } = {}) {
  return new Promise((resolve) => {
    state.title = title
    state.options = options.map((o, i) => ({ ...o, _i: i }))
    state.resolve = resolve
    state.open = true
  })
}

export function useSheet() {
  return state
}

export function closeSheet(value) {
  if (state.resolve) state.resolve(value)
  state.open = false
  state.resolve = null
}
