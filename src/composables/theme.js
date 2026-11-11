const KEY = 'app:theme'
const CUSTOM_KEY = 'app:theme:custom'
const DEFAULT_THEME = 'light'

export function getSavedTheme() {
  // 旧版每次启动都会把默认值写进 KEY，用 CUSTOM_KEY 区分「用户主动选择」；
  // 未主动选择过时始终使用默认浅色，确保升级后默认主题也能生效。
  if (localStorage.getItem(CUSTOM_KEY) !== '1') return DEFAULT_THEME
  return localStorage.getItem(KEY) || DEFAULT_THEME
}

function prefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function isDarkTheme(theme) {
  return theme === 'dark' || (theme === 'system' && prefersDark())
}

// 主题对应的状态栏/导航栏颜色：状态栏跟随顶部背景(--bg)，导航栏跟随底部导航栏背景(--surface)
function barColors(theme) {
  const dark = isDarkTheme(theme)
  return {
    status: { color: dark ? '0f0f12' : 'f6f7f9', dark: !dark },
    nav: { color: dark ? '17171b' : 'ffffff', dark: !dark }
  }
}

function syncBars(theme) {
  const { status, nav } = barColors(theme)
  window.api?.theme?.setStatusBar?.(status)
  window.api?.theme?.setNavigationBar?.(nav)
}

/**
 * 应用主题：切换 html.theme-light 类（驱动 CSS 变量），
 * 并同步安卓状态栏 / 导航栏颜色，跟随主题一同沉浸。
 * userChosen 表示用户在设置里主动选择，记录后不再套用默认浅色。
 */
export function applyTheme(theme, userChosen = false) {
  localStorage.setItem(KEY, theme)
  if (userChosen) localStorage.setItem(CUSTOM_KEY, '1')
  document.documentElement.classList.toggle('theme-light', !isDarkTheme(theme))
  window.api?.theme?.setNative?.(theme)
  syncBars(theme)
}

export function initTheme() {
  applyTheme(getSavedTheme())
  // 插件启动时可能尚未就绪，稍后补一次同步，确保栏色生效
  setTimeout(() => syncBars(getSavedTheme()), 600)
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => {
      if (getSavedTheme() === 'system') applyTheme('system')
    })
}
