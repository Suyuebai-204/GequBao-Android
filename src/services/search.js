// 搜索解析层 —— 与 Windows 端 main/search.js 完全一致（纯字符串/正则解析，无 Node 依赖）。
import { request, requestJson, formBody, newReqId } from './http.js'

const BASE = 'https://www.gequbao.com'
const SUGGEST_API = `${BASE}/api/pre-s`
const GUESS_API = `${BASE}/api/guess-musics`
const HOT_API = 'https://kuwo.cn/openapi/v1/www/search/searchKey'

/* ============ 通用文本处理 ============ */

function stripTags(str = '') {
  return String(str)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ')
}

function decodeEntities(str = '') {
  return String(str)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeCodePoint(parseInt(dec, 10)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#0*39;/gi, "'")
}

function safeCodePoint(code) {
  try {
    return Number.isFinite(code) ? String.fromCodePoint(code) : ''
  } catch {
    return ''
  }
}

function normalize(str = '') {
  return String(str).replace(/\s+/g, ' ').trim()
}

function clean(str = '') {
  return normalize(decodeEntities(stripTags(str)))
}

function firstMatch(re, str = '') {
  const m = re.exec(String(str))
  return m ? m[1] : ''
}

function toInt(value) {
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : null
}

/* ============ 一、搜索建议 ============ */

export async function suggest(keyword) {
  const kw = normalize(keyword)
  if (!kw) return []

  const { text } = await request(SUGGEST_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Accept: 'application/json, text/javascript, */*; q=0.01',
      Origin: BASE,
      Referer: `${BASE}/`
    },
    body: formBody({ keyword: kw }),
    timeout: 8000
  })

  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error('建议接口返回了非 JSON 内容')
  }

  return parseSuggest(json)
}

function parseSuggest(json) {
  let container = json?.data?.data
  if (!container || typeof container !== 'object' || Array.isArray(container)) {
    container = json?.data && typeof json.data === 'object' ? json.data : json
  }
  if (!container || typeof container !== 'object') return []

  const keys = Object.keys(container).sort((a, b) => {
    const na = toInt(a)
    const nb = toInt(b)
    if (na === null && nb === null) return a.localeCompare(b)
    if (na === null) return 1
    if (nb === null) return -1
    return na - nb
  })

  const out = []
  const seen = new Set()

  for (const key of keys) {
    const group = container[key]
    if (!Array.isArray(group)) continue

    for (const raw of group) {
      const label =
        typeof raw === 'string' ? raw : clean(raw?.keyword ?? raw?.name ?? raw?.title ?? raw?.label ?? '')
      if (!label) continue

      const typeNum = toInt(raw?.type) ?? toInt(key)
      const id = toInt(raw?.id)
      const businessKey = raw?.business_key ?? raw?.businessKey ?? null
      const type = typeNum === 1 ? 'song' : 'keyword'

      const sig = `${type}|${id ?? ''}|${label}`
      if (seen.has(sig)) continue
      seen.add(sig)

      out.push({
        id,
        businessKey: businessKey === null ? null : String(businessKey),
        musicId: toInt(businessKey),
        type,
        label,
        searchKeyword: toSearchKeyword(label, type)
      })
    }
  }

  return out
}

function toSearchKeyword(label, type) {
  const base = stripNoise(label)
  if (type !== 'song') return base

  const head = base.split(/\s*[-—–]\s*/)[0]
  return head && head.length >= 2 ? normalize(head) : base
}

/* ============ 一·二、猜你想找 ============ */

export async function guessMusics(keyword, limit = 6) {
  const kw = stripNoise(keyword)
  if (!kw) return []

  const { text } = await request(GUESS_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Accept: 'application/json, text/javascript, */*; q=0.01',
      Origin: BASE,
      Referer: `${BASE}/s/${encodeURIComponent(kw)}`
    },
    body: formBody({ keyword: kw }),
    timeout: 8000
  })

  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error('猜你想找接口返回了非 JSON 内容')
  }

  return parseGuess(json, limit)
}

function parseGuess(json, limit) {
  let raw = json?.data
  if (!Array.isArray(raw)) raw = Array.isArray(json?.data?.data) ? json.data.data : []
  if (!Array.isArray(raw)) raw = Array.isArray(json) ? json : []

  const out = []
  const seen = new Set()

  for (const item of raw) {
    const label = clean(item?.keyword ?? item?.name ?? item?.title ?? item?.label ?? '')
    if (!label) continue

    const musicId = toInt(item?.business_key ?? item?.businessKey) ?? toInt(item?.id)
    const sig = `${musicId ?? ''}|${label}`
    if (seen.has(sig)) continue
    seen.add(sig)

    out.push({
      id: toInt(item?.id),
      musicId,
      type: 'song',
      label,
      searchKeyword: guessSearchKeyword(label)
    })
  }

  return out.slice(0, limit)
}

function guessSearchKeyword(label) {
  const base = stripNoise(label)
  const head = base.split(/\s+/)[0]
  return head && head.length >= 2 ? stripNoise(head) : base
}

function stripNoise(str) {
  return normalize(
    String(str ?? '')
      .replace(/[\u200b-\u200d\ufeff]/g, '')
      .replace(/[.．]{2,}\s*$|[….]+$/g, '')
  )
}

/* ============ 二、搜索结果（HTML 解析） ============ */

export async function searchSongs(keyword) {
  const kw = stripNoise(keyword)
  if (!kw) {
    return { keyword: '', usedKeyword: '', notFound: false, tried: [], total: 0, list: [] }
  }

  const tried = []
  let emptyPage = null

  for (const candidate of keywordVariants(kw)) {
    tried.push(candidate)
    const html = await fetchSearchHtml(candidate)
    if (html === null) continue
    const page = parseSearchHtml(html, candidate)
    if (page.list.length) {
      return { ...page, keyword: kw, usedKeyword: candidate, notFound: false, tried }
    }
    emptyPage = page
    break
  }

  if (emptyPage) {
    return { ...emptyPage, keyword: kw, usedKeyword: emptyPage.keyword, notFound: false, tried }
  }
  return { keyword: kw, usedKeyword: kw, notFound: true, tried, total: 0, list: [] }
}

async function fetchSearchHtml(kw) {
  try {
    const { text } = await request(`${BASE}/s/${encodeURIComponent(kw)}`, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        Referer: `${BASE}/`
      },
      timeout: 12000
    })
    return text
  } catch (error) {
    if (error?.status === 404) return null
    throw error
  }
}

async function fetchPage(url) {
  try {
    const { text } = await request(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        Referer: `${BASE}/`
      },
      timeout: 12000
    })
    return text
  } catch (error) {
    if (error?.status === 404) return null
    throw error
  }
}

export function parseSearchHtml(html, keyword = '') {
  const list = pickList(html)
  const total = pickTotal(html)
  return { keyword, total: total ?? list.length, list }
}

function keywordVariants(kw) {
  const out = [kw]
  const push = (value) => {
    const v = stripNoise(value)
    if (v.length >= 2 && !out.includes(v)) out.push(v)
  }

  if (/[&＆]/.test(kw)) push(kw.replace(/[&＆]/g, ' '))

  const segments = kw.split(/\s+/).filter(Boolean)
  if (segments.length > 1) push(segments[0])

  return out.slice(0, 3)
}

function sliceResultRegion(html) {
  const hrefPos = html.search(/href\s*=\s*["'][^"']*\/music\/\d+/i)
  if (hrefPos === -1) return null

  let start = hrefPos
  const tagOpen = html.lastIndexOf('<a', hrefPos)
  const nearestTagEnd = html.lastIndexOf('>', hrefPos)
  if (tagOpen !== -1 && tagOpen > nearestTagEnd) start = tagOpen

  const stopMarks = [
    /id=["']guess-section["']/i,
    /id=["']search-notfound-btn["']/i,
    /class=["']card mb-3 guess-music-section/i,
    /<script[^>]*>\s*window\.appData/i,
    /<footer/i
  ]

  let end = html.length
  for (const mark of stopMarks) {
    const m = mark.exec(html)
    if (m && m.index > start) {
      end = Math.min(end, m.index)
    }
  }

  return end > start ? html.slice(start, end) : html.slice(start)
}

function pickTotal(html) {
  const m = /共\s*(\d+)\s*首/.exec(html) || /["']count["']\s*:\s*(\d+)/.exec(html)
  return m ? toInt(m[1]) : null
}

function pickId(tag = '') {
  const href = /href\s*=\s*["']([^"']*)["']/i.exec(tag)
  if (!href) return null
  const m = /\/music\/(\d+)/i.exec(href[1]) || /\/(\d+)(?:[?#/].*)?$/.exec(href[1])
  return m ? toInt(m[1]) : null
}

const SEPARATORS = [/\s+[-–—]\s+/, /\s*[|｜]\s*/]

function splitTitleArtist(text = '') {
  const raw = normalize(text)
  if (!raw) return ['', '']
  for (const sep of SEPARATORS) {
    const parts = raw.split(sep)
    if (parts.length >= 2) {
      const title = normalize(parts[0])
      const artist = normalize(parts.slice(1).join(' '))
      if (title) return [title, artist]
    }
  }
  return [raw, '']
}

function pickList(html) {
  const region = sliceResultRegion(html)
  const candidates = region ? [region, html] : [html]

  for (const scope of candidates) {
    let list = extractByAnchors(scope)
    if (!list.length) list = extractLoose(scope)
    if (list.length) return list
  }
  return []
}

function finalizeItem(id, title, artist) {
  let name = normalize(title)
  let singer = normalize(artist)

  if (!name && singer) {
    const [t, a] = splitTitleArtist(singer)
    name = t
    singer = a
  } else if (name && !singer) {
    const [t, a] = splitTitleArtist(name)
    name = t
    singer = a
  }

  if (name && singer && name.includes(' - ')) {
    const [t, a] = splitTitleArtist(name)
    if (a) {
      singer = `${normalize(a)} ${singer}`.trim()
      name = t
    }
  }

  if (!name) return null
  if (name === singer) singer = ''
  if (!id && !name) return null

  return { id: id ?? null, title: name, artist: singer }
}

function extractByAnchors(scope) {
  const anchors = []
  const anchorRe = /<a\b[^>]*>/gi
  let m
  while ((m = anchorRe.exec(scope)) !== null) {
    const id = pickId(m[0])
    if (id !== null) anchors.push({ index: m.index, tag: m[0], id })
  }
  if (!anchors.length) return []

  const items = []
  const seenId = new Set()

  for (let i = 0; i < anchors.length; i++) {
    const { index, tag, id } = anchors[i]
    const start = index
    const end = i + 1 < anchors.length ? anchors[i + 1].index : Math.min(scope.length, start + 3000)
    const block = scope.slice(start, end)

    if (seenId.has(id)) continue

    let title = clean(firstMatch(/<span class="text-primary[^"]*"[^>]*>([\s\S]*?)<\/span>/i, block))
    let artist = clean(firstMatch(/<small class="text-jade[^"]*"[^>]*>([\s\S]*?)<\/small>/i, block))

    if (!title) {
      const attr = firstMatch(/\btitle\s*=\s*["']([^"']*)["']/i, tag)
      if (attr) [title, artist] = splitTitleArtist(clean(attr))
    }

    if (!title) title = clean(firstMatch(/<span\b[^>]*>([\s\S]*?)<\/span>/i, block))
    if (!artist) artist = clean(firstMatch(/<small\b[^>]*>([\s\S]*?)<\/small>/i, block))

    if (!title && !artist) {
      const inner = firstMatch(
        /<a\b[^>]*href\s*=\s*["'][^"']*\/music\/\d+[^"']*["'][^>]*>([\s\S]*?)<\/a>/i,
        block
      )
      if (inner) [title, artist] = splitTitleArtist(clean(inner))
    }

    const item = finalizeItem(id, title, artist)
    if (!item) continue

    seenId.add(id)
    items.push(item)
  }

  return items
}

function extractLoose(scope) {
  const titles = collect(/<span class="text-primary[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, scope)
  const artists = collect(/<small class="text-jade[^"]*"[^>]*>([\s\S]*?)<\/small>/gi, scope)

  const items = []
  const len = Math.max(titles.length, artists.length)
  for (let i = 0; i < len; i++) {
    const item = finalizeItem(null, titles[i] || '', artists[i] || '')
    if (item) items.push(item)
  }
  return dedupe(items)
}

function collect(re, scope) {
  const out = []
  for (const m of String(scope).matchAll(re)) {
    const value = clean(m[1])
    if (value) out.push(value)
  }
  return out
}

function dedupe(items) {
  const seen = new Set()
  const out = []
  for (const item of items) {
    const sig = `${item.title}::${item.artist}`
    if (seen.has(sig)) continue
    seen.add(sig)
    out.push(item)
  }
  return out
}

/* ============ 二·二、热门推荐 / 排行榜（静态 HTML） ============ */

function parsePager(html) {
  const m = /<b>\s*(\d+)\s*<\/b>\s*\/\s*(\d+)/.exec(html)
  const current = m ? Number(m[1]) : 1
  const total = m ? Number(m[2]) : 1
  const hasNext = current < total
  return { current, total, hasNext }
}

export async function hotMusic(page = 1) {
  const html = await fetchPage(`${BASE}/hot-music?page=${page}`)
  if (html === null) return { list: [], current: page, total: page, hasNext: false }
  const info = parsePager(html)
  const parsed = parseSearchHtml(html, '')
  return { ...info, list: parsed.list.map((i) => ({ ...i, musicId: i.id ?? null })) }
}

/**
 * 排行榜：周搜索榜 / 周下载榜，支持 ?page=N
 */
export async function topMusic(type, page = 1) {
  const html = await fetchPage(`${BASE}/top/${type}?page=${page}`)
  if (html === null) return { type, list: [], current: page, total: page, hasNext: false }

  const info = parsePager(html)
  if (type === 'week-search') {
    return { type, ...info, list: parseSearchRank(html) }
  }

  const parsed = parseSearchHtml(html, '')
  return { type, ...info, list: parsed.list.map((i) => ({ ...i, musicId: i.id ?? null })) }
}

function parseSearchRank(html) {
  const re = /<a\b[^>]*href=["']\/s\/([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  const out = []
  const seen = new Set()
  let m

  while ((m = re.exec(html)) !== null) {
    const kw = decodeURIComponent(m[1].replace(/\+/g, ' '))
    const text = clean(m[2])
    const keyword = text || kw
    if (!keyword) continue

    const before = html.slice(Math.max(0, m.index - 700), m.index)
    const badges = [...before.matchAll(/badge-square[^>]*>([\s\S]*?)<\/span>/g)]
    const rank = badges.length ? Number(badges[badges.length - 1][1].replace(/\D/g, '')) || null : null

    if (seen.has(keyword)) continue
    seen.add(keyword)
    out.push({ rank, keyword })
  }

  return out.map((it, i) => ({ ...it, rank: it.rank ?? i + 1 }))
}

/* ============ 三、搜索热词 ============ */

export async function hotWords(limit = 20) {
  const url = `${HOT_API}?key=&httpsStatus=1&reqId=${newReqId()}&plat=web_www&from=`

  const json = await requestJson(url, {
    headers: {
      Accept: 'application/json, text/plain, */*',
      Referer: 'https://kuwo.cn/'
    },
    timeout: 8000
  })

  const raw = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : []
  return raw
    .map((item) => (typeof item === 'string' ? item : item?.key ?? item?.keyword ?? item?.word ?? ''))
    .map((v) => normalize(v))
    .filter(Boolean)
    .slice(0, limit)
}
