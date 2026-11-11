// dev / release 两种模式的 capacitor.config.json 切换。
// 源码始终保持「发布态」（无 server 段），任何方式打包默认都是离线正式包；
// 只有 dev-android 会临时写入 server 段，cap sync 之后立即还原，不需要手工编辑配置。
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CONFIG = resolve(ROOT, 'capacitor.config.json')

// 127.0.0.1 明确指向设备回环地址，配合 adb reverse 映射到电脑的 Vite dev server。
// 不写 localhost，避免个别设备优先解析 ::1 而反向代理只监听 IPv4 时连接超时。
export const DEV_SERVER = {
  androidScheme: 'http',
  url: 'http://127.0.0.1:5173',
  cleartext: true
}

export const DEV_PORT = 5173
export const DEBUG_PACKAGE = 'com.yygzs.gqbs.debug'

export function setServerMode(mode) {
  const cfg = JSON.parse(readFileSync(CONFIG, 'utf8'))
  const out = {}
  for (const [key, value] of Object.entries(cfg)) {
    if (key === 'server') continue
    out[key] = value
    // 固定放在 webDir 之后，反复切换也不会让文件 key 顺序漂移
    if (key === 'webDir' && mode === 'dev') out.server = { ...DEV_SERVER }
  }
  writeFileSync(CONFIG, JSON.stringify(out, null, 2) + '\n')
  return out.server?.url || null
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const mode = process.argv[2]
  if (mode !== 'dev' && mode !== 'release') {
    console.error('用法: node scripts/cap-server.mjs dev|release')
    process.exit(1)
  }
  const url = setServerMode(mode)
  console.log(`[cap-server] ${mode}: ${url || '离线正式包（无 server）'}`)
}
