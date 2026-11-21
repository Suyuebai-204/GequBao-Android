// TV 遥控器焦点管理器指令（D-pad 网格导航）
// 用法：在根容器上 v-remote-focus。容器内可聚焦元素（button / a / [tabindex] / [data-nav]）
// 以及被补加 tabindex 的可点击行，会通过方向键按几何位置跳到最近的下一个焦点，OK/Enter 触发点击。
import { isTV } from './tv.js'

const FOCUSABLE = 'button, a, input, select, textarea, [tabindex], [data-nav]'
const TEXT_INPUT = 'input, textarea, select, [contenteditable="true"]'
// 渲染层里用 div/@click 实现的「行」在 TV 下不可聚焦，这里运行时补上 tabindex
const PROMOTE = '.table-row, .song-row, .kw-row, .guess-item, .hot-chip, .panel-item, .row-x, .mini-btn, .tab, .nav-item'
// 弹层出现时，焦点候选限制在最上层弹层内，避免 D-pad 跑到背景页面
const OVERLAY = '.sm-mask, .sp-mask, .sheet-mask, .login-mask, .fb-mask, .ck-mask, .pm-mask, .cpw-mask, .sheet.open, .exit-mask, .reward-mask'

function promote(el) {
  el.querySelectorAll(PROMOTE).forEach((n) => {
    if (!n.hasAttribute('tabindex')) n.setAttribute('tabindex', '0')
  })
}

function activeScope(root) {
  const overlays = Array.from(document.querySelectorAll(OVERLAY)).filter(
    (n) => n.getClientRects().length > 0
  )
  return overlays.length ? overlays[overlays.length - 1] : root
}

function candidates(el) {
  return Array.from(el.querySelectorAll(FOCUSABLE)).filter(
    (n) => n.getClientRects().length > 0 && !n.disabled && n.getAttribute('tabindex') !== '-1'
  )
}

function isTextInput(el) {
  return !!el && (!!el.closest?.(TEXT_INPUT) || el.isContentEditable === true)
}

function submitTextInput(el) {
  const init = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }
  el.dispatchEvent(new KeyboardEvent('keydown', init))
  el.dispatchEvent(new KeyboardEvent('keyup', init))
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
    // 不在这里提前 return：原生 TV 判定可能晚于指令挂载完成，
    // 真正的开关放在各个事件处理里，保证晚判也能生效。
    promote(el)
    el._observer = new MutationObserver(() => {
      promote(el)
      if (!isTV()) return
      const scope = activeScope(el)
      if (scope !== el && !scope.contains(document.activeElement)) {
        candidates(scope)[0]?.focus()
      }
    })
    el._observer.observe(el, { childList: true, subtree: true })

    el._onKey = (e) => {
      if (!isTV() || isTextInput(document.activeElement)) return
      const map = {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0]
      }
      const dir = map[e.key]
      if (!dir) return
      const scope = activeScope(el)
      const cur = currentFocus(scope) || candidates(scope)[0]
      if (!cur) return
      e.preventDefault()
      const next = bestInDirection(scope, cur, dir) || cur
      next.focus()
      next.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
    }

    el._onEnter = (e) => {
      if (!isTV()) return
      const key = e.key
      const isConfirm = key === 'Enter' || key === 'NumpadEnter' || key === 'OK' || key === 'Accept'
      const isSpace = key === ' '
      if (!isConfirm && !isSpace) return

      const scope = activeScope(el)
      const cur = currentFocus(scope)
      if (!cur) return

      if (isTextInput(cur)) {
        // 空格要能正常输入；Enter/NumpadEnter 交给组件自己的 @keydown.enter；
        // OK/Accept 则补发 Enter，兼容登录/新建歌单等 @keyup.enter 表单。
        if (isSpace || key === 'Enter' || key === 'NumpadEnter') return
        e.preventDefault()
        e.stopPropagation()
        submitTextInput(cur)
        return
      }

      // 原生按钮/链接对 Enter/Space 自带 click，阻止后会双触发；
      // OK/Accept 不是标准键，浏览器不会触发，需要手动 click。
      if ((key === 'Enter' || isSpace) && (cur.tagName === 'BUTTON' || cur.tagName === 'A')) return

      e.preventDefault()
      e.stopPropagation()
      cur.click()
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

    // 捕获阶段先处理，手动触发 click 后阻断冒泡，避免组件自身的 keydown 二次执行
    el.addEventListener('keydown', el._onKey, true)
    el.addEventListener('keydown', el._onEnter, true)
    el.addEventListener('focusin', el._onFocusIn)
    el.addEventListener('focusout', el._onFocusOut)
    requestAnimationFrame(() => {
      if (!isTV()) return
      candidates(activeScope(el))[0]?.focus()
    })
  },
  unmounted(el) {
    el._observer?.disconnect()
    if (el._onKey) el.removeEventListener('keydown', el._onKey, true)
    if (el._onEnter) el.removeEventListener('keydown', el._onEnter, true)
    if (el._onFocusIn) el.removeEventListener('focusin', el._onFocusIn)
    if (el._onFocusOut) el.removeEventListener('focusout', el._onFocusOut)
    if (el._lastFocused) el._lastFocused.classList?.remove('tv-focused')
  }
}
