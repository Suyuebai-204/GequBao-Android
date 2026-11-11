// TV 遥控器焦点管理器指令（D-pad 网格导航）
// 用法：在根容器上 v-remote-focus。容器内可聚焦元素（button / a / [tabindex] / [data-nav]）
// 以及被补加 tabindex 的可点击行，会通过方向键按几何位置跳到最近的下一个焦点，OK/Enter 触发点击。
import { isTV } from './tv.js'

const FOCUSABLE = 'button, a, input, select, textarea, [tabindex], [data-nav]'
// 渲染层里用 div/@click 实现的「行」在 TV 下不可聚焦，这里运行时补上 tabindex
const PROMOTE = '.table-row, .song-row, .kw-row, .guess-item, .hot-chip, .panel-item, .row-x, .mini-btn, .tab, .nav-item'

function promote(el) {
  el.querySelectorAll(PROMOTE).forEach((n) => {
    if (!n.hasAttribute('tabindex')) n.setAttribute('tabindex', '0')
  })
}

function candidates(el) {
  return Array.from(el.querySelectorAll(FOCUSABLE)).filter(
    (n) => n.offsetParent !== null && !n.disabled && n.getAttribute('tabindex') !== '-1'
  )
}

function center(rect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

function scoreInDirection(curRect, targetRect, dir) {
  const c = center(curRect)
  const t = center(targetRect)
  const dx = t.x - c.x
  const dy = t.y - c.y
  const along = dir[0] !== 0 ? dx * dir[0] : dy * dir[1]
  if (along <= 0) return null
  const perp = dir[0] !== 0 ? Math.abs(dy) : Math.abs(dx)
  if (perp > along * 2.2) return null
  return along + perp * 0.4
}

function bestInDirection(el, current, dir) {
  const items = candidates(el)
  const curRect = current.getBoundingClientRect()
  let best = null
  let bestScore = -Infinity
  for (const item of items) {
    if (item === current) continue
    const s = scoreInDirection(curRect, item.getBoundingClientRect(), dir)
    if (s !== null && s > bestScore) {
      bestScore = s
      best = item
    }
  }
  return best
}

function currentFocus(el) {
  const active = document.activeElement
  if (active && el.contains(active) && candidates(el).includes(active)) return active
  return null
}

export const remoteFocus = {
  mounted(el) {
    if (!isTV()) return
    promote(el)
    el._observer = new MutationObserver(() => promote(el))
    el._observer.observe(el, { childList: true, subtree: true })

    el._onKey = (e) => {
      const map = {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0]
      }
      const dir = map[e.key]
      if (!dir) return
      const cur = currentFocus(el) || candidates(el)[0]
      if (!cur) return
      e.preventDefault()
      const next = bestInDirection(el, cur, dir) || cur
      next.focus()
      next.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
    }
    el._onEnter = (e) => {
      if (e.key !== 'Enter' && e.key !== 'OK' && e.key !== ' ') return
      const cur = currentFocus(el)
      if (cur) {
        e.preventDefault()
        cur.click()
      }
    }
    // 焦点选中态：给当前聚焦元素加 .tv-focused（配合全局样式高亮）
    el._onFocusIn = (e) => {
      const t = e.target
      if (el._lastFocused && el._lastFocused !== t) el._lastFocused.classList?.remove('tv-focused')
      if (t?.classList) t.classList.add('tv-focused')
      el._lastFocused = t
    }
    el._onFocusOut = () => {
      if (el._lastFocused) el._lastFocused.classList?.remove('tv-focused')
    }
    el.addEventListener('keydown', el._onKey)
    el.addEventListener('keydown', el._onEnter)
    el.addEventListener('focusin', el._onFocusIn)
    el.addEventListener('focusout', el._onFocusOut)
    requestAnimationFrame(() => {
      const first = candidates(el)[0]
      if (first) first.focus()
    })
  },
  unmounted(el) {
    el._observer?.disconnect()
    if (el._onKey) el.removeEventListener('keydown', el._onKey)
    if (el._onEnter) el.removeEventListener('keydown', el._onEnter)
    if (el._onFocusIn) el.removeEventListener('focusin', el._onFocusIn)
    if (el._onFocusOut) el.removeEventListener('focusout', el._onFocusOut)
    if (el._lastFocused) el._lastFocused.classList?.remove('tv-focused')
  }
}
