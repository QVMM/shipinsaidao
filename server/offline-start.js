import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const indexFile = resolve(root, 'dist/index.html')

if (!existsSync(indexFile)) {
  console.error('尚未找到离线前端。请在有依赖的环境先运行：npm run build')
  process.exit(1)
}

process.env.OFFLINE_MODE = '1'
// 只用于本次本机进程签发 cookie；无需联网或提前创建 .env。
if (!String(process.env.SESSION_SECRET || '').trim()) {
  process.env.SESSION_SECRET = randomBytes(32).toString('hex')
}
await import('./index.js')
