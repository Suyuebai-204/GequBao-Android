// TV 运行环境检测与标记
// 优先级：原生注入结果 > 原生插件查询 > UA 兜底。
// 标记同时写入 window.isTV 与 <html class="is-tv">，供 JS 与 CSS 共用。
import { Gequbao } from '../native/bridge.js'

const NATIVE_FLAG = '__GQB_TV_NATIVE__'

export function detectTV() {
  let tv = false

  if (typeof window[NATIVE_FLAG] === 'boolean') {
    tv = window[NATIVE_FLAG]
  } else if (typeof window.isTV === 'boolean') {
    tv = window.isTV
  } else if (window.matchMedia) {
    // 兜底：只在 UA 明确包含电视标识且是横屏大屏时才判为 TV，避免大屏手机误判。
    const ua = navigator.userAgent || ''
    const tvUA = /(android\s*tv|googletv|smart\s*tv|smarttv|tv\s*box|tvbox|hbbtv|appletv|television)/i.test(ua)
    const big = Math.min(window.innerWidth, window.innerHeight) >= 600
    const landscape = window.innerWidth > window.innerHeight
    tv = tvUA && big && landscape
  }

  window.isTV = !!tv
  document.documentElement.classList.toggle('is-tv', window.isTV)
  return window.isTV
}

/** 原生插件查询：比 UA 准确，且能纠正注入时机过晚导致的漏判 */
export async function detectTVFromNative() {
  try {
    const r = await Gequbao.isTv()
    if (typeof r?.value === 'boolean') {
      window[NATIVE_FLAG] = r.value
      return detectTV()
    }
  } catch {
    // 浏览器调试 / 旧版原生插件：保持现有判定
  }
  return detectTV()
}

/** 无原生结果时，横竖屏切换后按 UA 重新判定一次 */
export function watchTvLayout() {
  if (typeof window === 'undefined') return
  const recheck = () => {
    if (typeof window[NATIVE_FLAG] === 'boolean') return
    detectTV()
  }
  window.addEventListener('resize', recheck)
  window.addEventListener('orientationchange', recheck)
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
