// 「我的歌单」共享状态：入口徽标要统计歌曲数量，列表页/详情页也要复用同一份数据。
// 歌单数量通常不多，一次拉完所有分页，页面就不必再做分页控件。
import { computed, reactive } from 'vue'
import { fetchPlaylists } from '../services/cloudPlaylist.js'
import { mapLimit } from '../utils/concurrency.js'

const state = reactive({
  items: [],
  total: 0,
  loading: false,
  loaded: false,
  needLogin: false,
  error: ''
})

export function usePlaylists() {
  return state
}

/** 歌单（文件夹）个数 */
export const playlistCount = computed(() => state.total)

/** 所有歌单里的歌曲总数（各歌单 song_count 之和） */
export const playlistSongCount = computed(() =>
  state.items.reduce((n, p) => n + (Number(p.songCount) || 0), 0)
)

let pending = null

/** force=true 用于新建/编辑/删除后刷新；并发调用复用同一次请求 */
export function refreshPlaylists(force = false) {
  if (state.loaded && !force) return Promise.resolve(state)
  // 强制刷新若撞上正在进行的请求，等它结束后再拉一次，避免拿到操作前的旧数据
  if (pending) return force ? pending.then(() => refreshPlaylists(true)) : pending

  state.loading = true
  state.error = ''
  pending = (async () => {
    const fail = (r) => {
      state.items = []
      state.total = 0
      state.needLogin = !!r.needLogin
      state.error = r.msg || '加载歌单失败'
      state.loaded = false
      return state
    }

    // 先取第一页拿到总页数，后续页并行拉取（最多 4 并发），避免逐页 RTT 累加
    const first = await fetchPlaylists({ page: 1 })
    if (!first.ok) return fail(first)

    const lastPage = Math.min(Number(first.lastPage) || 1, 10)
    const restPages = Array.from({ length: Math.max(0, lastPage - 1) }, (_, i) => i + 2)
    const rest = await mapLimit(restPages, 4, (page) => fetchPlaylists({ page }))
    const bad = rest.find((r) => !r.ok)
    if (bad) return fail(bad)

    state.items = [first, ...rest].flatMap((r) => r.items)
    state.total = Number(first.total) || state.items.length
    state.needLogin = false
    state.loaded = true
    return state
  })()
    .catch((e) => {
      state.error = e?.message || '加载歌单失败'
      return state
    })
    .finally(() => {
      state.loading = false
      pending = null
    })
  return pending
}
