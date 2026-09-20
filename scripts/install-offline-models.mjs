import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import { finished } from 'node:stream/promises'
import { spawn } from 'node:child_process'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const modelDir = resolve(process.env.OFFLINE_MODEL_DIR || resolve(root, 'models/offline'))
const verifyOnly = process.argv.includes('--verify-only')

const assets = [
  {
    id: 'sensevoice-int8',
    kind: 'archive',
    url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2',
    target: 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17/model.int8.onnx',
    minBytes: 120_000_000,
  },
  {
    id: 'matcha-chinese-female',
    kind: 'archive',
    url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/matcha-icefall-zh-baker.tar.bz2',
    target: 'matcha-icefall-zh-baker/model-steps-3.onnx',
    minBytes: 40_000_000,
  },
  {
    id: 'zipvoice-natural-zh-en',
    kind: 'archive',
    url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/sherpa-onnx-zipvoice-distill-int8-zh-en-emilia.tar.bz2',
    target: 'sherpa-onnx-zipvoice-distill-int8-zh-en-emilia/encoder.int8.onnx',
    minBytes: 5_000_000,
  },
  {
    id: 'vocos-22khz',
    kind: 'file',
    url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/vocoder-models/vocos-22khz-univ.onnx',
    target: 'vocos-22khz-univ.onnx',
    minBytes: 45_000_000,
  },
  {
    id: 'vocos-24khz',
    kind: 'file',
    url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/vocoder-models/vocos_24khz.onnx',
    target: 'vocos_24khz.onnx',
    minBytes: 45_000_000,
  },
  {
    id: 'silero-vad',
    kind: 'file',
    url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx',
    target: 'silero_vad.onnx',
    minBytes: 500_000,
  },
]

async function download(url, destination) {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok || !response.body) throw new Error(`下载失败：${response.status} ${url}`)
  await mkdir(dirname(destination), { recursive: true })
  const temp = `${destination}.part`
  await finished(Readable.fromWeb(response.body).pipe(createWriteStream(temp)))
  await rename(temp, destination)
}

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', (code) => code === 0 ? resolvePromise() : reject(new Error(`${command} 退出码 ${code}`)))
  })
}

async function sha256(file) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}

async function ensureAsset(asset) {
  const target = resolve(modelDir, asset.target)
  if (existsSync(target) && (await stat(target)).size >= asset.minBytes) {
    process.stdout.write(`✓ ${asset.id} 已存在\n`)
    return target
  }
  if (verifyOnly) throw new Error(`${asset.id} 缺失或不完整：${target}`)
  process.stdout.write(`↓ 正在下载 ${asset.id}\n`)
  if (asset.kind === 'file') {
    await download(asset.url, target)
  } else {
    const archive = resolve(modelDir, `.download-${asset.id}.tar.bz2`)
    await download(asset.url, archive)
    await run('tar', ['-xjf', archive, '-C', modelDir])
    await rm(archive, { force: true })
  }
  if (!existsSync(target) || (await stat(target)).size < asset.minBytes) {
    throw new Error(`${asset.id} 安装后校验失败：${target}`)
  }
  process.stdout.write(`✓ ${asset.id} 安装完成\n`)
  return target
}

await mkdir(modelDir, { recursive: true })
const files = []
for (const asset of assets) {
  const target = await ensureAsset(asset)
  files.push({ id: asset.id, path: asset.target, bytes: (await stat(target)).size, sha256: await sha256(target), source: asset.url })
}

const manifestFile = resolve(modelDir, 'manifest.json')
let installedAt = new Date().toISOString()
if (verifyOnly && existsSync(manifestFile)) {
  try { installedAt = JSON.parse(await readFile(manifestFile, 'utf8')).installedAt || installedAt } catch { /* rewrite below */ }
}
await writeFile(manifestFile, `${JSON.stringify({ version: 1, installedAt, files }, null, 2)}\n`)
process.stdout.write(`\n离线模型已就绪：${modelDir}\n`)
