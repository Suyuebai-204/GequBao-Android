import { ref } from 'vue'

// 收藏仅记录歌曲 id 列表（JSON 数组），存于 localStorage
const KEY = 'gqb_favorites'
const favorites = ref([])
let loaded = false

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    const arr = raw ? JSON.parse(raw) : []
    favorites.value = Array.isArray(arr)
      ? arr.filter((x) => typeof x === 'string' || typeof x === 'number')
      : []
  } catch {
    favorites.value = []
  }
  loaded = true
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(favorites.value))
  } catch {
    /* 忽略存储异常 */
  }
}

export function isFavorite(id) {
  if (id == null) return false
  if (!loaded) load()
  return favorites.value.includes(id)
}

export function toggleFavorite(id) {
  if (id == null) return false
  if (!loaded) load()
  const i = favorites.value.indexOf(id)
  const added = i < 0
  // 重新赋值新数组以触发响应式（浅层 watch 才能感知），而不是原地 splice/unshift
  favorites.value = added
    ? [id, ...favorites.value]
    : favorites.value.filter((x) => x !== id)
  persist()
  return added // 返回切换后是否处于收藏状态
}

export function useFavorites() {
  if (!loaded) load()
  return { favorites, isFavorite, toggleFavorite }
}

export function getFavoriteIds() {
  if (!loaded) load()
  return favorites.value
}
