import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const bundleRoot = resolve(appRoot, '..')
const runtimeRoot = resolve(process.env.WINDOWS_WEB_RUNTIME_DIR || join(bundleRoot, 'runtime'))
const stateFile = join(runtimeRoot, 'server-state.json')
const tokenFile = join(runtimeRoot, 'server.stop-token')

if (!existsSync(stateFile) || !existsSync(tokenFile)) {
  console.log('本地服务当前未运行。')
  process.exit(0)
}

try {
  const state = JSON.parse(readFileSync(stateFile, 'utf8'))
  const token = readFileSync(tokenFile, 'utf8').trim()
  const response = await fetch(`${state.baseUrl}/api/local/shutdown`, {
    method: 'POST',
    headers: { 'x-local-stop-token': token },
    signal: AbortSignal.timeout(3000),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  console.log('本地服务已安全停止。')
} catch (error) {
  console.error(`无法安全停止本地服务：${String(error?.message || error)}`)
  console.error('请关闭名为“替抗蓟化本地服务”的最小化窗口。')
  process.exit(1)
}
