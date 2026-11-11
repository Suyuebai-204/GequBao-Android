// 应用设置持久化（安卓端）—— 移植自 Windows 端 main/settings.js
// 桌面端用 fs 读写 settings.json；安卓端换成 @capacitor/preferences。
// DEFAULT_SETTINGS 与字段定义原样保留，仅改读写底层。
import { Preferences } from '@capacitor/preferences'

export const DEFAULT_SETTINGS = {
  volume: 80, // 默认音量（0-100）
  repeatMode: 'all', // 播放循环：off 顺序 / all 列表循环 / one 单曲循环
  autoOpenPlayer: false, // 播放新歌时自动展开播放页
  autoStart: false, // 开机自动运行（仅 Windows 端生效）
  shuffle: false, // 随机播放
  libraryDir: '', // 本地音乐扫描目录
  downloadDir: '', // 下载默认目录（空 = 系统「下载」目录）
  downloadCover: true, // 下载歌曲时一并保存封面图片
  downloadLyric: true, // 下载歌曲时一并保存歌词文件
  desktopLyric: false, // 桌面歌词悬浮窗
  favoriteMode: 'local' // 收藏方式：local 本地 / cloud 云端（跟随歌曲宝账号）
}

const KEY = 'settings'
let cache = null

async function read() {
  if (cache) return cache
  try {
    const { value } = await Preferences.get({ key: KEY })
    const parsed = value ? JSON.parse(value) : {}
    cache = { ...DEFAULT_SETTINGS, ...(parsed && typeof parsed === 'object' ? parsed : {}) }
  } catch {
    cache = { ...DEFAULT_SETTINGS }
  }
  return cache
}

export async function getSettings() {
  return read()
}

export async function updateSettings(patch = {}) {
  const current = await read()
  const next = { ...current }
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (key in patch && patch[key] !== undefined) next[key] = patch[key]
  }
  cache = next
  await Preferences.set({ key: KEY, value: JSON.stringify(next) })
  return next
}
