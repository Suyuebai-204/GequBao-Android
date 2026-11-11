// 浏览器版 http.js —— 移植自 Windows 端 main/http.js
// 改动点：去掉 node:crypto / Buffer，改用 Web 标准 API；原生端改走原生 HTTP 代理绕开 CORS。
import { isNative, nativeHttp } from '../native/bridge.js'
import { beginNetwork, endNetwork } from '../composables/networkHint.js'

// UA 必须是较新的 Chrome：站点网关会把旧版 UA（实测 <135）识别为机器人。
// 浏览器里 fetch 默认不带 UA，这里显式下发一个较新 Chrome UA。
export const UA = `Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36`

// 构建标记：控制台出现这行，才说明当前运行的是最新代码
console.log('[gqb] http.js build=2026-11-06 proxy-v3-verify')

const DEFAULT_TIMEOUT = 12000

/* ============ 简易 cookie jar ============
 * 与桌面端一致：gequbao 的直链接口需要会话 cookie，按域名缓存 set-cookie。
 * 浏览器同源请求 fetch 会自动带 cookie，但本站接口多为跨域/JSONP 式调用，
 * 仍由 jar 在请求头里手动带上，保证与桌面行为一致。 */
const cookieJar = new Map() // hostname -> Map<name, value>

function domainOf(url) {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

// 所有 gequbao 请求（含 dev 代理 /gqb 路径）统一用同一个 jar key，
// 避免代理路径（localhost）与真实域名（www.gequbao.com）被当成两个域、cookie 对不上。
const GQ_HOST = 'www.gequbao.com'
function cookieHostFor(url) {
  if (/^https?:\/\/(www\.)?gequbao\.com\//i.test(url)) return GQ_HOST
  if (/^\/gqb(\/|$)/i.test(url)) return GQ_HOST
  return domainOf(url)
}

function storeCookies(url, res, hostOverride) {
  const host = hostOverride || cookieHostFor(url)
  if (!host) return

  let list = []
  if (typeof res.headers.getSetCookie === 'function') {
    list = res.headers.getSetCookie()
  } else {
    const raw = res.headers.get('set-cookie')
    if (raw) list = raw.split(',').map((s) => s.trim())
  }
  if (!list.length) return

  if (!cookieJar.has(host)) cookieJar.set(host, new Map())
  const jar = cookieJar.get(host)

  for (const raw of list) {
    const head = raw.split(';')[0]
    const idx = head.indexOf('=')
    if (idx <= 0) continue
    const name = head.slice(0, idx).trim()
    const value = head.slice(idx + 1).trim()
    if (!name) continue

    const exp = /expires=([^;]+)/i.exec(raw)
    if (exp && new Date(exp[1]).getTime() < Date.now()) {
      jar.delete(name)
      continue
    }
    jar.set(name, value)
  }
}

function cookieHeader(url, hostOverride) {
  const jar = cookieJar.get(hostOverride || cookieHostFor(url))
  if (!jar || jar.size === 0) return ''
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}

/* 以下供登录态持久化使用：在内存 jar 与本地存储之间搬运会话 cookie */
export function setCookieForHost(hostname, name, value) {
  const host = hostname || ''
  if (!host) return
  if (!cookieJar.has(host)) cookieJar.set(host, new Map())
  cookieJar.get(host).set(name, value)
}

export function getCookieString(hostname) {
  const jar = cookieJar.get(hostname || '')
  if (!jar || jar.size === 0) return ''
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}

export function clearHostCookies(hostname) {
  cookieJar.delete(hostname || '')
}

function abortAfter(ms) {
  if (typeof AbortSignal?.timeout === 'function') return AbortSignal.timeout(ms)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  timer.unref?.()
  return controller.signal
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Buffer.from(buf).toString('latin1') 的浏览器等价实现（逐字节 0-255 映射）
function bytesToLatin1(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let out = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return out
}

function pickEncoding(contentType, buf) {
  const fromHeader = /charset\s*=\s*"?([a-z0-9_-]+)"?/i.exec(contentType || '')
  const label = fromHeader ? fromHeader[1].toLowerCase() : null
  if (label) return label

  try {
    const head = bytesToLatin1(buf.subarray(0, 4096))
    const fromMeta = /<meta[^>]+charset\s*=\s*"?([a-z0-9_-]+)"?/i.exec(head)
    if (fromMeta) return fromMeta[1].toLowerCase()
  } catch {
    /* ignore */
  }
  return 'utf-8'
}

function canonicalEncoding(label) {
  if (!label || label === 'utf8') return 'utf-8'
  if (/^(gb2312|gbk|gb18030|gb-?18030)$/.test(label)) return 'gb18030'
  if (label.startsWith('big5')) return 'big5'
  if (label.startsWith('windows-125')) return label
  return 'utf-8'
}

export function decodeBody(buf, contentType = '') {
  const candidates = [canonicalEncoding(pickEncoding(contentType, buf)), 'utf-8']
  for (const enc of candidates) {
    try {
      return new TextDecoder(enc).decode(buf)
    } catch {
      /* 不支持的标签则回退 */
    }
  }
  return new TextDecoder('utf-8').decode(buf)
}

/**
 * 带超时 + 重试的文本请求。返回 { text, status, url }
 */
function base64ToBytes(b64) {
  const bin = atob(b64 || '')
  const len = bin.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

// 原生端请求由 Java 侧发起，绕开 WebView 的 CORS 限制
async function nativeRequest(url, options) {
  const {
    method = 'GET',
    headers = {},
    body,
    timeout = DEFAULT_TIMEOUT,
    retries = 1,
    accept = '*/*'
  } = options

  let lastError
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const cookies = cookieHeader(url)
      const res = await nativeHttp({
        url,
        method,
        headers: {
          'User-Agent': UA,
          Accept: accept,
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          ...(cookies ? { Cookie: cookies } : {}),
          ...headers
        },
        body,
        timeout
      })
      const contentType =
        (res.headers && (res.headers['content-type'] || res.headers['Content-Type'])) || ''
      // 原生侧已逐跳维护 cookie 并通过 res.cookies 回传；用它同步本地 jar（用于持久化）。
      // 旧版插件没有 cookies 字段时，回退到解析 set-cookie。
      if (res.cookies) {
        const hostKey = cookieHostFor(url)
        for (const part of String(res.cookies).split(';')) {
          const p = part.trim()
          const i = p.indexOf('=')
          if (i > 0) setCookieForHost(hostKey, p.slice(0, i).trim(), p.slice(i + 1).trim())
        }
      } else {
        storeCookies(url, { headers: fakeHeaders(res.headers) })
      }
      const buf = base64ToBytes(res.bodyBase64 || '')
      const text = decodeBody(buf, contentType)
      if (!res.status || res.status >= 400) {
        const isClient = res.status >= 400 && res.status < 500
        const err = new Error(`HTTP ${res.status}`)
        err.status = res.status
        err.body = text
        if (!isClient && attempt < retries) {
          await sleep(250 * (attempt + 1))
          continue
        }
        throw err
      }
      return {
        text,
        status: res.status,
        url,
        finalUrl: res.finalUrl || null,
        redirected: !!res.redirected
      }
    } catch (err) {
      lastError = err
      const isClientError = err?.status >= 400 && err?.status < 500
      if (attempt < retries && !isClientError) {
        await sleep(250 * (attempt + 1))
        continue
      }
      const reason =
        err?.name === 'AbortError' || err?.name === 'TimeoutError' ? '请求超时' : err?.message
      const wrapped = new Error(`${reason || '网络请求失败'}`)
      wrapped.status = err?.status
      wrapped.body = err?.body
      throw wrapped
    }
  }
  throw lastError
}

function fakeHeaders(headers = {}) {
  return {
    get(name) {
      const v = headers[name] ?? headers[name.toLowerCase()]
      return v == null ? null : String(v)
    },
    getSetCookie() {
      const sc = headers['set-cookie'] ?? headers['Set-Cookie']
      if (!sc) return []
      return String(sc).split(',').map((s) => s.trim())
    }
  }
}

// 是否由 dev server 托管：桌面浏览器，或 Capacitor WebView 通过 server.url 加载 dev server。
// 这种场景应走浏览器 fetch + /gqb 代理（由 Node 侧维护 cookie 并跟随重定向），
// 而非原生 HTTP（会跟随重定向但丢失中间 Set-Cookie 与最终地址）。
// 生产 WebView 默认是 https://localhost；dev server 是 http://<ip>:5173 —— 用协议即可区分。
function onDevServer() {
  try {
    if (typeof window === 'undefined' || !window.location) return false
    const loc = window.location
    return loc.protocol === 'http:' || loc.port === '5173' || loc.port === '4173'
  } catch {
    return false
  }
}

// 当前请求链路：native = 原生 HTTP（离线包/App）；proxy = dev server 代理；web = 浏览器
export function currentRoute() {
  if (isNative() && !onDevServer()) return 'native'
  return onDevServer() ? 'proxy' : 'web'
}

// 清空 dev 代理端的会话 jar（cookie 现由 Node 代理维护，前端清 jar 不够）
export async function resetProxySession() {
  if (!onDevServer()) return
  try {
    await fetch('/gqb/__session/reset', { method: 'POST' })
  } catch {
    /* 忽略 */
  }
}

async function doRequest(url, options = {}) {
  if (isNative() && !onDevServer()) return nativeRequest(url, options)
  const {
    method = 'GET',
    headers = {},
    body,
    timeout = DEFAULT_TIMEOUT,
    retries = 1,
    accept = '*/*'
  } = options

  let lastError
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // dev 代理路径：cookie 与重定向全部交给 Node 代理处理，这里只做普通 fetch。
      // 原因：浏览器 fetch 的 redirect:'manual' 对 3xx 只返回 opaque 响应（status=0），
      // 既读不到 Location 也读不到 body，无法在浏览器侧手动跟随重定向或抓 302 的 Set-Cookie。
      if (onDevServer() && /^https?:\/\/(www\.)?gequbao\.com\//i.test(url)) {
        const proxyUrl = url.replace(/^https?:\/\/(www\.)?gequbao\.com/, '/gqb')
        const res = await fetch(proxyUrl, {
          method,
          headers: {
            'User-Agent': UA,
            Accept: accept,
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            ...headers
          },
          body: method === 'GET' || method === 'HEAD' ? undefined : body,
          redirect: 'follow',
          signal: abortAfter(timeout)
        })
        const ct = res.headers?.get?.('content-type') || ''
        const buf = new Uint8Array(await res.arrayBuffer())
        const text = decodeBody(buf, ct)
        if (!res.ok) {
          const error = new Error(`HTTP ${res.status}`)
          error.status = res.status
          error.body = text
          throw error
        }
        // 代理必须回传最终落点；若没有，说明 dev server 没跑在带插件的配置上
        // （常见：改了 vite.config.js 却没重启、或用静态服务器托管 dist）。
        // 此时绝不能把 SPA 首页当成功，直接报错以免“假成功”。
        const proxyFinal = res.headers.get('x-gqb-final-url')
        if (!proxyFinal) {
          const error = new Error('代理未生效：响应不来自 gequbao，请重启 npm run dev')
          error.status = 400
          error.body = text
          throw error
        }
        // 同步服务端 jar 的最终 cookie 到本地 jar，保证会话可持久化
        const proxyCookies = res.headers.get('x-gqb-cookies')
        if (proxyCookies) {
          const hostKey = cookieHostFor(url)
          for (const part of proxyCookies.split(';')) {
            const p = part.trim()
            const i = p.indexOf('=')
            if (i > 0) setCookieForHost(hostKey, p.slice(0, i).trim(), p.slice(i + 1).trim())
          }
        }
        return {
          text,
          status: res.status,
          url,
          finalUrl: proxyFinal,
          redirected: res.headers.get('x-gqb-redirected') === '1'
        }
      }

      let curUrl = url
      let curMethod = method
      let curBody = body
      let redirects = 0

      // 手动跟随重定向，确保捕获每一跳的 Set-Cookie。
      // 关键点：Laravel 登录流程为「POST → 302 重定向」，认证会话 cookie 正是在 302
      // 响应里下发的；fetch 的 redirect:'follow' 会丢弃中间响应的 Set-Cookie，
      // 导致我们最终只拿到游客会话 cookie，后续接口返回 401 Unauthenticated。
      while (true) {
        const useProxy = onDevServer() && /^https?:\/\/(www\.)?gequbao\.com\//i.test(curUrl)
        const finalUrl = useProxy ? curUrl.replace(/^https?:\/\/(www\.)?gequbao\.com/, '/gqb') : curUrl
        const cookies = cookieHeader(curUrl)
        const res = await fetch(finalUrl, {
          method: curMethod,
          headers: {
            'User-Agent': UA,
            Accept: accept,
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            ...(useProxy && cookies ? { 'x-gqb-cookie': cookies } : {}),
            ...(cookies && !useProxy ? { Cookie: cookies } : {}),
            ...headers
          },
          body: curMethod === 'GET' || curMethod === 'HEAD' ? undefined : curBody,
          redirect: 'manual',
          signal: abortAfter(timeout)
        })

        // 无论是否重定向，都先把这一跳下发的 cookie 收进 jar
        storeCookies(curUrl, res)

        const status = res.status
        if (status >= 300 && status < 400) {
          const loc = res.headers.get('location')
          if (loc && redirects < 5) {
            curUrl = new URL(loc, curUrl).href
            // 301/302/303 重定向后改 GET；307/308 保留原方法
            if (status === 301 || status === 302 || status === 303) {
              curMethod = 'GET'
              curBody = undefined
            }
            redirects++
            continue
          }
        }

        const ct = res.headers?.get?.('content-type') || ''
        const buf = new Uint8Array(await res.arrayBuffer())
        const text = decodeBody(buf, ct)
        if (!res.ok) {
          const error = new Error(`HTTP ${res.status}`)
          error.status = res.status
          error.body = text
          throw error
        }
        return { text, status: res.status, url: curUrl, finalUrl: curUrl, redirected: redirects > 0 }
      }
    } catch (err) {
      lastError = err
      const isClientError = err?.status >= 400 && err?.status < 500
      if (attempt < retries && !isClientError) {
        await sleep(250 * (attempt + 1))
        continue
      }
      const reason = err?.name === 'AbortError' || err?.name === 'TimeoutError' ? '请求超时' : err?.message
      const wrapped = new Error(`${reason || '网络请求失败'}`)
      wrapped.status = err?.status
      wrapped.body = err?.body
      throw wrapped
    }
  }
  throw lastError
}

/**
 * 所有网络请求的统一出口：按并发数显示/收起一条「正在请求…」提示。
 * options.quiet 供内部探测类请求关闭提示（成功/失败仍由各操作自己的 toast 负责）。
 */
export async function request(url, options = {}) {
  if (options.quiet) return doRequest(url, options)
  beginNetwork()
  try {
    return await doRequest(url, options)
  } finally {
    endNetwork()
  }
}

export async function requestJson(url, options = {}) {
  const { accept = 'application/json, text/plain, */*', ...rest } = options
  const { text } = await request(url, { ...rest, accept })
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('响应不是合法的 JSON')
  }
}

export function formBody(obj = {}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue
    params.append(key, String(value))
  }
  return params.toString()
}

export function newReqId() {
  try {
    return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(16).slice(2)}`
  } catch {
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`
  }
}
