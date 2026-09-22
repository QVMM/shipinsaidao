import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')
const windowsPackaging = resolve(root, 'packaging/windows-web')

test('Windows 执行脚本不含会被 cmd 或 Windows PowerShell 5.1 误解码的非 ASCII 内容', () => {
  const executableScripts = readdirSync(windowsPackaging)
    .filter((name) => name.endsWith('.bat') || name.endsWith('.ps1'))

  for (const name of executableScripts) {
    const bytes = readFileSync(resolve(windowsPackaging, name))
    const firstNonAscii = bytes.findIndex((byte) => byte > 0x7f)
    assert.equal(firstNonAscii, -1, `${name} 在字节 ${firstNonAscii} 含非 ASCII 内容`)
  }
})

test('Windows 首次使用入口先校验文件，再创建桌面图标并启动', () => {
  const script = readFileSync(resolve(root, 'packaging/windows-web/00-首次使用-安装并启动.bat'), 'utf8')
  const checkIndex = script.indexOf('runtime\\node.exe')
  const shortcutIndex = script.indexOf('create-shortcuts.ps1')
  const startIndex = script.indexOf('start-system.bat')

  assert.ok(checkIndex >= 0)
  assert.ok(shortcutIndex > checkIndex)
  assert.ok(startIndex > shortcutIndex)
  assert.match(script, /model\.int8\.onnx/)
})

test('桌面快捷方式直接采用脚本目录，中文目录和末尾反斜杠不会损坏路径', () => {
  const firstRun = readFileSync(resolve(root, 'packaging/windows-web/00-首次使用-安装并启动.bat'), 'utf8')
  const shortcuts = readFileSync(resolve(root, 'packaging/windows-web/create-shortcuts.ps1'), 'utf8')

  assert.doesNotMatch(firstRun, /-InstallRoot/)
  assert.doesNotMatch(shortcuts, /\$InstallRoot/)
  assert.match(shortcuts, /\$root = \$PSScriptRoot/)
})

test('Windows 桌面只创建日常启动和安全关闭两个入口', () => {
  const script = readFileSync(resolve(root, 'packaging/windows-web/create-shortcuts.ps1'), 'utf8')

  assert.match(script, /Remove-Item -LiteralPath \$legacyShortcut/)
  assert.match(script, /New-SystemShortcut -Name \$startName -BatchFile 'start-system\.bat'/)
  assert.match(script, /New-SystemShortcut -Name \$stopName -BatchFile 'stop-system\.bat'/)
  assert.equal((script.match(/New-SystemShortcut -Name/g) ?? []).length, 2)
})

test('Windows 本地 Web 版使用普通浏览器窗口而不是应用模式', () => {
  const launcher = readFileSync(resolve(root, 'server/windows-web-start.mjs'), 'utf8')

  assert.doesNotMatch(launcher, /--app=/)
  assert.match(launcher, /--new-window/)
})

test('Windows 启动入口等待服务真正就绪，失败时直接显示真实错误', () => {
  const start = readFileSync(resolve(root, 'packaging/windows-web/start-system.bat'), 'utf8')
  const launcher = readFileSync(resolve(root, 'server/windows-web-start.mjs'), 'utf8')

  assert.match(start, /launch-ready\.url/)
  assert.match(start, /for \/l %%I in \(1,1,120\)/)
  assert.match(start, /if exist "runtime\\startup-error\.txt" goto :start_failed/)
  assert.match(start, /type "runtime\\startup-error\.txt"/)
  assert.match(start, /start "" "%SYSTEM_URL%"/)
  assert.doesNotMatch(start, /timeout \/t 4/)
  assert.match(launcher, /launch-ready\.url/)
})

test('Windows Web 启动不再加载本地语音合成模型', () => {
  const launcher = readFileSync(resolve(root, 'server/windows-web-start.mjs'), 'utf8')

  assert.doesNotMatch(launcher, /await warmOfflineVoice\(/)
  assert.doesNotMatch(launcher, /warmOfflineVoiceIsolated/)
  assert.match(launcher, /speechSynthesis/)
  assert.match(launcher, /MIMO_PROXY_URL/)
  assert.match(launcher, /https:\/\/tihua-trace\.onrender\.com/)
})

test('Windows 后台服务使用可验证的 Start-Process，不再依赖 cmd start 解析', () => {
  const start = readFileSync(resolve(root, 'packaging/windows-web/start-system.bat'), 'utf8')
  const processLauncher = readFileSync(resolve(root, 'packaging/windows-web/start-local-service.ps1'), 'utf8')

  assert.doesNotMatch(start, /start "TihuaLocalService"/)
  assert.match(start, /start-local-service\.ps1/)
  assert.match(processLauncher, /Start-Process/)
  assert.match(processLauncher, /-WorkingDirectory \$root/)
  assert.match(processLauncher, /-RedirectStandardOutput \$stdout/)
  assert.match(processLauncher, /-RedirectStandardError \$stderr/)
  assert.match(processLauncher, /-PassThru/)
})

test('Windows Web 包自动选择 x64 或 ARM64 原生运行时', () => {
  const launcher = readFileSync(resolve(root, 'packaging/windows-web/start-local-service.ps1'), 'utf8')
  const stop = readFileSync(resolve(root, 'packaging/windows-web/stop-system.bat'), 'utf8')
  const build = readFileSync(resolve(root, 'scripts/build-windows-web.mjs'), 'utf8')

  assert.match(launcher, /PROCESSOR_ARCHITECTURE/)
  assert.match(launcher, /node-arm64\.exe/)
  assert.match(launcher, /voice-arm64/)
  assert.match(stop, /node-arm64\.exe/)
  assert.match(build, /node-v\$\{nodeVersion\}-win-arm64\.zip/)
  assert.doesNotMatch(build, /sherpa-onnx-offline-tts\.exe/)
  assert.match(build, /sherpa-onnx-offline\.exe/)
})

test('Windows 页面只在本地健康检查成功后才通知浏览器打开', () => {
  const launcher = readFileSync(resolve(root, 'server/windows-web-start.mjs'), 'utf8')
  const healthIndex = launcher.indexOf('waitUntilServing')
  const readyIndex = launcher.indexOf('writeFileSync(launchReadyFile')

  assert.ok(healthIndex >= 0)
  assert.ok(readyIndex > healthIndex)
})
