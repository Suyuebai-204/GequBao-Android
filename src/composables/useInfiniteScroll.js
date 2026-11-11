import { onMounted, onBeforeUnmount, onActivated, onDeactivated, nextTick } from 'vue'

/**
 * 监听滚动容器（.content）滚动，接近底部时自动调用 loadMore 加载下一页，
 * 实现「下滑即加载」的无缝分页，替代「加载更多」按钮。
 * - loadMore: () => Promise|void，内部应自行处理加载中/是否有下一页
 * - hasNextRef: 响应式 ref，表示是否还有下一页
 * 注：组件被 keep-alive 缓存时 onBeforeUnmount 不会触发，故用 paused 标记
 * 在失活（切走）时暂停监听，避免隐藏页面在后台误触发加载更多。
 */
export function useInfiniteScroll(loadMore, hasNextRef, opts = {}) {
  const threshold = opts.threshold ?? 320
  let el = null
  let loading = false
  let timer = null
  let mo = null
  let paused = false

  async function tryLoad() {
    if (loading || paused || !hasNextRef.value) return
    loading = true
    try {
      await loadMore()
    } finally {
      loading = false
    }
    // 内容仍未撑满容器时继续补页，直到可滚动或有底
    await nextTick()
    if (el && !paused && hasNextRef.value && el.scrollHeight <= el.clientHeight + 4) {
      await tryLoad()
    }
  }

  function onScroll() {
    if (!el || paused) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - threshold) tryLoad()
  }

  function scheduleCheck() {
    if (paused || timer) return
    timer = setTimeout(onScroll, 120)
  }

  onMounted(() => {
    el = document.querySelector('.content')
    el?.addEventListener('scroll', onScroll, { passive: true })
    if (el && 'MutationObserver' in window) {
      mo = new MutationObserver(scheduleCheck)
      mo.observe(el, { childList: true, subtree: true })
    }
    paused = false
    scheduleCheck()
  })

  onBeforeUnmount(() => {
    el?.removeEventListener('scroll', onScroll)
    mo?.disconnect()
    if (timer) clearTimeout(timer)
    el = null
  })

  // keep-alive：切走时暂停，切回时恢复
  onActivated(() => {
    paused = false
    scheduleCheck()
  })
  onDeactivated(() => {
    paused = true
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  })
}

