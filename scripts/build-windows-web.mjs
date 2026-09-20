import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { cp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { Readable } from 'node:stream'
import { finished } from 'node:stream/promises'
import { ZipArchive } from 'archiver'

const root = resolve(import.meta.dirname, '..')
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const nodeVersion = '22.22.2'
const nodeArchiveName = `node-v${nodeVersion}-win-x64.zip`
const nodeArchiveSha256 = '7c93e9d92bf68c07182b471aa187e35ee6cd08ef0f24ab060dfff605fcc1c57c'
const releaseRoot = resolve(root, 'release')
const packageName = `替抗蓟化-Windows本地Web版-${manifest.version}-x64`
const output = resolve(releaseRoot, packageName)
const zipFile = resolve(releaseRoot, `${packageName}.zip`)
const cacheRoot = resolve(releaseRoot, '.cache')
const nodeArchive = resolve(cacheRoot, nodeArchiveName)

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    ...options,
  })
  if (result.status !== 0) throw new Error(`${command} 执行失败，退出码 ${result.status ?? 'unknown'}`)
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

async function downloadNodeRuntime() {
  mkdirSync(cacheRoot, { recursive: true })
  if (existsSync(nodeArchive) && sha256(nodeArchive) === nodeArchiveSha256) return
  rmSync(nodeArchive, { force: true })
  const url = `https://nodejs.org/dist/v${nodeVersion}/${nodeArchiveName}`
  const response = await fetch(url)
  if (!response.ok || !response.body) throw new Error(`下载 Windows Node.js 运行时失败：HTTP ${response.status}`)
  await finished(Readable.fromWeb(response.body).pipe(createWriteStream(nodeArchive)))
  const actual = sha256(nodeArchive)
  if (actual !== nodeArchiveSha256) {
    rmSync(nodeArchive, { force: true })
    throw new Error(`Windows Node.js 运行时校验失败：${actual}`)
  }
}

async function extractNodeRuntime() {
  const temp = mkdtempSync(join(tmpdir(), 'tihua-node-win-'))
  try {
    if (process.platform === 'win32') {
      const archive = nodeArchive.replaceAll("'", "''")
      const destination = temp.replaceAll("'", "''")
      run('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-Command',
        `Expand-Archive -LiteralPath '${archive}' -DestinationPath '${destination}' -Force`,
      ])
    } else {
      run('unzip', ['-q', nodeArchive, '-d', temp])
    }
    const extracted = resolve(temp, `node-v${nodeVersion}-win-x64`)
    mkdirSync(resolve(output, 'runtime'), { recursive: true })
    for (const name of ['node.exe', 'LICENSE', 'README.md']) {
      const source = resolve(extracted, name)
      if (existsSync(source)) await runCopy(source, resolve(output, 'runtime', name))
    }
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}

function runCopy(source, target) {
  mkdirSync(resolve(target, '..'), { recursive: true })
  return cp(source, target, { recursive: true, force: true })
}

async function makeZip() {
  rmSync(zipFile, { force: true })
  await new Promise((resolvePromise, reject) => {
    const stream = createWriteStream(zipFile)
    const archive = new ZipArchive({ zlib: { level: 6 } })
    stream.on('close', resolvePromise)
    stream.on('error', reject)
    archive.on('warning', reject)
    archive.on('error', reject)
    archive.pipe(stream)
    archive.directory(output, basename(output))
    archive.finalize()
  })
}

run(process.execPath, [resolve(root, 'scripts/prepare-windows-voice-runtime.mjs')])
run('npm', ['run', 'build'])
await downloadNodeRuntime()

rmSync(output, { recursive: true, force: true })
mkdirSync(resolve(output, 'app'), { recursive: true })
mkdirSync(resolve(output, 'models'), { recursive: true })
mkdirSync(resolve(output, 'runtime'), { recursive: true })

await Promise.all([
  runCopy(resolve(root, 'dist'), resolve(output, 'app/dist')),
  runCopy(resolve(root, 'server'), resolve(output, 'app/server')),
  runCopy(resolve(root, 'src'), resolve(output, 'app/src')),
  runCopy(resolve(root, 'models/offline'), resolve(output, 'models/offline')),
  runCopy(resolve(root, 'packaging/windows-web'), output),
  runCopy(resolve(root, 'package.json'), resolve(output, 'app/package.json')),
  runCopy(resolve(root, 'package-lock.json'), resolve(output, 'app/package-lock.json')),
  runCopy(resolve(root, 'docs/WINDOWS_WEB_DEPLOYMENT.md'), resolve(output, 'Windows本地Web版部署说明.md')),
])

run('npm', ['ci', '--omit=dev', '--omit=optional', '--ignore-scripts', '--prefix', resolve(output, 'app')])
// npm creates POSIX symlinks in .bin when cross-building on macOS. The runtime
// never uses package CLIs, so omit them instead of shipping links Windows cannot use.
rmSync(resolve(output, 'app/node_modules/.bin'), { recursive: true, force: true })
await runCopy(resolve(root, 'node_modules/sherpa-onnx-win-x64'), resolve(output, 'app/node_modules/sherpa-onnx-win-x64'))
await extractNodeRuntime()

const notice = [
  '替抗蓟化 Windows 本地 Web 版',
  `版本：${manifest.version}`,
  `内置 Node.js：v${nodeVersion} Windows x64（官方便携二进制）`,
  '语音运行库：sherpa-onnx-node / sherpa-onnx-win-x64',
  '运行方式：仅监听 127.0.0.1，运行时不需要互联网。',
  '',
].join('\r\n')
writeFileSync(resolve(output, '版本与运行环境.txt'), notice, 'utf8')

await makeZip()
console.log(JSON.stringify({
  ok: true,
  output,
  zipFile,
  nodeRuntime: `v${nodeVersion} win-x64`,
  nodeSha256: nodeArchiveSha256,
}, null, 2))
