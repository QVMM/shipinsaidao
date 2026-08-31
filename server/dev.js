import { spawn } from 'node:child_process'
import { loadEnv } from './env.js'

loadEnv()
process.env.PORT = process.env.PORT || '8787'
process.env.HOST = process.env.HOST || '0.0.0.0'

const api = spawn(process.execPath, ['--watch', 'server/index.js'], {
  stdio: 'inherit',
  env: process.env,
})

const viteBin = new URL('../node_modules/vite/bin/vite.js', import.meta.url)
const web = spawn(process.execPath, [viteBin.pathname, '--host', '0.0.0.0', '--port', '5173'], {
  stdio: 'inherit',
  env: process.env,
})

function shutdown(code) {
  api.kill('SIGTERM')
  web.kill('SIGTERM')
  process.exit(code ?? 0)
}

api.on('exit', (c) => shutdown(c))
web.on('exit', (c) => shutdown(c))
process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
