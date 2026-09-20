import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { synthesizeOfflineVoice, transcribePcm16 } from '../server/offline-voice.js'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const outputDir = resolve(root, 'artifacts')
const phrase = process.argv.slice(2).join(' ').trim() || '这批鸡安全吗？'

const ttsStart = performance.now()
const voice = await synthesizeOfflineVoice(phrase)
if (!voice.ok) throw new Error(voice.error)
const wav = Buffer.from(voice.audioBase64, 'base64')
await mkdir(outputDir, { recursive: true })
const wavFile = resolve(outputDir, 'offline-voice-smoke.wav')
await writeFile(wavFile, wav)

const sampleRate = wav.readUInt32LE(24)
const dataSize = wav.readUInt32LE(40)
const pcm = wav.subarray(44, 44 + dataSize)
const asrStart = performance.now()
const recognized = await transcribePcm16(pcm, sampleRate)

process.stdout.write(`${JSON.stringify({
  ok: voice.ok && recognized.ok,
  input: phrase,
  recognized: recognized.text || null,
  voice: voice.voice,
  voiceGender: voice.voiceGender,
  sampleRate,
  wavBytes: wav.length,
  ttsMs: Math.round(asrStart - ttsStart),
  asrMs: Math.round(performance.now() - asrStart),
  output: wavFile,
}, null, 2)}\n`)

if (!recognized.ok) process.exitCode = 1
