// 歌曲宝「我的歌单」接口（Laravel AJAX，必须 POST + 登录会话 Cookie）
// 列表：POST /member/playlist/list    （空表单）
// 详情：POST /member/playlist/detail  { playlist_id }
// 新建：POST /member/playlist/create  { title, description }
// 编辑：POST /member/playlist/edit    { id, title, description }
// 删除：POST /member/playlist/delete  { id }
// 加歌：POST /member/playlist/add-song { playlist_id, music_id }
// Cookie 由 http.js 的会话 jar 自动附加；会话失效时静默重登并重试一次。
import { request, formBody } from './http.js'
import { refreshSession } from './auth.js'

const BASE = 'https://www.gequbao.com'
const API = {
  list: `${BASE}/member/playlist/list`,
  detail: `${BASE}/member/playlist/detail`,
  create: `${BASE}/member/playlist/create`,
  edit: `${BASE}/member/playlist/edit`,
  delete: `${BASE}/member/playlist/delete`,
  addSong: `${BASE}/member/playlist/add-song`
}

const AJAX_HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded',
  'x-requested-with': 'XMLHttpRequest'
}

function classify(text, status) {
  let data = null
  try {
    data = JSON.parse(text)
  } catch {
    // 登录页 HTML / 空响应 —— 一律视为会话失效
    return { ok: false, needLogin: true, msg: '登录状态已失效，请重新登录' }
  }
  if (!data || typeof data !== 'object') {
    return { ok: false, needLogin: true, msg: '登录状态已失效，请重新登录' }
  }
  if (status === 401 || status === 419 || /Unauthenticated/i.test(data.message || '')) {
    return { ok: false, needLogin: true, msg: '登录状态已失效，请重新登录' }
  }
  if (data.code !== 1) {
    return { ok: false, needLogin: false, msg: data.msg || data.message || '操作失败' }
  }
  return { ok: true, needLogin: false, data, msg: data.msg || '' }
}

async function post(url, payload = {}, referer = `${BASE}/member`, canRetry = true) {
  let r
  try {
    const res = await request(url, {
      method: 'POST',
      accept: 'application/json, text/plain, */*',
      headers: { ...AJAX_HEADERS, Referer: referer },
      body: formBody(payload),
      retries: 0 // 写操作不自动重试，避免重复创建/删除
    })
    r = classify(res.text, res.status)
  } catch (e) {
    const body = String(e?.body || '')
    r = !body && !e?.status
      ? { ok: false, needLogin: false, msg: e?.message || '网络请求失败，请检查网络' }
      : classify(body, e?.status)
  }
  if (!r.ok && r.needLogin && canRetry) {
    const refreshed = await refreshSession()
    if (refreshed.ok) return post(url, payload, referer, false)
  }
  return r
}

function pageInfo(d, fallbackPage) {
  return {
    page: Number(d.current_page) || fallbackPage,
    lastPage: Number(d.last_page) || 1,
    total: Number(d.total) || 0,
    perPage: Number(d.per_page) || 0
  }
}

// 站点返回的封面可能是 http:// 或 // 开头，WebView 下统一升到 https
function normalizeCover(url) {
  const s = String(url || '')
  if (s.startsWith('//')) return 'https:' + s
  return s.replace(/^http:\/\//, 'https://')
}

/** 歌单（文件夹）列表，一页 12 个 */
export async function fetchPlaylists({ page = 1 } = {}) {
  const qs = page > 1 ? `?page=${page}` : ''
  const r = await post(API.list + qs, {})
  if (!r.ok) return r

  const d = r.data?.data || {}
  const rows = Array.isArray(d.data) ? d.data : []
  const items = rows.map((it) => ({
    id: Number(it.id) || 0,
    title: String(it.title || '未命名歌单'),
    description: String(it.description || ''),
    songCount: Number(it.song_count) || 0,
    createdAt: String(it.created_at || '')
  }))
  return {
    ok: true,
    needLogin: false,
    items,
    ...pageInfo(d, page),
    total: Number(d.total) || items.length,
    msg: r.msg
  }
}

/**
 * 歌单内歌曲。接口给出的 title/author/pic/url 仅用于列表展示；
 * 播放时一律由播放器进入 /music/{id} 解析，才能拿到歌词与可用直链。
 * 缺少 music 信息的条目只留 music_id，由视图层按需解析详情。
 */
export async function fetchPlaylistDetail({ playlistId, page = 1 } = {}) {
  if (!playlistId) return { ok: false, needLogin: false, msg: '缺少歌单 ID' }
  const qs = page > 1 ? `?page=${page}` : ''
  const r = await post(API.detail + qs, { playlist_id: playlistId })
  if (!r.ok) return r

  const d = r.data?.data || {}
  const rows = Array.isArray(d.data) ? d.data : []
  const songs = rows.map((it) => {
    const m = it.music || {}
    const id = Number(m.id ?? it.music_id) || 0
    return {
      id,
      musicId: id,
      title: String(m.title || ''),
      artist: String(m.author || ''),
      cover: normalizeCover(m.pic),
      url: String(m.url || ''),
      meta: String(m.duration || ''),
      needResolve: !m.title
    }
  })
  return {
    ok: true,
    needLogin: false,
    songs,
    ...pageInfo(d, page),
    total: Number(d.total) || songs.length,
    msg: r.msg
  }
}

export async function createPlaylist({ title, description = '' } = {}) {
  const r = await post(API.create, { title, description })
  return r.ok ? { ...r, msg: r.msg || '创建成功' } : r
}

export async function updatePlaylist({ id, title, description = '' } = {}) {
  const r = await post(API.edit, { id, title, description })
  return r.ok ? { ...r, msg: r.msg || '修改成功' } : r
}

export async function deletePlaylist(id) {
  const r = await post(API.delete, { id })
  return r.ok ? { ...r, msg: r.msg || '删除成功' } : r
}

/** 把歌曲加入指定歌单（站点歌曲页「加入歌单」使用的接口） */
export async function addSongToPlaylist({ playlistId, musicId } = {}) {
  if (!playlistId || !musicId) return { ok: false, needLogin: false, msg: '缺少歌单或歌曲 ID' }
  const r = await post(
    API.addSong,
    { playlist_id: playlistId, music_id: musicId },
    `${BASE}/music/${musicId}`
  )
  return r.ok ? { ...r, msg: r.msg || '成功加入歌单' } : r
}
