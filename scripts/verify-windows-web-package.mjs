import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'

const root = resolve(import.meta.dirname, '..')
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const packageName = `替抗蓟化-Windows本地Web版-${manifest.version}-universal`
const release = resolve(root, 'release')
const bundle = resolve(release, packageName)
const zipFile = resolve(release, `${packageName}.zip`)

const required = [
  '00-首次使用-安装并启动.bat',
  'create-shortcuts.ps1',
  'start-local-service.ps1',
  'start-system.bat',
  'open-system-page.bat',
  'stop-system.bat',
  'diagnose-startup.bat',
  '使用说明.txt',
  'runtime/node.exe',
  'runtime/node-arm64.exe',
  'runtime/voice-arm64/sherpa-onnx-offline.exe',
  'app/dist/index.html',
  'app/server/windows-web-start.mjs',
  'app/server/windows-web-stop.mjs',
  'app/server/windows-voice-cli.js',
  'app/server/sqlite.js',
  'app/node_modules/sherpa-onnx-node/addon.js',
  'app/node_modules/sherpa-onnx-win-x64/sherpa-onnx.node',
  'app/node_modules/sherpa-onnx-win-x64/onnxruntime.dll',
  'models/offline/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17/model.int8.onnx',
]

const missing = required.filter((file) => !existsSync(resolve(bundle, file)))
if (!existsSync(zipFile)) missing.push(`${packageName}.zip`)
if (missing.length) {
  console.error('Windows 本地 Web 交付包缺少文件：')
  for (const item of missing) console.error(`- ${item}`)
  process.exit(1)
}

function peMachine(file) {
  const bytes = readFileSync(file)
  if (bytes[0] !== 0x4d || bytes[1] !== 0x5a) return null
  const peOffset = bytes.readUInt32LE(0x3c)
  if (bytes.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0') return null
  return bytes.readUInt16LE(peOffset + 4)
}

for (const [label, file] of [
  ['Windows Node.js', resolve(bundle, 'runtime/node.exe')],
  ['Windows 离线语音引擎', resolve(bundle, 'app/node_modules/sherpa-onnx-win-x64/sherpa-onnx.node')],
]) {
  if (peMachine(file) !== 0x8664) throw new Error(`${label} 不是 Windows x64 文件。`)
}
for (const [label, file] of [
  ['Windows ARM64 Node.js', resolve(bundle, 'runtime/node-arm64.exe')],
  ['Windows ARM64 语音识别引擎', resolve(bundle, 'runtime/voice-arm64/sherpa-onnx-offline.exe')],
]) {
  if (peMachine(file) !== 0xaa64) throw new Error(`${label} 不是 Windows ARM64 文件。`)
}

const forbiddenPlatforms = ['sherpa-onnx-darwin-arm64', 'sherpa-onnx-darwin-x64', 'sherpa-onnx-linux-x64', 'sherpa-onnx-win-ia32']
for (const name of forbiddenPlatforms) {
  if (existsSync(resolve(bundle, 'app/node_modules', name))) throw new Error(`交付包混入无关运行库：${name}`)
}
if (existsSync(resolve(bundle, 'app/node_modules/.bin'))) throw new Error('交付包包含不兼容 Windows 的 POSIX 命令链接。')

const executableScripts = readdirSync(bundle).filter((name) => name.endsWith('.bat') || name.endsWith('.ps1'))
for (const name of executableScripts) {
  const bytes = readFileSync(resolve(bundle, name))
  const nonAscii = bytes.findIndex((byte) => byte > 0x7f)
  if (nonAscii !== -1) throw new Error('Windows 执行脚本含非 ASCII 字节：' + name + ' @ ' + nonAscii)
  if (name.endsWith('.bat') && /(^|[^\r])\n/.test(bytes.toString('ascii'))) {
    throw new Error('Windows 批处理文件不是 CRLF 换行：' + name)
  }
}

const firstRunScript = readFileSync(resolve(bundle, '00-首次使用-安装并启动.bat'), 'ascii')
const shortcutScript = readFileSync(resolve(bundle, 'create-shortcuts.ps1'), 'ascii')
for (const expected of ['create-shortcuts.ps1', 'start-local-service.ps1', 'start-system.bat', 'runtime\\node.exe', 'node-arm64.exe', 'model.int8.onnx']) {
  if (!firstRunScript.includes(expected)) throw new Error(`首次使用入口缺少关键步骤：${expected}`)
}
for (const expected of ['\\u6253\\u5f00\\u66ff\\u6297\\u84df\\u5316\\u7f51\\u9875', '\\u5173\\u95ed\\u66ff\\u6297\\u84df\\u5316\\u7cfb\\u7edf', 'start-system.bat', 'stop-system.bat']) {
  if (!shortcutScript.includes(expected)) throw new Error(`桌面快捷方式脚本缺少：${expected}`)
}

async function stagedWebSmoke() {
  const runtime = mkdtempSync(join(tmpdir(), 'tihua-web-smoke-'))
  const launcher = resolve(bundle, 'app/server/windows-web-start.mjs')
  const child = spawn(process.execPath, [launcher], {
    cwd: bundle,
    env: {
      ...process.env,
      OFFLINE_VOICE_FAKE: '1',
      OFFLINE_VOICE_FAKE_TEXT: '这批鸡安全吗？',
      WINDOWS_WEB_NO_BROWSER: '1',
      WINDOWS_WEB_RUNTIME_DIR: runtime,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk })
  child.stderr.on('data', (chunk) => { output += chunk })
  const stateFile = resolve(runtime, 'server-state.json')
  const launchReadyFile = resolve(runtime, 'launch-ready.url')
  const commonEnv = {
    ...process.env,
    OFFLINE_VOICE_FAKE: '1',
    OFFLINE_VOICE_FAKE_TEXT: '这批鸡安全吗？',
    WINDOWS_WEB_NO_BROWSER: '1',
    WINDOWS_WEB_RUNTIME_DIR: runtime,
  }
  const runToExit = (file, timeoutMs = 5000) => new Promise((resolvePromise, reject) => {
    const processToRun = spawn(process.execPath, [file], {
      cwd: bundle,
      env: commonEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let text = ''
    processToRun.stdout.on('data', (chunk) => { text += chunk })
    processToRun.stderr.on('data', (chunk) => { text += chunk })
    const timer = setTimeout(() => {
      processToRun.kill('SIGTERM')
      reject(new Error(`子进程执行超时：${file}\n${text}`))
    }, timeoutMs)
    processToRun.once('exit', (code) => {
      clearTimeout(timer)
      if (code === 0) resolvePromise(text)
      else reject(new Error(`子进程执行失败（${code}）：${file}\n${text}`))
    })
  })
  try {
    const deadline = Date.now() + 15_000
    while (!existsSync(stateFile) && Date.now() < deadline) {
      if (child.exitCode != null) throw new Error(`本地 Web 冒烟启动提前退出：\n${output}`)
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100))
    }
    if (!existsSync(stateFile)) throw new Error(`本地 Web 冒烟启动超时：\n${output}`)
    const state = JSON.parse(readFileSync(stateFile, 'utf8'))
    if (!existsSync(launchReadyFile) || readFileSync(launchReadyFile, 'utf8').trim() !== state.pageUrl) {
      throw new Error('Windows 启动入口没有收到可打开的就绪网址。')
    }
    const [healthResponse, pageResponse] = await Promise.all([
      fetch(`${state.baseUrl}/api/health`),
      fetch(`${state.baseUrl}/?offline=1#/stage`),
    ])
    const health = await healthResponse.json()
    const html = await pageResponse.text()
    if (!healthResponse.ok || health.mode !== 'competition-offline' || health.networkRequired !== false) {
      throw new Error(`本地 Web 健康检查失败：${JSON.stringify(health)}`)
    }
    if (!pageResponse.ok || !html.includes('<div id="app">')) throw new Error('本地 Web 页面未正确提供。')

    const firstState = JSON.parse(readFileSync(stateFile, 'utf8'))
    const duplicateOutput = await runToExit(launcher)
    const secondState = JSON.parse(readFileSync(stateFile, 'utf8'))
    if (secondState.pid !== firstState.pid || !duplicateOutput.includes('系统已在运行')) {
      throw new Error('重复启动未复用现有本地服务。')
    }

    const stopOutput = await runToExit(resolve(bundle, 'app/server/windows-web-stop.mjs'))
    if (!stopOutput.includes('已安全停止')) throw new Error(`安全停止没有成功：${stopOutput}`)
    const shutdownDeadline = Date.now() + 5000
    while (child.exitCode == null && Date.now() < shutdownDeadline) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100))
    }
    if (child.exitCode == null || existsSync(stateFile) || existsSync(launchReadyFile)) {
      throw new Error('本地服务未在停止指令后完整退出。')
    }

    return {
      health,
      pageBytes: Buffer.byteLength(html),
      duplicateStartReusedService: true,
      browserReadySignal: true,
      gracefulShutdown: true,
    }
  } finally {
    if (child.exitCode == null) child.kill('SIGTERM')
    await new Promise((resolvePromise) => {
      if (child.exitCode != null) resolvePromise()
      else child.once('exit', resolvePromise)
      setTimeout(resolvePromise, 3000)
    })
    rmSync(runtime, { recursive: true, force: true })
  }
}

const smoke = await stagedWebSmoke()
const sha256 = createHash('sha256').update(readFileSync(zipFile)).digest('hex')
const mb = (file) => (statSync(file).size / 1024 / 1024).toFixed(1)

console.log(JSON.stringify({
  ok: true,
  platform: 'Windows 10/11 x64 + ARM64 browser',
  firstUse: '全部解压后双击 00-首次使用-安装并启动.bat',
  dailyLaunch: '双击桌面上的“打开替抗蓟化网页”',
  host: '127.0.0.1 only',
  nodeRuntime: 'Windows x64 + ARM64 已内置并自动选择',
  voiceRuntime: '本地识别 x64 + ARM64 已内置；输出为 MiMo + 浏览器声音自动降级',
  offlineModels: 'SenseVoice ASR',
  stagedSmoke: smoke,
  zipSize: `${mb(zipFile)} MB`,
  zipSha256: sha256,
  networkRequiredAtRuntime: false,
}, null, 2))
