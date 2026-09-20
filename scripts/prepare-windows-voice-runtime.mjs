import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = resolve(import.meta.dirname, '..')
const packageName = 'sherpa-onnx-win-x64'
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const version = String(manifest.optionalDependencies?.[packageName] || '').replace(/^[^0-9]*/, '')
if (!version) throw new Error(`${packageName} 未在 optionalDependencies 中固定版本。`)
const target = resolve(root, 'node_modules', packageName)
const addon = resolve(target, 'sherpa-onnx.node')

if (existsSync(addon)) {
  console.log(`Windows 离线语音运行库已就绪：${packageName}@${version}`)
  process.exit(0)
}

const packed = spawnSync('npm', ['pack', `${packageName}@${version}`, '--silent'], {
  cwd: root,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
})

if (packed.status !== 0) process.exit(packed.status || 1)

const archiveName = packed.stdout.trim().split(/\r?\n/).at(-1)
const archive = resolve(root, archiveName)
mkdirSync(target, { recursive: true })

const extracted = spawnSync('tar', ['-xzf', archive, '-C', target, '--strip-components=1'], {
  cwd: root,
  stdio: 'inherit',
})
rmSync(archive, { force: true })

if (extracted.status !== 0 || !existsSync(addon)) {
  console.error('Windows 离线语音运行库准备失败。')
  process.exit(extracted.status || 1)
}

console.log(`Windows 离线语音运行库已安装：${packageName}@${version}`)
