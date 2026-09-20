import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const release = resolve(root, 'release')
const unpacked = resolve(release, 'win-unpacked')
const resources = resolve(unpacked, 'resources')
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const productName = manifest.build.productName
const version = manifest.version
const installerName = `${productName} Setup ${version}.exe`
const portableName = `${productName} ${version}.exe`

const required = [
  `win-unpacked/${productName}.exe`,
  'win-unpacked/resources/app.asar',
  'win-unpacked/resources/app.asar.unpacked/node_modules/sherpa-onnx-win-x64/sherpa-onnx.node',
  'win-unpacked/resources/app.asar.unpacked/node_modules/sherpa-onnx-win-x64/onnxruntime.dll',
  'win-unpacked/resources/app.asar.unpacked/node_modules/sherpa-onnx-win-x64/onnxruntime_providers_shared.dll',
  'win-unpacked/resources/models/offline/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17/model.int8.onnx',
  'win-unpacked/resources/models/offline/sherpa-onnx-zipvoice-distill-int8-zh-en-emilia/encoder.int8.onnx',
  'win-unpacked/resources/models/offline/sherpa-onnx-zipvoice-distill-int8-zh-en-emilia/decoder.int8.onnx',
  'win-unpacked/resources/models/offline/vocos_24khz.onnx',
  'win-unpacked/resources/models/offline/matcha-icefall-zh-baker/model-steps-3.onnx',
  installerName,
  portableName,
]

const missing = required.filter((relative) => !existsSync(resolve(release, relative)))
if (missing.length) {
  console.error('Windows 交付包缺少文件：')
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

const appExe = resolve(unpacked, `${productName}.exe`)
const voiceAddon = resolve(resources, 'app.asar.unpacked/node_modules/sherpa-onnx-win-x64/sherpa-onnx.node')
for (const [label, file] of [['桌面主程序', appExe], ['离线语音引擎', voiceAddon]]) {
  const machine = peMachine(file)
  if (machine !== 0x8664) {
    console.error(`${label}不是 Windows x64 文件（PE machine: ${machine ?? 'unknown'}）。`)
    process.exit(1)
  }
}

const installer = resolve(release, installerName)
const portable = resolve(release, portableName)
const mb = (file) => (statSync(file).size / 1024 / 1024).toFixed(1)

console.log(JSON.stringify({
  ok: true,
  platform: 'Windows x64',
  appExecutable: 'x86-64',
  voiceRuntime: 'sherpa-onnx-win-x64',
  asr: 'SenseVoice INT8 已打包',
  tts: 'ZipVoice Emilia 女声 + Matcha Baker 兜底已打包',
  installer: `${mb(installer)} MB`,
  portable: `${mb(portable)} MB`,
  networkRequiredAtRuntime: false,
}, null, 2))
