import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const FEMALE_REFERENCE_TEXT = '各位村民, 大家新年好! 近期, 湖北省武汉市等多个地区'

export function windowsVoiceCliPaths() {
  const directory = resolve(process.env.OFFLINE_VOICE_CLI_DIR || '')
  return {
    directory,
    asr: resolve(directory, 'sherpa-onnx-offline.exe'),
    tts: resolve(directory, 'sherpa-onnx-offline-tts.exe'),
  }
}

export function windowsVoiceCliReady() {
  const forced = process.env.OFFLINE_VOICE_CLI_FORCE === '1'
  if (!forced && !(process.platform === 'win32' && process.arch === 'arm64')) return false
  const cli = windowsVoiceCliPaths()
  return existsSync(cli.asr) && existsSync(cli.tts)
}

export function ttsCliArgs(p, text, outputFile) {
  return [
    `--zipvoice-encoder=${p.zipEncoder}`,
    `--zipvoice-decoder=${p.zipDecoder}`,
    `--zipvoice-data-dir=${p.zipDataDir}`,
    `--zipvoice-lexicon=${p.zipLexicon}`,
    `--zipvoice-tokens=${p.zipTokens}`,
    `--zipvoice-vocoder=${p.zipVocoder}`,
    `--reference-audio=${p.zipReference}`,
    `--reference-text=${FEMALE_REFERENCE_TEXT}`,
    '--num-steps=4',
    `--num-threads=${Math.max(2, Math.min(6, Number(process.env.OFFLINE_TTS_THREADS || 4)))}`,
    `--output-filename=${outputFile}`,
    String(text || '').slice(0, 300),
  ]
}

export function asrCliArgs(p, inputFile) {
  return [
    `--tokens=${p.asrTokens}`,
    `--sense-voice-model=${p.asrModel}`,
    `--num-threads=${Math.max(2, Math.min(6, Number(process.env.OFFLINE_ASR_THREADS || 4)))}`,
    '--sense-voice-language=zh',
    '--sense-voice-use-itn=1',
    '--debug=0',
    inputFile,
  ]
}

export function extractCliTranscript(output) {
  for (const line of String(output || '').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) continue
    try {
      const parsed = JSON.parse(trimmed)
      if (typeof parsed.text === 'string') return parsed.text
    } catch {
      // Ignore diagnostic lines that only resemble JSON.
    }
  }
  return ''
}

function runCli(file, args, timeoutMs) {
  return new Promise((resolvePromise) => {
    const child = spawn(file, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8') })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8') })
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolvePromise({ ...result, stdout, stderr })
    }
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      finish({ ok: false, error: `Windows ARM64 语音程序运行超过 ${Math.round(timeoutMs / 1000)} 秒。` })
    }, timeoutMs)
    child.once('error', (error) => finish({ ok: false, error: String(error?.message || error) }))
    child.once('exit', (code) => finish(code === 0
      ? { ok: true, code }
      : { ok: false, code, error: stderr.trim() || stdout.trim() || `退出码 ${code}` }))
  })
}

function pcm16WaveBuffer(pcm, sampleRate) {
  const data = Buffer.isBuffer(pcm) ? pcm : Buffer.from(pcm)
  const out = Buffer.alloc(44 + data.length)
  out.write('RIFF', 0, 'ascii')
  out.writeUInt32LE(36 + data.length, 4)
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
  out.writeUInt32LE(data.length, 40)
  data.copy(out, 44)
  return out
}

export async function synthesizeWindowsVoiceCli(p, text, options = {}) {
  const cli = windowsVoiceCliPaths()
  const work = mkdtempSync(join(tmpdir(), 'tihua-tts-'))
  const output = join(work, 'voice.wav')
  try {
    const result = await runCli(cli.tts, ttsCliArgs(p, text, output), Number(options.timeoutMs || 30_000))
    if (!result.ok || !existsSync(output)) {
      return { ok: false, status: result.error?.includes('超过') ? 504 : 500, error: `ARM64 本地女声失败：${result.error || '没有生成音频文件'}` }
    }
    const wav = readFileSync(output)
    if (wav.length <= 44) return { ok: false, status: 500, error: 'ARM64 本地女声没有生成有效音频。' }
    return {
      ok: true,
      audioBase64: wav.toString('base64'),
      mime: 'audio/wav',
      voice: '本地自然女声·Emilia',
      voiceGender: 'female',
      engine: 'zipvoice-arm64-native',
    }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

export async function transcribeWindowsVoiceCli(p, pcm, sampleRate, normalize) {
  const cli = windowsVoiceCliPaths()
  const work = mkdtempSync(join(tmpdir(), 'tihua-asr-'))
  const input = join(work, 'input.wav')
  try {
    writeFileSync(input, pcm16WaveBuffer(pcm, sampleRate))
    const result = await runCli(cli.asr, asrCliArgs(p, input), 30_000)
    if (!result.ok) return { ok: false, status: 500, error: `ARM64 本地语音识别失败：${result.error}` }
    const text = normalize(extractCliTranscript(`${result.stdout}\n${result.stderr}`))
    if (!text) return { ok: false, status: 422, error: '没有听清，请靠近麦克风再说一遍。' }
    return { ok: true, text, engine: 'sensevoice-arm64-native' }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
