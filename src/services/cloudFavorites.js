// 歌曲宝云端收藏接口（Laravel AJAX 接口，依赖登录会话 Cookie）
// 列表：POST /member/music/favorite-list  { keyword }
// 添加：POST /member/music/favorite-add   { music_id }
// 删除：POST /member/music/favorite-delete{ music_id }
// 会话失效时站点会 302 到登录页（HTML）或返回 401 {"message":"Unauthenticated."}，
// 因此统一以「响应不是期望的 JSON」判定 needLogin。
import { request, formBody } from './http.js'
import { refreshSession } from './auth.js'

const BASE = 'https://www.gequbao.com'
const LIST_URL = `${BASE}/member/music/favorite-list`
const ADD_URL = `${BASE}/member/music/favorite-add`
const DEL_URL = `${BASE}/member/music/favorite-delete`

const AJAX_HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded',
  'x-requested-with': 'XMLHttpRequest'
}

function classify(text, status) {
  let data = null
  try {
    data = JSON.parse(text)
  } catch {
    // 登录页 HTML / 空响应 —— 一律视作会话失效
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

async function post(url, payload, referer, canRetry = true) {
  let r
  try {
    const res = await request(url, {
      method: 'POST',
      accept: 'application/json, text/plain, */*',
      headers: { ...AJAX_HEADERS, Referer: referer },
      body: formBody(payload)
    })
    r = classify(res.text, res.status)
  } catch (e) {
    const body = String(e?.body || '')
    r = !body && !e?.status
      ? { ok: false, needLogin: false, msg: e?.message || '网络请求失败，请检查网络' }
      : classify(body, e?.status)
  }
  // Cookie 过期：后台静默重登拿到新会话后，自动重试一次原操作
  if (!r.ok && r.needLogin && canRetry) {
    const refreshed = await refreshSession()
    if (refreshed.ok) return post(url, payload, referer, false)
  }
  return r
}

// 云端收藏列表（分页）。返回歌曲对象已映射成 SongList 可直接使用的形状，
// 播放使用 music.id（列表接口返回的 music.id 才是站点歌曲 id）。
export async function fetchCloudFavorites({ keyword = '', page = 1 } = {}) {
  const qs = page > 1 ? `?page=${page}` : ''
  const r = await post(LIST_URL + qs, { keyword }, `${BASE}/member`)
  if (!r.ok) return r

  const d = r.data?.data || {}
  const rows = Array.isArray(d.data) ? d.data : []
  const songs = rows.map((it) => {
    const m = it.music || {}
    const id = Number(m.id ?? it.music_id)
    return {
      id,
      musicId: id,
      title: m.title || '未知歌曲',
      artist: m.author || '未知歌手',
      cover: '',
      createdAt: it.created_at || ''
    }
  })
  return {
    ok: true,
    needLogin: false,
    songs,
    page: Number(d.current_page) || page,
    lastPage: Number(d.last_page) || 1,
    total: Number(d.total) || songs.length,
    perPage: Number(d.per_page) || 10,
    msg: r.msg
  }
}

export async function addCloudFavorite(musicId) {
  const r = await post(ADD_URL, { music_id: musicId }, `${BASE}/music/${musicId}`)
  return r.ok ? { ...r, msg: r.msg || '收藏成功' } : r
}

export async function removeCloudFavorite(musicId) {
  const r = await post(DEL_URL, { music_id: musicId }, `${BASE}/member`)
  return r.ok ? { ...r, msg: r.msg || '已取消收藏' } : r
}
