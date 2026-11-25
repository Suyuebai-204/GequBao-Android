// 歌曲「更多操作」的全局状态与动作：收藏 / 加入歌单 / 复制直链 / 下载 / 打开歌曲网页。
// 复制与下载都先经 /music/{id} 详情解析（window.api.player.song），
// 这样拿到的是站点当前可用的直链、playId、封面与歌词，而不是列表里的临时信息。
import { computed, reactive } from 'vue'
import { showToast, dismissToast } from './toast.js'
import { copyText } from '../utils/copyText.js'
import { isFavorited, toggleFavorited } from './favoriteMode.js'
import { refreshPlaylists } from './playlists.js'
import { addSongToPlaylist } from '../services/cloudPlaylist.js'

const MUSIC_PAGE = 'https://www.gequbao.com/music/'

const state = reactive({
  open: false,
  song: null,
  busy: false,
  picker: false, // 选择歌单弹窗
  pickerLoading: false,
  create: false, // 在「加入歌单」里新建歌单
  login: false, // 未登录时的登录引导
  share: false, // 系统分享二级弹窗（可选是否携带直链）
  shareWithUrl: true, // 分享文本是否附带歌曲直链
  adding: 0 // 正在加入的歌单 id
})

export function useSongMenu() {
  return state
}

export const songMenuFaved = computed(() => isFavorited(state.song?.id))

function songId(song) {
  return Number(song?.musicId ?? song?.id) || 0
}

function normalizeSong(song) {
  return {
    id: songId(song),
    musicId: songId(song),
    title: String(song?.title || ''),
    artist: String(song?.artist || ''),
    cover: String(song?.cover || '')
  }
}

/** 打开更多菜单；本地音乐/无 id 的条目不提供菜单 */
export function openSongMenu(song) {
  if (song?.local || song?.path) return
  const s = normalizeSong(song)
  if (!s.id) {
    showToast('这首歌曲暂无更多操作', { type: 'error' })
    return
  }
  state.song = s
  state.open = true
  state.picker = false
  state.create = false
  state.login = false
  state.share = false
  state.shareWithUrl = true
  state.busy = false
  state.adding = 0
}

export function closeSongMenu() {
  state.open = false
  state.picker = false
  state.create = false
  state.login = false
  state.share = false
  state.busy = false
  state.adding = 0
  state.song = null
}

/** Android 返回键：由最上层弹窗逐层关闭，返回是否消费了本次返回 */
export function closeSongMenuLayer() {
  if (state.login) {
    state.login = false
    return true
  }
  if (state.share) {
    state.share = false
    return true
  }
  if (state.create) {
    state.create = false
    return true
  }
  if (state.picker) {
    state.picker = false
    return true
  }
  if (state.open) {
    closeSongMenu()
    return true
  }
  return false
}

/* ============ /music/{id} 解析 ============ */

const resolveCache = new Map() // musicId -> { at, promise }

/** 按 musicId 解析详情/直链，菜单与批量下载共用同一份 60 秒缓存 */
export function resolveSongDetail(id) {
  const musicId = Number(id) || 0
  if (!musicId) return Promise.reject(new Error('歌曲 id 无效'))
  const hit = resolveCache.get(musicId)
  if (hit && Date.now() - hit.at < 60_000) return hit.promise

  const promise = window.api.player.song(musicId).then((res) => {
    if (!res?.ok) throw new Error(res?.error || '解析歌曲页面失败')
    return { detail: res.data?.detail || {}, url: String(res.data?.url || '') }
  }).catch((error) => {
    resolveCache.delete(musicId)
    throw error
  })
  resolveCache.set(musicId, { at: Date.now(), promise })
  return promise
}

function resolveSong() {
  return resolveSongDetail(songId(state.song))
}

/** 下载附带封面/歌词的用户设置；取不到时回退为默认开启 */
export async function getDownloadOptions() {
  try {
    const sres = await window.api.settings.get()
    const s = sres?.data ?? sres
    return {
      downloadCover: typeof s?.downloadCover === 'boolean' ? s.downloadCover : true,
      downloadLyric: typeof s?.downloadLyric === 'boolean' ? s.downloadLyric : true
    }
  } catch {
    return { downloadCover: true, downloadLyric: true }
  }
}

async function exclusive(task) {
  if (state.busy) return
  state.busy = true
  try {
    await task()
  } finally {
    state.busy = false
  }
}

function toastError(message) {
  showToast(message, { type: 'error' })
}

/* ============ 菜单动作 ============ */

export function menuToggleFavorite() {
  return exclusive(async () => {
    const r = await toggleFavorited(normalizeSong(state.song))
    if (!r.ok) {
      toastError(r.msg || '操作失败')
      return
    }
    showToast(r.msg || (r.added ? '已收藏' : '已取消收藏'), {
      type: r.added ? 'success' : 'info'
    })
  })
}

export function menuCopyUrl() {
  return exclusive(async () => {
    const tip = showToast('正在解析歌曲页面…', { duration: 0 })
    try {
      const { url } = await resolveSong()
      if (!url) throw new Error('未获取到可用直链')
      const ok = await copyText(url)
      showToast(ok ? '已复制直链' : '复制失败，请重试', { type: ok ? 'success' : 'error' })
    } catch (error) {
      toastError(error?.message || '解析失败')
    } finally {
      dismissToast(tip)
    }
  })
}

export function menuDownload() {
  return exclusive(async () => {
    const tip = showToast('正在解析并下载…', { duration: 0 })
    try {
      const { detail, url } = await resolveSong()
      const { downloadCover, downloadLyric } = await getDownloadOptions()

      const res = await window.api.player.download({
        musicId: detail.id,
        playId: detail.playId,
        url,
        urlA: detail.urlA || '',
        title: detail.title || state.song?.title,
        artist: detail.artist || state.song?.artist,
        cover: detail.cover || state.song?.cover || '',
        lrc: Array.isArray(detail.lrc) ? detail.lrc : [],
        downloadCover,
        downloadLyric
      })
      if (!res?.ok) throw new Error(res?.error || '下载失败')
      showToast('已保存到下载目录', { type: 'success' })
    } catch (error) {
      toastError(error?.message || '下载失败')
    } finally {
      dismissToast(tip)
    }
  })
}

/** 歌曲网页地址与详情页解析用的是同一个 /music/{id} 规则 */
export async function menuOpenPage() {
  const id = songId(state.song)
  closeSongMenu()
  if (!id) return
  try {
    const r = await window.api.openExternal(`${MUSIC_PAGE}${id}`)
    if (r && !r.ok) throw new Error(r.error || '打开浏览器失败')
    showToast('已打开歌曲网页')
  } catch (error) {
    toastError(error?.message || '打开浏览器失败')
  }
}

/* ============ 系统分享 ============ */

const APP_REPO = 'https://github.com/Suyuebai-204/GequBao-Android'

/** 打开分享二级弹窗 */
export function menuOpenShare() {
  if (!state.song) return
  state.share = true
}

/** 组装分享文本：是否携带直链由弹窗选项决定 */
function buildShareText(withUrl, directUrl) {
  const id = songId(state.song)
  const lines = [
    '【歌曲宝App】免费的开源音乐软件；',
    '给你分享的歌曲：',
    `歌名：${state.song?.title || '未知歌曲'}`,
    `歌手：${state.song?.artist || '未知歌手'}`,
    `链接：${MUSIC_PAGE}${id}`,
    ''
  ]
  if (withUrl) lines.push(`歌曲直链：${directUrl || '（解析失败）'}`)
  lines.push('', `App开源仓库/发布页：${APP_REPO}`)
  return lines.join('\n')
}

/** 确认分享：勾选直链时先解析，再调系统分享面板 */
export function menuDoShare() {
  return exclusive(async () => {
    let directUrl = ''
    if (state.shareWithUrl) {
      const tip = showToast('正在解析歌曲直链…', { duration: 0 })
      try {
        const { url } = await resolveSong()
        directUrl = url || ''
        if (!directUrl) throw new Error('未获取到可用直链')
      } catch (error) {
        dismissToast(tip)
        toastError(error?.message || '直链解析失败')
        return
      }
      dismissToast(tip)
    }

    const text = buildShareText(state.shareWithUrl, directUrl)
    try {
      const res = await window.api.share(text)
      if (res && !res.ok) throw new Error(res.error || '分享失败')
      if (!res?.canceled) showToast('已调起系统分享', { type: 'success' })
      state.share = false
    } catch (error) {
      toastError(error?.message || '分享失败')
    }
  })
}

/* ============ 加入歌单 ============ */

export function menuOpenPicker() {
  state.picker = true
  return menuRefreshPicker()
}

/** 打开/刷新窗口时通过 /member/playlist/list 拉取最新歌单 */
export async function menuRefreshPicker() {
  if (state.pickerLoading) return
  state.pickerLoading = true
  try {
    const s = await refreshPlaylists(true)
    if (s?.error) showToast(s.error, { type: 'error' })
  } finally {
    state.pickerLoading = false
  }
}

export async function menuPickPlaylist(playlist) {
  if (state.adding || !playlist?.id) return
  const id = songId(state.song)
  state.adding = playlist.id
  try {
    const r = await addSongToPlaylist({ playlistId: playlist.id, musicId: id })
    if (!r.ok) {
      toastError(r.msg || '加入失败')
      if (r.needLogin) state.picker = false
      return
    }
    showToast(r.msg || `已加入「${playlist.title}」`, { type: 'success' })
    closeSongMenu()
    // 歌单里的歌曲数变了，「我的」入口统计与歌单列表同步刷新
    refreshPlaylists(true)
  } catch (error) {
    toastError(error?.message || '加入失败')
  } finally {
    state.adding = 0
  }
}
