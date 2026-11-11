import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'

const GQB_ORIGIN = 'https://www.gequbao.com'
// 代理对上游 gequbao 一律用桌面 Chrome UA：站点网关会把旧版/移动 UA 识别为机器人。
const PROXY_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

// dev 代理：在 Node 侧维护 cookie jar 并手动跟随重定向，复刻 Python requests 的行为。
// 为什么必须在服务端做：浏览器 fetch 的 redirect:'manual' 对 3xx 只返回 opaque 响应
// （status=0，读不到 Location、读不到 body），因此「逐跳跟重定向 + 抓中间 Set-Cookie」
// 在浏览器里根本无法实现；而 Laravel 登录的认证会话 cookie 恰好下发在 302 上。
function gequbaoProxy() {
  const jar = new Map() // name -> value（单会话，dev 调试足够）

  const cookieHeader = () =>
    [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')

  function storeCookies(list) {
    for (const raw of list || []) {
      const head = raw.split(';')[0]
      const idx = head.indexOf('=')
      if (idx <= 0) continue
      const name = head.slice(0, idx).trim()
      const value = head.slice(idx + 1).trim()
      if (!name) continue
      const exp = /expires=([^;]+)/i.exec(raw)
      if (exp && new Date(exp[1]).getTime() < Date.now()) jar.delete(name)
      else jar.set(name, value)
    }
  }

  function getSetCookies(res) {
    try {
      if (typeof res.headers.getSetCookie === 'function') return res.headers.getSetCookie()
    } catch {
      /* noop */
    }
    const raw = res.headers.get('set-cookie')
    return raw ? [raw] : []
  }

  const PASS_HEADERS = [
    'accept',
    'accept-language',
    'content-type',
    'referer',
    'origin',
    'x-requested-with'
  ]

  async function handle(req, res) {
    try {
      const parsed = new URL(req.url, 'http://localhost')
      // 清除服务端会话 jar（前端退出登录时调用）
      if (parsed.pathname === '/gqb/__session/reset') {
        jar.clear()
        res.statusCode = 200
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ ok: true }))
        return
      }
      const targetPath = parsed.pathname.replace(/^\/gqb/, '') + parsed.search
      let curUrl = GQB_ORIGIN + (targetPath || '')

      const chunks = []
      for await (const c of req) chunks.push(c)
      let body = Buffer.concat(chunks)
      let method = (req.method || 'GET').toUpperCase()

      // 关键：不要转发客户端的 referer/origin/x-requested-with，统一用 gequbao 自己的。
      // 否则 Laravel 在登录校验失败时会把 302 重定向回这些跨域头所指的 dev server 地址
      // （例如 http://192.168.1.2:5173/），代理就会误判成 502 / “未到达 gequbao”。
      const baseHeaders = {}
      for (const k of PASS_HEADERS) {
        if (k === 'referer' || k === 'origin') continue
        if (k === 'x-requested-with') {
          // Android WebView 会自动注入 X-Requested-With: <包名>，转发给站点会破坏登录；
          // 只透传前端显式声明的 AJAX 标记（改密等接口依赖它）。
          if (String(req.headers[k] || '').toLowerCase() === 'xmlhttprequest') {
            baseHeaders[k] = 'XMLHttpRequest'
          }
          continue
        }
        if (req.headers[k]) baseHeaders[k] = req.headers[k]
      }
      baseHeaders['user-agent'] = PROXY_UA
      baseHeaders['referer'] = GQB_ORIGIN + '/'
      baseHeaders['origin'] = GQB_ORIGIN
      if (!baseHeaders['accept']) baseHeaders['accept'] = '*/*'
      if (!baseHeaders['accept-language'])
        baseHeaders['accept-language'] = 'zh-CN,zh;q=0.9,en;q=0.8'

      let redirects = 0
      let upstream
      // 手动跟随重定向：每一跳都抓 Set-Cookie 收进 jar，直到非 3xx
      while (true) {
        const h = { ...baseHeaders }
        if (method === 'GET' || method === 'HEAD') delete h['content-type']
        const ck = cookieHeader()
        if (ck) h.cookie = ck

        upstream = await fetch(curUrl, {
          method,
          headers: h,
          body: method === 'GET' || method === 'HEAD' ? undefined : body,
          redirect: 'manual'
        })
        storeCookies(getSetCookies(upstream))

        const status = upstream.status
        if (status >= 300 && status < 400 && redirects < 8) {
          const loc = upstream.headers.get('location')
          if (loc) {
            curUrl = new URL(loc, curUrl).href
            // 301/302/303 之后改 GET（并丢弃原请求体）；307/308 保留方法
            if (status === 301 || status === 302 || status === 303) {
              method = 'GET'
              body = Buffer.alloc(0)
            }
            redirects++
            continue
          }
        }
        break
      }

      const buf = Buffer.from(await upstream.arrayBuffer())
      const ct = upstream.headers.get('content-type') || 'application/octet-stream'
      res.statusCode = upstream.status
      res.setHeader('content-type', ct)
      // 兜底：最终落点必须仍是 gequbao；否则说明请求被异常吞成 SPA 首页，明确报错而非误导成「密码错」
      try {
        if (!/(^|\.)gequbao\.com$/.test(new URL(curUrl).hostname)) {
          res.statusCode = 502
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ error: 'proxy finalUrl 异常: ' + curUrl }))
          return
        }
      } catch {
        res.statusCode = 502
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ error: 'proxy finalUrl 解析失败: ' + curUrl }))
        return
      }
      // 把最终落点回传前端，供登录成败判定使用
      res.setHeader('x-gqb-final-url', curUrl)
      res.setHeader('x-gqb-redirected', redirects > 0 ? '1' : '0')
      // 把服务端 jar 的最终 cookie 回传前端，便于本地持久化（dev server 重启后仍可恢复会话）
      res.setHeader('x-gqb-cookies', cookieHeader())
      res.setHeader(
        'access-control-expose-headers',
        'x-gqb-final-url,x-gqb-redirected,x-gqb-cookies'
      )
      res.end(buf)
    } catch (e) {
      res.statusCode = 502
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ error: String((e && e.message) || e) }))
    }
  }

  function attach(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url && /^\/gqb(\/|$|\?)/.test(req.url)) return handle(req, res)
      next()
    })
  }

  return {
    name: 'gequbao-proxy',
    configureServer: attach,
    configurePreviewServer: attach
  }
}

// base 必须为相对路径，Capacitor Android 以 file:// 方式加载 dist 资源
export default defineConfig({
  base: './',
  plugins: [vue(), gequbaoProxy()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  optimizeDeps: {
    // 只扫描根目录入口，避免 dev server 把 cap sync 同步进 android/ 的已构建产物当成源码扫描而报错
    entries: ['index.html']
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    target: 'es2018', // 兼容 Android WebView（避免 :has / container query 等过新语法）
    chunkSizeWarningLimit: 2000
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // 不监听 android/ 同步产物，避免 cap sync 后误触发整页刷新与无关日志
    watch: {
      ignored: ['**/android/**']
    }
    // /gqb 代理由上面的 gequbaoProxy() 插件接管（Node 侧维护 cookie + 手动跟随重定向）
  }
})
