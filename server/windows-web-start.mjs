import { randomBytes } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const bundleRoot = resolve(appRoot, '..')
const runtimeRoot = resolve(process.env.WINDOWS_WEB_RUNTIME_DIR || join(bundleRoot, 'runtime'))
const dataRoot = join(runtimeRoot, 'data')
const stateFile = join(runtimeRoot, 'server-state.json')
const pidFile = join(runtimeRoot, 'server.pid')
const urlFile = join(runtimeRoot, 'server.url')
const launchReadyFile = join(runtimeRoot, 'launch-ready.url')
const stopTokenFile = join(runtimeRoot, 'server.stop-token')
const logFile = join(runtimeRoot, 'server.log')
const errorFile = join(runtimeRoot, 'startup-error.txt')
const noBrowser = process.env.WINDOWS_WEB_NO_BROWSER === '1'

mkdirSync(dataRoot, { recursive: true })

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`
  console.log(line)
  appendFileSync(logFile, `${line}\n`, 'utf8')
}

function running(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function healthy(url) {
  try {
    const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1200) })
    const body = await response.json()
    return response.ok && body?.mode === 'competition-offline'
  } catch {
    return false
  }
}

async function waitUntilServing(url, attempts = 30) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await healthy(url)) return true
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100))
  }
  return false
}

function browserCandidates() {
  const roots = [
    process.env['ProgramFiles(x86)'],
    process.env['PROGRAMFILES(X86)'],
    process.env.ProgramFiles,
    process.env.PROGRAMFILES,
    process.env.LOCALAPPDATA,
  ].filter(Boolean)
  const relative = [
    ['Microsoft', 'Edge', 'Application', 'msedge.exe'],
    ['Google', 'Chrome', 'Application', 'chrome.exe'],
  ]
  return roots.flatMap((base) => relative.map((parts) => join(base, ...parts)))
}

function openBrowser(url) {
  if (noBrowser) return
  const browser = browserCandidates().find(existsSync)
  if (browser) {
    const child = spawn(browser, [
      url,
      '--new-window',
      '--start-maximized',
      '--no-first-run',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
    ], { detached: true, stdio: 'ignore', windowsHide: true })
    child.unref()
    return
  }
  if (process.platform === 'win32') {
    const child = spawn('cmd.exe', ['/d', '/s', '/c', 'start', '', url], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.unref()
    return
  }
  log(`未自动打开浏览器，请手动访问：${url}`)
}

async function useExistingInstance() {
  if (!existsSync(stateFile)) return false
  try {
    const state = JSON.parse(readFileSync(stateFile, 'utf8'))
    if (running(Number(state.pid)) && await healthy(String(state.baseUrl || ''))) {
      log(`系统已在运行，重新打开页面：${state.pageUrl}`)
      writeFileSync(launchReadyFile, `${state.pageUrl}\n`, 'utf8')
      openBrowser(state.pageUrl)
      return true
    }
  } catch {
    // Stale or partially-written state is replaced below.
  }
  for (const file of [stateFile, pidFile, urlFile, launchReadyFile, stopTokenFile]) rmSync(file, { force: true })
  return false
}

if (await useExistingInstance()) process.exit(0)

process.env.OFFLINE_MODE = '1'
process.env.HOST = '127.0.0.1'
process.env.DATABASE_PATH = join(dataRoot, 'tihua.db')
process.env.MIMO_PROXY_URL ||= 'https://tihua-trace.onrender.com'
process.env.OFFLINE_MODEL_DIR ||= join(bundleRoot, 'models', 'offline')
process.env.SESSION_SECRET ||= randomBytes(32).toString('hex')

let server
let stopping = false

function removeOwnState() {
  try {
    if (String(readFileSync(pidFile, 'utf8')).trim() !== String(process.pid)) return
  } catch {
    return
  }
  for (const file of [stateFile, pidFile, urlFile, launchReadyFile, stopTokenFile]) rmSync(file, { force: true })
}

async function shutdown(signal) {
  if (stopping) return
  stopping = true
  log(`收到 ${signal}，正在安全关闭。`)
  removeOwnState()
  try {
    await server?.close()
  } finally {
    process.exit(0)
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => void shutdown(signal))
process.on('exit', removeOwnState)

try {
  const { buildApp } = await import('./app.js')
  server = await buildApp()
  const stopToken = randomBytes(24).toString('hex')
  server.post('/api/local/shutdown', async (request, reply) => {
    if (request.headers['x-local-stop-token'] !== stopToken) {
      return reply.code(403).send({ ok: false })
    }
    reply.send({ ok: true })
    setTimeout(() => void shutdown('本地停止指令'), 100)
  })
  const requestedPort = Number(process.env.WINDOWS_WEB_PORT || 0)
  const baseUrl = await server.listen({ port: requestedPort, host: '127.0.0.1' })
  if (!await waitUntilServing(baseUrl)) {
    throw new Error(`Local HTTP health check did not become ready: ${baseUrl}`)
  }
  const pageUrl = `${baseUrl}/?offline=1#/stage`
  const state = {
    pid: process.pid,
    baseUrl,
    pageUrl,
    startedAt: new Date().toISOString(),
    mode: 'competition-offline',
  }
  writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  writeFileSync(pidFile, `${process.pid}\n`, 'utf8')
  writeFileSync(urlFile, `${pageUrl}\n`, 'utf8')
  writeFileSync(launchReadyFile, `${pageUrl}\n`, 'utf8')
  writeFileSync(stopTokenFile, `${stopToken}\n`, { encoding: 'utf8', mode: 0o600 })
  rmSync(errorFile, { force: true })
  log(`Windows 本地 Web 版已启动：${pageUrl}`)
  log('语音输出：联网时使用 MiMo，断网或超时时使用浏览器 speechSynthesis。')
  openBrowser(pageUrl)
} catch (error) {
  const message = String(error?.stack || error?.message || error)
  rmSync(launchReadyFile, { force: true })
  writeFileSync(errorFile, `${message}\n`, 'utf8')
  log(`启动失败：${message}`)
  process.exit(1)
}
