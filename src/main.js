import { createApp } from 'vue'
import App from './App.vue'
import { createApi } from './api.js'
import { initTheme } from './composables/theme.js'
import { initPlayerSettings, initMusicControlsListeners } from './composables/player.js'
import { initDesktopLyric } from './composables/desktopLyric.js'
import { detectTV, initResponsive } from './mobile/tv.js'
import './assets/main.css'

// 标记移动端运行环境（player.js 据此决定本地源处理策略）
window.isMobile = true

// 启用移动端 :active 按下高亮：iOS/部分 Android 的 WebView 必须先在 document 上挂一个
// touchstart 监听，:active 才会在触摸时触发（否则“按下高亮”在真机上不生效）
document.addEventListener('touchstart', () => {}, { passive: true })

// 检测 TV（原生注入 window.isTV 或 UA 兜底），写入 html class
detectTV()
// 检测宽屏（平板 / 横屏），驱动响应式布局
initResponsive()

// 注入与 Windows 端同签名的 window.api（渲染层零改动调用）
window.api = createApi()

// 主题：CSS 变量 + 系统深色模式
initTheme()

// Vue 3 的 mount() 同步返回应用实例（非 Promise），用 async IIFE 做启动初始化
createApp(App).mount('#app')

;(async () => {
  // 启动后读取上次设置的音量/循环/自动展开
  await initPlayerSettings()
  // 绑定通知栏/锁屏/耳机的播放控制事件
  initMusicControlsListeners()
  // 桌面歌词（悬浮窗）初始化与状态恢复
  initDesktopLyric()
})()
