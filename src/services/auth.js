// 歌曲宝账号登录（传统表单登录）—— 移植自 Windows 端登录逻辑
// 说明：账号/密码明文传输，安全性不在客户端考量；remember 控制是否在本机保存凭据。
// 登录成功后只关心服务端下发的 Set-Cookie（会话），HTML 仅用于尽力提取昵称。
// 会话 Cookie 由 http.js 的内存 jar 托管，并通过本项目 KV 存储（@capacitor/preferences）持久化，
// 重新登录或退出登录时清除。
import { reactive } from 'vue'
import { Preferences } from '@capacitor/preferences'
import { showToast, dismissToast } from '../composables/toast.js'
import {
  request,
  formBody,
  setCookieForHost,
  getCookieString,
  clearHostCookies,
  resetProxySession,
  currentRoute
} from './http.js'

const HOST = 'www.gequbao.com'
const BASE = 'https://www.gequbao.com'
const LOGIN_URL = `${BASE}/member/auth/login`
const MEMBER_URL = `${BASE}/member` // 会员中心：登录态硬校验用（GET 可达）
const LOGOUT_URL = `${BASE}/member/auth/logout` // 服务端登出：GET，成功后 302 回登录页
const CHANGE_PWD_URL = `${BASE}/member/security/change-password` // 改密：仅接受 POST
// 忘记密码 / 注册：交由系统浏览器打开（游客态可达，无需登录）
export const RESET_PWD_URL = `${BASE}/member/auth/reset-by-email`
export const REGISTER_URL = `${BASE}/member/auth/register`
const KEY_AUTH = 'gequbao-auth' // 登录会话：cookies + 昵称 + 头像 + qq
const KEY_CRED = 'gequbao-cred' // 记住的账号密码（remember=on 时）

const state = reactive({
  loggedIn: false,
  username: '',
  nickname: '',
  email: '',
  avatar: '',
  qq: '',
  remember: false,
  loading: false,
  error: ''
})

async function read(key) {
  try {
    const { value } = await Preferences.get({ key })
    return value ? JSON.parse(value) : null
  } catch {
    return null
  }
}
async function write(key, obj) {
  await Preferences.set({ key, value: JSON.stringify(obj) })
}
function remove(key) {
  return Preferences.remove({ key })
}

// 把持久化的 cookie 字符串重新灌入内存 jar，使后续请求自动带上会话
function applyCookies(cookieStr) {
  if (!cookieStr) return
  for (const part of cookieStr.split(';')) {
    const idx = part.indexOf('=')
    if (idx <= 0) continue
    const name = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (name) setCookieForHost(HOST, name, value)
  }
}

// QQ 头像：用 QQ 号换官方头像；留空则无头像（由 UI 回退默认图标）
function buildAvatar(qq) {
  if (!qq) return ''
  return `https://q1.qlogo.cn/g?b=qq&nk=${encodeURIComponent(qq)}&s=640`
}

// 从个人中心 HTML 提取「绑定邮箱」。
// 必须锚定站点模板上下文：登录页/页脚也含 example@email.com 等占位邮箱，全页裸扫会误取。
function extractBoundEmail(html) {
  if (!html) return ''
  const E = String.raw`[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}`
  const patterns = [
    // 「安全邮箱」标签后紧跟的 <p class="font-weight-bold text-break">邮箱</p>
    new RegExp(String.raw`安全邮箱[\s\S]{0,300}?<p[^>]*>\s*(${E})\s*</p>`, 'i'),
    // 「绑定邮箱」区块内的 text-break 段落
    new RegExp(String.raw`绑定邮箱[\s\S]{0,2000}?text-break[^>]*>\s*(${E})\s*<`, 'i'),
    // 「邮箱已绑定」提示之后的第一个邮箱
    new RegExp(String.raw`邮箱已绑定[\s\S]{0,1500}?(${E})`, 'i')
  ]
  for (const re of patterns) {
    const m = re.exec(html)
    if (m && m[1]) return m[1].trim()
  }
  return ''
}

// QQ 邮箱（纯数字账号）→ QQ 号，用于自动生成头像
function qqFromEmail(email) {
  const m = /^(\d{5,12})@qq\.com$/i.exec(email || '')
  return m ? m[1] : ''
}

// 依据登录请求「最终重定向地址」判断成败（站点行为）：
// 失败 → 终点是站点主页 https://www.gequbao.com 或登录页 /member/auth/login；
// 成功 → 终点是个人中心（/member 下的其它页面）。
// 返回：'fail' | 'ok' | 'unknown-host'
// unknown-host 表示最终地址不是 gequbao —— 说明请求根本没打到目标站
// （常见于 dev server 未重启 / 代理未生效被重定向回 SPA 首页），必须单独报错，
// 绝不能因为路径是 `/` 就当成「密码错误」，否则会把正确密码也误判。
function classifyLoginFinal(url) {
  try {
    const u = new URL(url)
    if (!/(^|\.)gequbao\.com$/i.test(u.hostname)) return 'unknown-host'
    const p = u.pathname.replace(/\/+$/, '') // '' 表示站点主页
    if (!p) return 'fail' // 站点主页
    if (p.startsWith('/member/auth/login')) return 'fail' // 登录页
    return 'ok'
  } catch {
    return 'unknown-host'
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 硬校验：访问必须登录才能看的 /member。
// 游客会被 302 踢回 /member/auth/login —— 这比「登录响应自身的重定向终点」可靠得多，
// 也是唯一能证明「会话 cookie 真的生效了」的判据（原生端尤其需要）。
async function verifySession() {
  const res = await request(MEMBER_URL, {
    method: 'GET',
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      Referer: MEMBER_URL
    }
  })
  return {
    cls: classifyLoginFinal(res.finalUrl || ''),
    finalUrl: res.finalUrl || '',
    html: res.text || ''
  }
}

// 解析个人中心 HTML：手填 QQ 优先，未填且是 QQ 邮箱时自动取邮箱前缀作为 QQ 号
function resolveProfile(html, qqInput) {
  const email = extractBoundEmail(html)
  const qq = String(qqInput || '').trim() || qqFromEmail(email)
  return { email, qq, avatar: buildAvatar(qq) }
}

// 登录成功后的善后：更新状态 + 持久化会话与凭据
async function commitLogin({ username, password, remember, qq, html }) {
  const { email, qq: finalQq, avatar } = resolveProfile(html, qq)
  const cookies = getCookieString(HOST)

  state.loggedIn = true
  state.username = username
  state.nickname = username // 昵称与账号一致，无需解析 HTML
  state.email = email
  state.avatar = avatar
  state.qq = finalQq
  state.remember = !!remember

  await write(KEY_AUTH, {
    username,
    nickname: username,
    email,
    avatar,
    qq: finalQq,
    remember: !!remember,
    cookies,
    loggedInAt: Date.now()
  })
  if (remember) {
    // 记住密码：明文保存凭据，便于下次直接登录
    await write(KEY_CRED, { username, password, remember: true })
  } else {
    await remove(KEY_CRED)
  }
  return { ok: true }
}

export async function login({ username, password, remember, qq }) {
  state.loading = true
  state.error = ''
  const route = currentRoute()
  console.warn('[login] start', String(username), `route=${route}`)
  try {
    let lastFinal = ''
    // 最多两轮：dev 代理重启瞬间可能把请求吞成 SPA 首页（finalUrl 落在 dev 主机），重试一次即可
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await request(LOGIN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br, zstd',
          Referer: `${BASE}/member/auth/login`
        },
        body: formBody({ username, password, remember: remember ? 'on' : '' })
      })

      const cls = classifyLoginFinal(res.finalUrl || '')
      lastFinal = res.finalUrl || ''
      console.warn('[login debug]', {
        try: attempt + 1,
        route,
        cls,
        redirected: res.redirected,
        finalUrl: res.finalUrl,
        status: res.status,
        hasPasswordInput: /type=["']?password/i.test(res.text)
      })

      // 终点不在 gequbao：请求根本没到目标站（代理重启中 / 跑的是旧包），重试一次
      if (cls === 'unknown-host') {
        if (attempt === 0) {
          await sleep(300)
          continue
        }
        break
      }

      // 终点是站点主页或登录页 → 账号密码错误
      if (cls === 'fail') throw new Error('账号或密码错误，请重试')

      // 终点是个人中心 → 再访问受保护页，确认会话真的建立了
      const v = await verifySession()
      console.warn('[login verify]', v)
      if (v.cls === 'ok') {
        // 登录响应与校验页都可能是个人中心 HTML，合并后解析绑定邮箱
        return await commitLogin({
          username,
          password,
          remember,
          qq,
          html: `${res.text || ''}\n${v.html || ''}`
        })
      }
      if (v.cls === 'fail') {
        throw new Error('登录已提交但会话未建立（cookie 未保存），请重试；若反复出现请重启 App')
      }

      // 校验也没拿到有效终点 → 视作链路异常，重试
      lastFinal = v.finalUrl || lastFinal
      if (attempt === 0) {
        await sleep(300)
        continue
      }
      break
    }

    throw new Error(
      `登录未到达 gequbao（${route}），请确认 dev server 已重启 / 网络可达后重试 [final=${lastFinal}]`
    )
  } catch (e) {
    console.warn('[login] catch', e?.message, String(e?.body || '').slice(0, 200))
    state.error = e?.message || '登录失败，请检查网络或账号'
    return { ok: false, error: state.error }
  } finally {
    state.loading = false
  }
}

// 供「查看 Cookie」调试入口使用：优先取内存 jar，为空则回退到本地持久化
export async function getAccountCookie() {
  const live = getCookieString(HOST)
  if (live) return live
  const saved = await read(KEY_AUTH)
  return saved?.cookies || ''
}

// 应用启动时调用：恢复上次登录会话（仅重灌 cookie，不触发网络）
export async function restore() {
  const auth = await read(KEY_AUTH)
  if (!auth) return
  applyCookies(auth.cookies)
  state.loggedIn = true
  state.username = auth.username || ''
  state.nickname = auth.nickname || auth.username || ''
  state.email = auth.email || ''
  state.avatar = auth.avatar || ''
  state.qq = auth.qq || ''
  state.remember = !!auth.remember
  // 旧版本持久化数据没有邮箱：异步补抓一次个人中心，失败静默保持默认
  if (!state.email) refreshProfile()
}

// 已登录但缺少邮箱信息时补抓个人中心，顺带用 QQ 邮箱补齐头像
export async function refreshProfile(retried = false) {
  if (!state.loggedIn || state.email) return
  try {
    const res = await request(MEMBER_URL, {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        Referer: MEMBER_URL
      }
    })
    if (/\/member\/auth\/login/i.test(res.finalUrl || '')) {
      // 会话 Cookie 已过期：后台静默重登后重试一次，避免资料一直补不上
      if (!retried) {
        const refreshed = await refreshSession()
        if (refreshed.ok) return refreshProfile(true)
      }
      return
    }
    const { email, qq, avatar } = resolveProfile(res.text, state.qq)
    if (!email) return // 没匹配到就算了
    state.email = email
    state.qq = qq
    state.avatar = avatar
    const auth = await read(KEY_AUTH)
    if (auth) await write(KEY_AUTH, { ...auth, email, qq, avatar })
  } catch {
    /* 静默降级：保持默认显示 */
  }
}

export async function logout() {
  // 先尽力通知服务端登出：接口直接返回 200（跳回登录页是页面内跳转，非 HTTP 302），
  // request() 对非 2xx 抛错，不抛错即视为登出成功；失败不阻塞本地登出。
  try {
    await request(LOGOUT_URL, {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        Referer: MEMBER_URL
      }
    })
  } catch {
    /* 服务端登出失败时静默，仅影响远端会话残留 */
  }
  clearHostCookies(HOST)
  await resetProxySession()
  state.loggedIn = false
  state.username = ''
  state.nickname = ''
  state.email = ''
  state.avatar = ''
  state.qq = ''
  state.remember = false
  await remove(KEY_AUTH)
  // remember=on 时保留账号密码，便于下次直接登录；否则一并清除
  const cred = await read(KEY_CRED)
  if (!cred?.remember) await remove(KEY_CRED)
}

// 从站点返回的 JSON 里提取可读错误（Laravel 验证错误在 errors 字段）
function pickPwdError(data) {
  if (!data || typeof data !== 'object') return ''
  if (data.errors) {
    const first = Object.values(data.errors)[0]
    return Array.isArray(first) ? String(first[0]) : String(first)
  }
  return data.msg || data.message || ''
}

// 修改密码：站点真实接口为 POST /member/security/change-password（Laravel AJAX 接口），
// 必须带 x-requested-with: XMLHttpRequest。注意 /member 只接受 GET，POST 必然 405。
function pwdNeedRelogin({ finalUrl, status, hint }) {
  if (status === 401 || status === 419) return true
  if (/\/member\/auth\/login/i.test(finalUrl || '')) return true
  if (/Unauthenticated/i.test(hint || '')) return true
  return false
}

// 直接回登录页 HTML（未发生重定向）时，响应不是业务 JSON
function isLoginPageHtml(text) {
  return /<html[\s>]/i.test(text || '') && /member\/auth\/login/i.test(text || '')
}

async function requestPwdChange({ oldPassword, newPassword }) {
  try {
    const res = await request(CHANGE_PWD_URL, {
      method: 'POST',
      accept: 'application/json, text/plain, */*',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-requested-with': 'XMLHttpRequest',
        Referer: `${BASE}/member`
      },
      body: formBody({
        old_password: oldPassword,
        new_password: newPassword,
        new_password_confirmation: newPassword
      })
    })

    let data = null
    try {
      data = JSON.parse(res.text)
    } catch {
      data = null
    }
    const hint = pickPwdError(data)
    // 302 到登录页、401/419、Unauthenticated、或直接吐登录页 HTML，都属于会话失效
    if (
      pwdNeedRelogin({ finalUrl: res.finalUrl, status: res.status, hint }) ||
      (!data && isLoginPageHtml(res.text))
    ) {
      return { ok: false, needRelogin: true, error: '登录状态已失效' }
    }
    // 明确的失败信号：验证错误 / success:false / 非成功的 code / 文案含错误
    if (
      (data &&
        (data.errors ||
          data.success === false ||
          (data.code !== undefined && data.code !== 1 && data.code !== 200))) ||
      /密码错误|原密码|旧密码|不正确|失败|incorrect|invalid/i.test(hint)
    ) {
      return { ok: false, error: hint || '密码修改失败，请确认旧密码是否正确' }
    }

    // 2xx 视为成功：站点可能返回空 body、JSON 提示，或 302 回会员中心
    syncRememberedPassword(newPassword)
    return { ok: true, msg: hint || '密码修改成功' }
  } catch (e) {
    // request() 对非 2xx 抛错，body 里通常是站点 JSON
    let data = null
    try {
      data = JSON.parse(e?.body)
    } catch {
      data = null
    }
    const hint = pickPwdError(data)
    if (
      pwdNeedRelogin({ status: e?.status, hint }) ||
      (!data && isLoginPageHtml(String(e?.body || '')))
    ) {
      return { ok: false, needRelogin: true, error: '登录状态已失效' }
    }
    const msg =
      hint || (e?.status ? `HTTP ${e.status}` : '') || e?.message || '密码修改失败，请检查网络'
    return { ok: false, error: msg }
  }
}

// 提交改密：会话过期时先后台静默重登，再自动重试一次原请求
export async function changePassword({ oldPassword, newPassword }) {
  let r = await requestPwdChange({ oldPassword, newPassword })
  if (r.ok || !r.needRelogin) return r

  const refreshed = await refreshSession()
  if (!refreshed.ok) {
    return {
      ok: false,
      error: refreshed.needManualLogin
        ? '登录状态已失效，请重新登录后再修改密码'
        : '登录状态刷新失败，请重新登录后再修改密码'
    }
  }
  r = await requestPwdChange({ oldPassword, newPassword })
  return r.needRelogin
    ? { ok: false, error: '登录状态已失效，请重新登录后再修改密码' }
    : r
}

// 若开启了记住密码，同步更新本地保存的密码，避免下次预填旧密码
function syncRememberedPassword(newPassword) {
  if (!state.remember) return
  read(KEY_CRED).then((cred) => {
    if (cred && cred.remember) {
      write(KEY_CRED, { username: cred.username, password: newPassword, remember: true })
    }
  })
}

// 读取已记住的凭据，用于登录框预填
export async function loadSavedCred() {
  const cred = await read(KEY_CRED)
  if (cred && cred.remember) {
    return { username: cred.username || '', password: cred.password || '', remember: true }
  }
  return { username: '', password: '', remember: false }
}

/* ============ 会话自动刷新 ============
 * 站点会话 Cookie 时效很短：业务请求（云端收藏、改密等）一旦发现会话失效，
 * 就用本地「记住密码」保存的账号密码在后台重新登录，拿到新 Cookie 后由调用方重试原操作。
 * 同一时刻只跑一次；失败后 60 秒内不重复尝试，避免分页/批量请求触发登录风暴。 */
let refreshing = null
let lastFailure = null
let lastFailAt = 0
const REFRESH_COOLDOWN = 60_000

export function refreshSession() {
  if (refreshing) return refreshing
  if (lastFailure && Date.now() - lastFailAt < REFRESH_COOLDOWN) {
    return Promise.resolve(lastFailure)
  }
  refreshing = (async () => {
    const cred = await loadSavedCred()
    if (!cred.username || !cred.password) {
      lastFailure = { ok: false, needManualLogin: true, error: '未保存账号密码，请重新登录' }
      lastFailAt = Date.now()
      return lastFailure
    }

    const tip = showToast('正在刷新登录状态…', { type: 'info', duration: 0 })
    // login() 会写 state.loading / state.error / 用户资料，静默刷新结束后按需恢复
    const prevLoading = state.loading
    const prevError = state.error
    const prevProfile = { email: state.email, qq: state.qq, avatar: state.avatar }
    try {
      // 丢弃已失效的会话，避免登录请求带着过期 Cookie 被站点拒绝
      clearHostCookies(HOST)
      await resetProxySession()
      const r = await login({
        username: cred.username,
        password: cred.password,
        remember: true,
        qq: state.qq
      })
      if (!r.ok) {
        lastFailure = { ok: false, needManualLogin: false, error: r.error || '登录状态刷新失败' }
        lastFailAt = Date.now()
        return lastFailure
      }
      // 重登时若这次没解析到绑定邮箱，保留原有资料，避免个人页信息丢失
      if (!state.email && prevProfile.email) {
        state.email = prevProfile.email
        state.qq = prevProfile.qq
        state.avatar = prevProfile.avatar
        const saved = await read(KEY_AUTH)
        if (saved) {
          await write(KEY_AUTH, { ...saved, email: state.email, qq: state.qq, avatar: state.avatar })
        }
      }
      lastFailure = null
      lastFailAt = 0
      showToast('登录状态已刷新', { type: 'success', duration: 1600 })
      return { ok: true }
    } catch (e) {
      lastFailure = { ok: false, needManualLogin: false, error: e?.message || '登录状态刷新失败' }
      lastFailAt = Date.now()
      return lastFailure
    } finally {
      state.loading = prevLoading
      state.error = prevError
      dismissToast(tip)
    }
  })().finally(() => {
    refreshing = null
  })
  return refreshing
}

export function useAuth() {
  return state
}
