/** Fully local ASR/TTS for the competition build. No network calls are made here. */

import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  synthesizeWindowsVoiceCli,
  transcribeWindowsVoiceCli,
  windowsVoiceCliReady,
} from './windows-voice-cli.js'

const require = createRequire(import.meta.url)
const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const ASR_FOLDER = 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17'
const TTS_FOLDER = 'matcha-icefall-zh-baker'
const ZIPVOICE_FOLDER = 'sherpa-onnx-zipvoice-distill-int8-zh-en-emilia'
const VOICE_NAME = '本地自然女声·Emilia'
const FALLBACK_VOICE_NAME = '本地女声·Baker'
const FEMALE_REFERENCE_TEXT = '各位村民, 大家新年好! 近期, 湖北省武汉市等多个地区'

let sherpa = null
let sherpaError = null
let recognizer = null
let recognizerKey = ''
let tts = null
let ttsKey = ''
let workingTtsKind = ''
const failedTtsKinds = new Set()

function fakeMode() {
  return process.env.OFFLINE_VOICE_FAKE === '1'
}

export function modelRoot() {
  return resolve(process.env.OFFLINE_MODEL_DIR || resolve(root, 'models/offline'))
}

export function offlineVoicePaths() {
  const base = modelRoot()
  const asr = resolve(base, ASR_FOLDER)
  const matcha = resolve(base, TTS_FOLDER)
  const zipvoice = resolve(base, ZIPVOICE_FOLDER)
  return {
    base,
    asrModel: resolve(asr, 'model.int8.onnx'),
    asrTokens: resolve(asr, 'tokens.txt'),
    ttsModel: resolve(matcha, 'model-steps-3.onnx'),
    ttsLexicon: resolve(matcha, 'lexicon.txt'),
    ttsTokens: resolve(matcha, 'tokens.txt'),
    phoneFst: resolve(matcha, 'phone.fst'),
    dateFst: resolve(matcha, 'date.fst'),
    numberFst: resolve(matcha, 'number.fst'),
    vocoder: resolve(base, 'vocos-22khz-univ.onnx'),
    zipEncoder: resolve(zipvoice, 'encoder.int8.onnx'),
    zipDecoder: resolve(zipvoice, 'decoder.int8.onnx'),
    zipTokens: resolve(zipvoice, 'tokens.txt'),
    zipLexicon: resolve(zipvoice, 'lexicon.txt'),
    zipDataDir: resolve(zipvoice, 'espeak-ng-data'),
    zipVocoder: resolve(base, 'vocos_24khz.onnx'),
    zipReference: resolve(zipvoice, 'test_wavs/news-female.wav'),
    vad: resolve(base, 'silero_vad.onnx'),
  }
}

export function ttsEngineCandidates({ naturalVoiceReady, fallbackVoiceReady, preferMatcha = false }) {
  const order = preferMatcha ? ['matcha', 'zipvoice'] : ['zipvoice', 'matcha']
  return order.filter((kind) => kind === 'zipvoice' ? naturalVoiceReady : fallbackVoiceReady)
}

function loadSherpa() {
  if (sherpa) return sherpa
  if (sherpaError) throw sherpaError
  try {
    sherpa = require('sherpa-onnx-node')
    return sherpa
  } catch (error) {
    sherpaError = error
    throw error
  }
}

export function getOfflineVoiceStatus() {
  if (fakeMode()) {
    return {
      ready: true,
      asrReady: true,
      ttsReady: true,
      vadReady: true,
      nativeReady: true,
      voice: VOICE_NAME,
      voiceGender: 'female',
      ttsEngine: 'zipvoice-local-test',
      naturalVoiceReady: true,
      message: '离线语音测试模式已就绪。',
      modelDir: modelRoot(),
    }
  }
  const p = offlineVoicePaths()
  const asrReady = existsSync(p.asrModel) && existsSync(p.asrTokens)
  const naturalVoiceReady = [p.zipEncoder, p.zipDecoder, p.zipTokens, p.zipLexicon, p.zipDataDir, p.zipVocoder, p.zipReference].every(existsSync)
  const fallbackVoiceReady = [p.ttsModel, p.ttsLexicon, p.ttsTokens, p.phoneFst, p.dateFst, p.numberFst, p.vocoder].every(existsSync)
  const naturalVoiceUsable = naturalVoiceReady && !failedTtsKinds.has('zipvoice')
  const fallbackVoiceUsable = fallbackVoiceReady && !failedTtsKinds.has('matcha')
  const ttsReady = naturalVoiceUsable || fallbackVoiceUsable
  const cliReady = windowsVoiceCliReady()
  const activeVoiceKind = cliReady ? 'matcha' : (workingTtsKind || (naturalVoiceUsable ? 'zipvoice' : 'matcha'))
  let nativeReady = cliReady
  let nativeError = ''
  if (!cliReady) {
    try {
      loadSherpa()
      nativeReady = true
    } catch (error) {
      nativeError = String(error?.message || error)
    }
  }
  const ready = asrReady && ttsReady && nativeReady
  const missing = []
  if (!asrReady) missing.push('识别模型')
  if (!ttsReady) missing.push('女声模型')
  if (!nativeReady) missing.push('本地推理组件')
  return {
    ready,
    asrReady: asrReady && nativeReady,
    ttsReady: ttsReady && nativeReady,
    vadReady: existsSync(p.vad),
    nativeReady,
    nativeError,
    voice: activeVoiceKind === 'zipvoice' ? VOICE_NAME : FALLBACK_VOICE_NAME,
    voiceGender: 'female',
    ttsEngine: cliReady ? 'matcha-arm64-native' : (activeVoiceKind === 'zipvoice' ? 'zipvoice-local' : 'matcha-local'),
    naturalVoiceReady: naturalVoiceUsable,
    message: ready ? `离线识别与${activeVoiceKind === 'zipvoice' ? '自然' : '备用'}本地女声已就绪。` : `尚未安装或加载：${missing.join('、')}。`,
    modelDir: p.base,
  }
}

function getRecognizer() {
  const p = offlineVoicePaths()
  const key = `${p.asrModel}|${p.asrTokens}`
  if (recognizer && recognizerKey === key) return recognizer
  const api = loadSherpa()
  recognizer = new api.OfflineRecognizer({
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      senseVoice: { model: p.asrModel, useInverseTextNormalization: 1 },
      tokens: p.asrTokens,
      numThreads: Math.max(2, Math.min(6, Number(process.env.OFFLINE_ASR_THREADS || 4))),
      provider: 'cpu',
      debug: 0,
    },
  })
  recognizerKey = key
  return recognizer
}

function getTts(requestedKind = '') {
  const p = offlineVoicePaths()
  const preferMatcha = process.env.OFFLINE_VOICE_ENGINE === 'matcha'
  const naturalReady = [p.zipEncoder, p.zipDecoder, p.zipTokens, p.zipLexicon, p.zipDataDir, p.zipVocoder, p.zipReference].every(existsSync)
  const fallbackReady = [p.ttsModel, p.ttsLexicon, p.ttsTokens, p.phoneFst, p.dateFst, p.numberFst, p.vocoder].every(existsSync)
  const candidates = ttsEngineCandidates({ naturalVoiceReady: naturalReady, fallbackVoiceReady: fallbackReady, preferMatcha })
  const kind = requestedKind || candidates[0]
  if (!kind || !candidates.includes(kind)) throw new Error(`本地女声模型不完整：${requestedKind || '无可用引擎'}`)
  const key = kind === 'zipvoice' ? `${p.zipEncoder}|${p.zipDecoder}|${p.zipVocoder}` : `${p.ttsModel}|${p.vocoder}`
  if (tts && ttsKey === key) return tts
  const api = loadSherpa()
  const model = kind === 'zipvoice'
    ? {
        zipvoice: {
          encoder: p.zipEncoder,
          decoder: p.zipDecoder,
          vocoder: p.zipVocoder,
          tokens: p.zipTokens,
          lexicon: p.zipLexicon,
          dataDir: p.zipDataDir,
        },
        debug: false,
        numThreads: Math.max(2, Math.min(6, Number(process.env.OFFLINE_TTS_THREADS || 4))),
        provider: 'cpu',
      }
    : {
        matcha: {
          acousticModel: p.ttsModel,
          vocoder: p.vocoder,
          lexicon: p.ttsLexicon,
          tokens: p.ttsTokens,
        },
        debug: false,
        numThreads: Math.max(2, Math.min(6, Number(process.env.OFFLINE_TTS_THREADS || 4))),
        provider: 'cpu',
      }
  const engine = new api.OfflineTts({
    model,
    maxNumSentences: 1,
    ruleFsts: kind === 'matcha' ? [p.phoneFst, p.dateFst, p.numberFst].join(',') : '',
  })
  tts = {
    engine,
    kind,
    reference: kind === 'zipvoice' ? api.readWave(p.zipReference, false) : null,
  }
  ttsKey = key
  return tts
}

export function normalizeTranscript(text) {
  const compact = String(text || '')
    .replace(/<\|[^|>]+\|>/g, '')
    .replace(/\s+/g, '')
    .trim()
  const corrections = [
    [/这[PＰ批皮]机/g, '这批鸡'],
    [/夫本尼考/g, '氟苯尼考'],
    [/弗苯尼考/g, '氟苯尼考'],
    [/氟本尼考/g, '氟苯尼考'],
    [/替抗句(?:话|化)/g, '替抗计划'],
    [/大记/g, '大蓟'],
  ]
  return corrections.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), compact)
}

function pcm16ToFloat32(buffer) {
  const size = Math.floor(buffer.byteLength / 2)
  const samples = new Float32Array(size)
  for (let i = 0; i < size; i += 1) samples[i] = buffer.readInt16LE(i * 2) / 32768
  return samples
}

export async function transcribePcm16(buffer, sampleRate = 16000) {
  if (fakeMode()) {
    return { ok: true, text: String(process.env.OFFLINE_VOICE_FAKE_TEXT || '这批鸡安全吗？'), engine: 'sensevoice-local-test' }
  }
  const status = getOfflineVoiceStatus()
  if (!status.asrReady) return { ok: false, status: 503, error: status.message }
  if (!Buffer.isBuffer(buffer) || buffer.byteLength < 640) {
    return { ok: false, status: 400, error: '录音过短，请重新说一遍。' }
  }
  if (windowsVoiceCliReady()) {
    return transcribeWindowsVoiceCli(offlineVoicePaths(), buffer, sampleRate, normalizeTranscript)
  }
  try {
    const engine = getRecognizer()
    const stream = engine.createStream()
    stream.acceptWaveform({ sampleRate, samples: pcm16ToFloat32(buffer) })
    engine.decode(stream)
    const result = engine.getResult(stream)
    const text = normalizeTranscript(result?.text)
    if (!text) return { ok: false, status: 422, error: '没有听清，请靠近麦克风再说一遍。' }
    return { ok: true, text, engine: 'sensevoice-local' }
  } catch (error) {
    return { ok: false, status: 500, error: `本地语音识别失败：${String(error?.message || error)}` }
  }
}

/** Encode mono float samples as 16-bit PCM WAV. */
export function encodeWaveBuffer(samples, sampleRate) {
  const dataSize = samples.length * 2
  const out = Buffer.alloc(44 + dataSize)
  out.write('RIFF', 0, 'ascii')
  out.writeUInt32LE(36 + dataSize, 4)
  out.write('WAVE', 8, 'ascii')
  out.write('fmt ', 12, 'ascii')
  out.writeUInt32LE(16, 16)
  out.writeUInt16LE(1, 20)
  out.writeUInt16LE(1, 22)
  out.writeUInt32LE(sampleRate, 24)
  out.writeUInt32LE(sampleRate * 2, 28)
  out.writeUInt16LE(2, 32)
  out.writeUInt16LE(16, 34)
  out.write('data', 36, 'ascii')
  out.writeUInt32LE(dataSize, 40)
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.max(-1, Math.min(1, Number(samples[i]) || 0))
    out.writeInt16LE(value < 0 ? Math.round(value * 32768) : Math.round(value * 32767), 44 + i * 2)
  }
  return out
}

function fakeFemaleWave() {
  const sampleRate = 22050
  const samples = new Float32Array(Math.round(sampleRate * 0.18))
  for (let i = 0; i < samples.length; i += 1) samples[i] = Math.sin((i / sampleRate) * Math.PI * 2 * 240) * 0.08
  return encodeWaveBuffer(samples, sampleRate)
}

function generateTtsWave(api, bundle, say) {
  const generationConfig = new api.GenerationConfig(bundle.kind === 'zipvoice'
    ? {
        speed: Number(process.env.OFFLINE_VOICE_SPEED || 0.9),
        silenceScale: Number(process.env.OFFLINE_VOICE_SILENCE_SCALE || 0.65),
        referenceAudio: bundle.reference.samples,
        referenceSampleRate: bundle.reference.sampleRate,
        referenceText: FEMALE_REFERENCE_TEXT,
        numSteps: 4,
        extra: { min_char_in_sentence: 10 },
      }
    : {
        sid: 0,
        speed: Number(process.env.OFFLINE_VOICE_SPEED || 0.82),
        silenceScale: Number(process.env.OFFLINE_VOICE_SILENCE_SCALE || 0.65),
      })
  const audio = bundle.engine.generate({ text: say.slice(0, 300), generationConfig, enableExternalBuffer: false })
  return encodeWaveBuffer(audio.samples, audio.sampleRate)
}

export async function synthesizeOfflineVoice(text) {
  const say = String(text || '').trim()
  if (!say) return { ok: false, status: 400, error: '没有要播报的文字。' }
  if (fakeMode()) {
    return { ok: true, audioBase64: fakeFemaleWave().toString('base64'), mime: 'audio/wav', voice: VOICE_NAME, voiceGender: 'female', engine: 'matcha-local-test' }
  }
  if (windowsVoiceCliReady()) {
    return synthesizeWindowsVoiceCli(offlineVoicePaths(), say)
  }
  const status = getOfflineVoiceStatus()
  if (!status.ttsReady) return { ok: false, status: 503, error: status.message }
  const p = offlineVoicePaths()
  const candidates = ttsEngineCandidates({
    naturalVoiceReady: [p.zipEncoder, p.zipDecoder, p.zipTokens, p.zipLexicon, p.zipDataDir, p.zipVocoder, p.zipReference].every(existsSync),
    fallbackVoiceReady: [p.ttsModel, p.ttsLexicon, p.ttsTokens, p.phoneFst, p.dateFst, p.numberFst, p.vocoder].every(existsSync),
    preferMatcha: process.env.OFFLINE_VOICE_ENGINE === 'matcha' || failedTtsKinds.has('zipvoice'),
  }).filter((kind) => !failedTtsKinds.has(kind))
  const errors = []
  for (const kind of candidates) {
    try {
      const api = loadSherpa()
      const bundle = getTts(kind)
      const wav = generateTtsWave(api, bundle, say)
      const natural = bundle.kind === 'zipvoice'
      workingTtsKind = bundle.kind
      failedTtsKinds.delete(bundle.kind)
      return { ok: true, audioBase64: wav.toString('base64'), mime: 'audio/wav', voice: natural ? VOICE_NAME : FALLBACK_VOICE_NAME, voiceGender: 'female', engine: natural ? 'zipvoice-local' : 'matcha-local' }
    } catch (error) {
      failedTtsKinds.add(kind)
      if (tts?.kind === kind) {
        tts = null
        ttsKey = ''
      }
      errors.push(`${kind}: ${String(error?.message || error)}`)
    }
  }
  workingTtsKind = ''
  return { ok: false, status: 500, error: `本地女声生成失败：${errors.join(' | ') || status.message}` }
}

export async function warmOfflineVoice() {
  return synthesizeOfflineVoice('系统语音已就绪。')
}
