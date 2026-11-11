// TV 运行环境检测与标记
// 由原生在启动时注入 window.isTV（例如通过 UI_MODE_TYPE_TELEVISION 判断）。
// 同时把标记写到 document，供 CSS 切换 TV 大屏布局。

export function detectTV() {
  let tv = !!window.isTV
  // 兜底：屏幕宽度远大于高度且是横屏大尺寸，倾向 TV
  if (!tv && window.matchMedia) {
    const big = Math.min(window.innerWidth, window.innerHeight) >= 600
    const landscape = window.innerWidth > window.innerHeight
    tv = tv || (big && landscape && /tv|googletv|android tv|fire tv/i.test(navigator.userAgent))
  }
  window.isTV = tv
  document.documentElement.classList.toggle('is-tv', tv)
  return tv
}

export function isTV() {
  return !!window.isTV
}

/* 宽屏检测：平板、横屏手机、桌面窗口
 * 满足「横屏且较宽」或「竖屏平板」时，底部导航切换为左侧图标栏（参考酷我横屏布局） */
export function initResponsive() {
  if (!window.matchMedia) return
  const mql = window.matchMedia(
    '(orientation: landscape) and (min-width: 640px), (min-width: 900px)'
  )
  const apply = () => {
    document.documentElement.classList.toggle('is-wide', mql.matches)
  }
  apply()
  if (mql.addEventListener) mql.addEventListener('change', apply)
  else if (mql.addListener) mql.addListener(apply)
}
