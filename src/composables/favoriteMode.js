// 收藏模式：local（本地，默认）/ cloud（跟随歌曲宝账号）
// 未登录时强制回落到本地；云端收藏 id 全量缓存，供播放页判定「是否已收藏」。
import { ref, reactive, computed, watch } from 'vue'
import { Preferences } from '@capacitor/preferences'
import { useAuth } from '../services/auth.js'
import { getSettings, updateSettings } from '../services/settings.js'
import { isFavorite, toggleFavorite, useFavorites } from './favorites.js'
import {
  fetchCloudFavorites,
  addCloudFavorite,
  removeCloudFavorite
} from '../services/cloudFavorites.js'

const KEY_CLOUD_IDS = 'gequbao-cloud-fav-ids' // 离线时也能判定收藏态
const auth = useAuth()
const { favorites: localIds } = useFavorites() // 确保本地列表已加载

export const favoriteMode = ref('local') // 用户选择的模式
export const effectiveMode = computed(() =>
  favoriteMode.value === 'cloud' && auth.loggedIn ? 'cloud' : 'local'
)

// 判定用的云端收藏 id 集合（与列表展示数据分开，避免搜索/分页影响判定）
export const cloudFavIds = ref(new Set())

// 云端列表展示状态，供收藏页使用
export const cloudList = reactive({
  loading: false,
  error: '',
  needLogin: false,
  loaded: false,
  keyword: '',
  page: 1,
  lastPage: 1,
  total: 0,
  songs: []
})

let modeLoaded = false
let idsLoaded = false

export async function loadFavoriteMode() {
  if (modeLoaded) return
  modeLoaded = true
  try {
    const s = await getSettings()
    favoriteMode.value = s.favoriteMode === 'cloud' ? 'cloud' : 'local'
  } catch {
    favoriteMode.value = 'local'
  }
  if (!idsLoaded) {
    idsLoaded = true
    try {
      const { value } = await Preferences.get({ key: KEY_CLOUD_IDS })
      const arr = value ? JSON.parse(value) : []
      if (Array.isArray(arr)) cloudFavIds.value = new Set(arr.map(Number).filter(Boolean))
    } catch {
      /* 忽略缓存异常 */
    }
  }
}

export async function setFavoriteMode(mode) {
  const next = mode === 'cloud' ? 'cloud' : 'local'
  favoriteMode.value = next
  try {
    await updateSettings({ favoriteMode: next })
  } catch {
    /* 忽略持久化异常 */
  }
}

function persistCloudIds() {
  Preferences.set({ key: KEY_CLOUD_IDS, value: JSON.stringify([...cloudFavIds.value]) }).catch(() => {})
}

function setCloudIds(ids) {
  cloudFavIds.value = new Set(ids)
  persistCloudIds()
}

// 拉取云端全部收藏 id（最多 20 页），用于收藏判定与计数；不改动列表展示
let syncing = null
export async function syncCloudFavorites(force = false) {
  if (effectiveMode.value !== 'cloud') return
  if (syncing) return syncing
  if (!force && cloudList.loaded) return
  syncing = (async () => {
    let page = 1
    let lastPage = 1
    const ids = []
    do {
      const r = await fetchCloudFavorites({ keyword: '', page })
      if (!r.ok) {
        if (r.needLogin) {
          cloudList.needLogin = true
          cloudList.error = r.msg
        }
        return
      }
      ids.push(...r.songs.map((s) => s.id))
      lastPage = r.lastPage
      page++
    } while (page <= lastPage && page <= 20)
    setCloudIds(ids)
    cloudList.needLogin = false
  })().finally(() => {
    syncing = null
  })
  return syncing
}

// 加载云端列表的某一页（支持 keyword 搜索），只影响展示
export async function loadCloudPage({ keyword = '', page = 1 } = {}) {
  if (effectiveMode.value !== 'cloud') return
  cloudList.loading = true
  cloudList.error = ''
  cloudList.needLogin = false
  cloudList.keyword = keyword
  cloudList.page = page
  try {
    const r = await fetchCloudFavorites({ keyword, page })
    if (!r.ok) {
      cloudList.songs = []
      cloudList.needLogin = !!r.needLogin
      cloudList.error = r.msg || '加载失败'
      return r
    }
    cloudList.songs = r.songs
    cloudList.page = r.page
    cloudList.lastPage = r.lastPage
    cloudList.total = r.total
    cloudList.loaded = true
    return r
  } finally {
    cloudList.loading = false
  }
}

// 统一判定
export function isFavorited(id) {
  if (id == null) return false
  return effectiveMode.value === 'cloud'
    ? cloudFavIds.value.has(Number(id))
    : isFavorite(id)
}

// 统一数量（我的页面统计用）
export const favoriteCount = computed(() =>
  effectiveMode.value === 'cloud' ? cloudFavIds.value.size : localIds.value.length
)

// 统一切换。云端为异步请求，采用乐观更新 + 失败回滚。
export async function toggleFavorited(song) {
  const id = song?.id
  if (id == null) return { ok: false, msg: '当前没有可收藏的歌曲' }

  if (effectiveMode.value !== 'cloud') {
    const added = toggleFavorite(id)
    return { ok: true, added, msg: added ? '已收藏' : '已取消收藏' }
  }

  const n = Number(id)
  if (!n) return { ok: false, msg: '歌曲 id 无效' }
  const had = cloudFavIds.value.has(n)
  setCloudIds(
    had ? [...cloudFavIds.value].filter((x) => x !== n) : [...cloudFavIds.value, n]
  )

  const r = had ? await removeCloudFavorite(n) : await addCloudFavorite(n)
  if (!r.ok) {
    setCloudIds(
      had ? [...cloudFavIds.value, n] : [...cloudFavIds.value].filter((x) => x !== n)
    )
    if (r.needLogin) cloudList.needLogin = true
    return { ok: false, added: had, needLogin: !!r.needLogin, msg: r.msg || '操作失败' }
  }

  // 同步当前展示列表
  if (had) {
    cloudList.songs = cloudList.songs.filter((s) => s.id !== n)
    cloudList.total = Math.max(0, cloudList.total - 1)
  } else if (!cloudList.keyword && song?.title) {
    cloudList.songs = [
      {
        id: n,
        musicId: n,
        title: song.title,
        artist: song.artist || '',
        cover: song.cover || '',
        createdAt: ''
      },
      ...cloudList.songs.filter((s) => s.id !== n)
    ]
    cloudList.total += 1
  }
  return { ok: true, added: !had, msg: r.msg || (!had ? '收藏成功' : '已取消收藏') }
}

// 显式取消收藏：不依赖 id 集合是否已同步，直接调用删除接口并更新本地展示
export async function removeFavorited(id) {
  if (id == null) return { ok: false, msg: '歌曲 id 无效' }
  if (effectiveMode.value !== 'cloud') {
    // 本地模式：只有在已收藏时才移除
    if (isFavorite(id)) toggleFavorite(id)
    return { ok: true, msg: '已取消收藏' }
  }
  const n = Number(id)
  const before = [...cloudFavIds.value]
  setCloudIds(before.filter((x) => x !== n))
  const r = await removeCloudFavorite(n)
  if (!r.ok) {
    setCloudIds(before)
    if (r.needLogin) cloudList.needLogin = true
    return { ok: false, needLogin: !!r.needLogin, msg: r.msg || '操作失败' }
  }
  cloudList.songs = cloudList.songs.filter((s) => s.id !== n)
  cloudList.total = Math.max(0, cloudList.total - 1)
  return { ok: true, msg: r.msg || '已取消收藏' }
}

// 模式/登录态变化后自动同步云端 id
watch(
  effectiveMode,
  (m) => {
    if (m === 'cloud') syncCloudFavorites(true)
  },
  { immediate: true }
)
