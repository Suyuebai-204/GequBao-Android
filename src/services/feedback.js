// 歌曲纠错反馈：POST https://www.gequbao.com/api/feedback
// 表单字段：musicErrType（30 字以内的错误描述）、musicId（当前歌曲 id）。
// Cookie 非必需，request() 会按当前路由自动附带已登录会话。
// 成功：{ code: 1, msg: '你的反馈已提交到后台，我们会尽快处理！' }
import { request, formBody } from './http.js'

const BASE = 'https://www.gequbao.com'
const FEEDBACK_API = `${BASE}/api/feedback`

export const FEEDBACK_MAX_LEN = 30

export async function submitFeedback(musicId, content) {
  const id = Number(musicId)
  const text = String(content ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, FEEDBACK_MAX_LEN)

  if (!Number.isFinite(id) || id <= 0) return { ok: false, msg: '当前歌曲不支持反馈' }
  if (!text) return { ok: false, msg: '请输入错误描述' }

  let raw
  try {
    const res = await request(FEEDBACK_API, {
      method: 'POST',
      accept: 'application/json, text/javascript, */*; q=0.01',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        Origin: BASE,
        Referer: `${BASE}/music/${id}`
      },
      body: formBody({ musicErrType: text, musicId: id }),
      timeout: 10000,
      retries: 0 // 反馈类请求不自动重试，避免重复提交
    })
    raw = res.text
  } catch (e) {
    // 4xx 时 request 会把响应体挂在 error.body，尽量把站点给的错误原因展示出来
    const body = String(e?.body || '')
    if (body) {
      try {
        const data = JSON.parse(body)
        if (data?.msg || data?.message) return { ok: false, msg: data.msg || data.message }
      } catch {
        /* 非 JSON 响应，回退到网络错误提示 */
      }
    }
    throw new Error(e?.message || '网络请求失败，请稍后重试')
  }

  let data
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error('反馈接口返回了非 JSON 内容')
  }

  if (data?.code === 1) {
    return { ok: true, msg: data.msg || '你的反馈已提交到后台，我们会尽快处理！' }
  }
  return { ok: false, msg: data?.msg || data?.message || '提交失败，请稍后重试' }
}
