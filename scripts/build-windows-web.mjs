import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { cp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { Readable } from 'node:stream'
import { finished } from 'node:stream/promises'
import { ZipArchive } from 'archiver'

const root = resolve(import.meta.dirname, '..')
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const nodeVersion = '22.22.2'
const nodeRuntimes = {
  x64: {
    archiveName: `node-v${nodeVersion}-win-x64.zip`,
    sha256: '7c93e9d92bf68c07182b471aa187e35ee6cd08ef0f24ab060dfff605fcc1c57c',
    outputName: 'node.exe',
  },
  arm64: {
    archiveName: `node-v${nodeVersion}-win-arm64.zip`,
    sha256: '380d375cf650c5a7f2ef3ce29ac6ea9a1c9d2ec8ea8e8391e1a34fd543886ab3',
    outputName: 'node-arm64.exe',
  },
}
const arm64Voice = {
  archiveName: 'sherpa-onnx-v1.13.8-win-arm64-static-MT-Release.tar.bz2',
  sha256: '3bc774a26779fd1f36f8775b85cbf517ea860241a9d8cce5b0e6e3c3a4e0b234',
  url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.13.8/sherpa-onnx-v1.13.8-win-arm64-static-MT-Release.tar.bz2',
  root: 'sherpa-onnx-v1.13.8-win-arm64-static-MT-Release',
}
const releaseRoot = resolve(root, 'release')
const packageName = `替抗蓟化-Windows本地Web版-${manifest.version}-universal`
const output = resolve(releaseRoot, packageName)
const zipFile = resolve(releaseRoot, `${packageName}.zip`)
const cacheRoot = resolve(releaseRoot, '.cache')

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

async function downloadArchive({ archiveName, sha256: expectedSha, url }) {
  mkdirSync(cacheRoot, { recursive: true })
  const archive = resolve(cacheRoot, archiveName)
  if (existsSync(archive) && sha256(archive) === expectedSha) return archive
  rmSync(archive, { force: true })
  const response = await fetch(url)
  if (!response.ok || !response.body) throw new Error(`下载 Windows Node.js 运行时失败：HTTP ${response.status}`)
  await finished(Readable.fromWeb(response.body).pipe(createWriteStream(archive)))
  const actual = sha256(archive)
  if (actual !== expectedSha) {
    rmSync(archive, { force: true })
    throw new Error(`Windows Node.js 运行时校验失败：${actual}`)
  }
  return archive
}

async function extractNodeRuntime(arch, config, archive) {
  const temp = mkdtempSync(join(tmpdir(), 'tihua-node-win-'))
  try {
    if (process.platform === 'win32') {
      const escapedArchive = archive.replaceAll("'", "''")
      const destination = temp.replaceAll("'", "''")
      run('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-Command',
        `Expand-Archive -LiteralPath '${escapedArchive}' -DestinationPath '${destination}' -Force`,
      ])
    } else {
      run('unzip', ['-q', archive, '-d', temp])
    }
    const extracted = resolve(temp, `node-v${nodeVersion}-win-${arch}`)
    mkdirSync(resolve(output, 'runtime'), { recursive: true })
    await runCopy(resolve(extracted, 'node.exe'), resolve(output, 'runtime', config.outputName))
    if (arch === 'x64') {
      for (const name of ['LICENSE', 'README.md']) {
        const source = resolve(extracted, name)
        if (existsSync(source)) await runCopy(source, resolve(output, 'runtime', name))
      }
    }
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}

async function extractArm64VoiceRuntime(archive) {
  const temp = mkdtempSync(join(tmpdir(), 'tihua-voice-win-arm64-'))
  try {
    const wanted = ['sherpa-onnx-offline-tts.exe', 'sherpa-onnx-offline.exe']
    const paths = wanted.map((name) => `${arm64Voice.root}/bin/${name}`)
    run('tar', ['-xjf', archive, '-C', temp, ...paths])
    const target = resolve(output, 'runtime/voice-arm64')
    mkdirSync(target, { recursive: true })
    for (const name of wanted) {
      await runCopy(resolve(temp, arm64Voice.root, 'bin', name), resolve(target, name))
    }
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}

function runCopy(source, target) {
  mkdirSync(resolve(target, '..'), { recursive: true })
  return cp(source, target, { recursive: true, force: true })
}

function normalizeWindowsBatchFiles(directory) {
  for (const name of readdirSync(directory).filter((file) => file.toLowerCase().endsWith('.bat'))) {
    const file = resolve(directory, name)
    const bytes = readFileSync(file)
    const nonAscii = bytes.findIndex((byte) => byte > 0x7f)
    if (nonAscii !== -1) throw new Error('Windows 批处理文件含非 ASCII 字节：' + name + ' @ ' + nonAscii)
    const windowsText = bytes.toString('ascii').replace(/\r?\n/g, '\r\n')
    writeFileSync(file, windowsText, 'ascii')
  }
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
    // Windows 资源管理器的“全部解压”会自动创建与 ZIP 同名的文件夹。
    // 压缩包内不再套同名目录，避免电脑小白解压后还要多点进一层。
    archive.directory(output, false)
    archive.finalize()
  })
}

run(process.execPath, [resolve(root, 'scripts/prepare-windows-voice-runtime.mjs')])
run('npm', ['run', 'build'])
const downloadedNodeRuntimes = Object.fromEntries(await Promise.all(Object.entries(nodeRuntimes).map(async ([arch, config]) => [
  arch,
  await downloadArchive({
    ...config,
    url: `https://nodejs.org/dist/v${nodeVersion}/${config.archiveName}`,
  }),
])))
const arm64VoiceArchive = await downloadArchive(arm64Voice)

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
normalizeWindowsBatchFiles(output)

run('npm', ['ci', '--omit=dev', '--omit=optional', '--ignore-scripts', '--prefix', resolve(output, 'app')])
// npm creates POSIX symlinks in .bin when cross-building on macOS. The runtime
// never uses package CLIs, so omit them instead of shipping links Windows cannot use.
rmSync(resolve(output, 'app/node_modules/.bin'), { recursive: true, force: true })
await runCopy(resolve(root, 'node_modules/sherpa-onnx-win-x64'), resolve(output, 'app/node_modules/sherpa-onnx-win-x64'))
await Promise.all(Object.entries(nodeRuntimes).map(([arch, config]) => extractNodeRuntime(arch, config, downloadedNodeRuntimes[arch])))
await extractArm64VoiceRuntime(arm64VoiceArchive)

const notice = [
  '替抗蓟化 Windows 本地 Web 版',
  `版本：${manifest.version}`,
  `内置 Node.js：v${nodeVersion} Windows x64 + ARM64（官方便携二进制）`,
  '语音运行库：x64 sherpa-onnx-node / ARM64 sherpa-onnx 原生 CLI',
  '运行方式：仅监听 127.0.0.1，运行时不需要互联网。',
  '',
].join('\r\n')
writeFileSync(resolve(output, '版本与运行环境.txt'), notice, 'utf8')

await makeZip()
console.log(JSON.stringify({
  ok: true,
  output,
  zipFile,
  nodeRuntime: `v${nodeVersion} win-x64 + win-arm64`,
  nodeSha256: Object.fromEntries(Object.entries(nodeRuntimes).map(([arch, config]) => [arch, config.sha256])),
  arm64VoiceSha256: arm64Voice.sha256,
}, null, 2))
