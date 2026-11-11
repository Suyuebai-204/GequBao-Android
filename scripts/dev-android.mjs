// 一键真机 Live Reload 调试：自动配置 -> 起 Vite -> 建 adb reverse -> 装 debug 包 -> 启动 App。
// 之前的 dev-android.cmd 只做 cap sync + 起 Vite，从未把带 server 配置的 APK 装到设备上，
// 且 adb reverse 失败被静默吞掉，所以配置改来改去仍然连接超时。
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'
import { setServerMode, DEV_SERVER, DEV_PORT, DEBUG_PACKAGE } from './cap-server.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const ANDROID_DIR = resolve(ROOT, 'android')

const IS_WIN = process.platform === 'win32'

// Windows 下 .cmd/.bat 必须经 cmd.exe；显式 /c 避免 spawn 的 shell:true 参数拼接警告
function commandLine(cmd, args) {
  const line = [cmd, ...args].join(' ')
  return IS_WIN ? { command: 'cmd.exe', args: ['/c', line] } : { command: cmd, args }
}

function run(cmd, args, opts = {}) {
  const { command, args: realArgs } = commandLine(cmd, args)
  const r = spawnSync(command, realArgs, { stdio: 'inherit', ...opts })
  if (r.error) throw r.error
  if (r.status !== 0) throw new Error(`命令失败: ${cmd} ${args.join(' ')} (exit ${r.status})`)
  return r
}

function capture(cmd, args) {
  const { command, args: realArgs } = commandLine(cmd, args)
  const r = spawnSync(command, realArgs, { encoding: 'utf8' })
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') }
}

function findDevice() {
  const r = capture('adb', ['devices'])
  const lines = r.out.split(/\r?\n/).slice(1).map((s) => s.trim()).filter(Boolean)
  const devices = lines.filter((l) => /\tdevice$/.test(l)).map((l) => l.split(/\s+/)[0])
  if (!devices.length) {
    const bad = lines.filter((l) => /\t(unauthorized|offline)/.test(l))
    throw new Error(
      `没有可用的 adb 设备${bad.length ? `（${bad.join(', ')}）` : ''}。请连接 USB 并在手机上允许 USB 调试。`
    )
  }
  return devices[0]
}

function ensureReverse() {
  // 设备重连 / adb server 重启后旧映射会失效，先清再建
  capture('adb', ['reverse', '--remove', `tcp:${DEV_PORT}`])
  const r = capture('adb', ['reverse', `tcp:${DEV_PORT}`, `tcp:${DEV_PORT}`])
  if (r.status !== 0 || !/tcp:5173/.test(capture('adb', ['reverse', '--list']).out)) {
    throw new Error(`adb reverse 建立失败: ${r.out.trim()}`)
  }
}

function pingVite() {
  return new Promise((done) => {
    const req = http.get(`http://127.0.0.1:${DEV_PORT}/`, (res) => {
      res.resume()
      done(res.statusCode === 200)
    })
    req.setTimeout(1000, () => { req.destroy(); done(false) })
    req.on('error', () => done(false))
  })
}

async function waitVite() {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    if (await pingVite()) return
    if (!vite || vite.exitCode != null) throw new Error('Vite dev server 提前退出，请检查端口 5173 是否被占用')
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error('Vite dev server 30 秒内未就绪')
}

let vite = null
let restored = false
let reusedVite = false

function cleanup() {
  if (!restored) {
    try { setServerMode('release') } catch { /* noop */ }
    restored = true
  }
}

process.on('SIGINT', () => {
  console.log(reusedVite ? '\n[dev] 结束调试（外部 Vite 保持运行）...' : '\n[dev] 结束调试，关闭 Vite...')
  cleanup()
  if (vite?.pid && IS_WIN) {
    spawnSync('taskkill.exe', ['/PID', String(vite.pid), '/T', '/F'], { stdio: 'ignore' })
  }
  process.exit(0)
})

async function main() {
  const device = findDevice()
  console.log(`[dev] 设备: ${device}`)

  if (!existsSync(resolve(ROOT, 'dist', 'index.html'))) {
    console.log('[dev] dist 不存在，先构建一次（仅作为 cap sync 的占位资源）...')
    run('npm', ['run', 'build'], { cwd: ROOT })
  }

  setServerMode('dev')
  try {
    // 1. Vite 必须先就绪，否则 App 一启动就会连接超时。
    // 端口已有服务在跑时复用它，避免 Vite(strictPort) 启动失败却被误判为就绪。
    reusedVite = await pingVite()
    if (reusedVite) {
      console.log(`[dev] 复用已运行的 Vite: ${DEV_SERVER.url}（由原窗口管理）`)
    } else {
      const { command, args } = commandLine('npm', ['run', 'dev'])
      vite = spawn(command, args, { cwd: ROOT, stdio: 'inherit' })
      await waitVite()
      console.log(`[dev] Vite 已就绪: ${DEV_SERVER.url}`)
    }

    // 2. 建立并校验反向代理，失败直接报错而不是静默跳过
    ensureReverse()
    console.log(`[dev] adb reverse tcp:${DEV_PORT} 已建立`)

    // 3. 把带 server 的配置同步进 android/app/src/main/assets
    run('npx', ['cap', 'sync', 'android'], { cwd: ROOT })

    // 4. 立刻还原源码配置为发布态（assets 已同步，不影响本次构建）
    setServerMode('release')
    restored = true

    // 5. 安装 debug 包：build.gradle 里 debug 带 .debug 后缀，与正式包共存、不会签名冲突
    // 不覆盖 JAVA_HOME：AGP 的 jlink 转换与 JDK 26 不兼容，
    // 必须沿用系统默认的 Android Studio JBR（JDK 21）。
    console.log('[dev] 构建并安装 debug 包（首次较慢，之后为增量构建）...')
    run('gradlew.bat', ['installDebug'], { cwd: ANDROID_DIR })

    // 6. 启动 App（monkey 不需要猜 activity 类名）
    const launched = capture('adb', [
      'shell', 'monkey', '-p', DEBUG_PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1'
    ])
    if (launched.status !== 0 || /No activities found|Error type/i.test(launched.out)) {
      throw new Error(`启动 App 失败: ${launched.out.trim()}`)
    }

    console.log('')
    console.log('[dev] 调试已就绪：')
    console.log(`      页面来源 ${DEV_SERVER.url}（改动源码即热更新）`)
    console.log(`      设备包名 ${DEBUG_PACKAGE}，与正式包互不影响`)
    console.log(reusedVite
      ? '      结束调试请自行关闭那个 Vite 窗口'
      : '      按 Ctrl+C 结束（会自动关闭 Vite 并还原配置）')
  } finally {
    cleanup()
  }
}

main().catch((e) => {
  cleanup()
  console.error(`\n[dev] 失败: ${e.message}`)
  if (vite?.pid && IS_WIN) {
    spawnSync('taskkill.exe', ['/PID', String(vite.pid), '/T', '/F'], { stdio: 'ignore' })
  }
  process.exit(1)
})
