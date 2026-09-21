/**
 * MiMo is an optional online speech layer only. Batch answers and verdicts stay
 * inside local-assistant.js; if MiMo is unavailable the client falls back to
 * browser speech, while the Windows package uses its bundled local engines.
 */

const DEFAULT_BASE_URL = 'https://token-plan-cn.xiaomimimo.com/v1'
const ASR_MODEL = 'mimo-v2.5-asr'
const TTS_MODEL = 'mimo-v2.5-tts'
const DEFAULT_TTS_VOICE = '茉莉'
const TTS_VOICE_GENDER = 'female'
const VOICE_TIMEOUT_MS = 10_000

function apiKey() {
  return String(process.env.MIMO_API_KEY || '').trim()
}

function baseUrl() {
  return String(process.env.MIMO_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '')
}

function ttsVoice() {
  return String(process.env.MIMO_TTS_VOICE || DEFAULT_TTS_VOICE).trim() || DEFAULT_TTS_VOICE
}

function headers(key) {
  return {
    'Content-Type': 'application/json',
    'api-key': key,
    Authorization: `Bearer ${key}`,
    'X-Mimo-Source': 'djtk-web',
  }
}

export function mimoVoiceProfile() {
  return { voice: ttsVoice(), voiceGender: TTS_VOICE_GENDER }
}

export function mimoVoiceConfigured() {
  return Boolean(apiKey())
}

function pcm16Wav(pcm, sampleRate) {
  const audio = Buffer.isBuffer(pcm) ? pcm : Buffer.from(pcm || [])
  const wav = Buffer.alloc(44 + audio.length)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(36 + audio.length, 4)
  wav.write('WAVE', 8)
  wav.write('fmt ', 12)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(sampleRate, 24)
  wav.writeUInt32LE(sampleRate * 2, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(audio.length, 40)
  audio.copy(wav, 44)
  return wav
}

function responseText(payload) {
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) {
    return content.map((part) => typeof part === 'string' ? part : String(part?.text || '')).join('').trim()
  }
  return ''
}

export async function transcribeMimoPcm16(pcm, sampleRate = 16000) {
  const key = apiKey()
  const audio = Buffer.isBuffer(pcm) ? pcm : Buffer.from(pcm || [])
  if (!audio.length) return { ok: false, status: 400, error: '没有收到录音。' }
  if (!key) return { ok: false, status: 503, error: '联网语音识别暂不可用。' }

  let response
  try {
    response = await fetch(`${baseUrl()}/chat/completions`, {
      method: 'POST',
      headers: headers(key),
      body: JSON.stringify({
        model: ASR_MODEL,
        messages: [{
          role: 'user',
          content: [{
            type: 'input_audio',
            input_audio: { data: pcm16Wav(audio, sampleRate).toString('base64'), format: 'wav' },
          }],
        }],
        asr_options: { language: 'auto' },
      }),
      signal: AbortSignal.timeout(VOICE_TIMEOUT_MS),
    })
  } catch (error) {
    const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError'
    return { ok: false, status: timeout ? 504 : 502, error: timeout ? '语音识别超时，请再试一次。' : '联网语音识别暂不可用。' }
  }
  if (!response.ok) return { ok: false, status: response.status, error: '联网语音识别暂不可用。' }

  let payload
  try {
    payload = await response.json()
  } catch {
    return { ok: false, status: 502, error: '语音识别响应格式异常。' }
  }
  const text = responseText(payload)
  if (!text) return { ok: false, status: 502, error: '没有识别到有效语音。' }
  return { ok: true, text, model: ASR_MODEL }
}

export async function synthesizeMimoVoice(text) {
  const say = String(text || '').trim()
  const key = apiKey()
  const voice = ttsVoice()
  if (!say) return { ok: false, status: 400, error: '没有要播报的文字。' }
  if (!key) return { ok: false, status: 503, error: '联网女声暂不可用。' }

  let response
  try {
    response = await fetch(`${baseUrl()}/chat/completions`, {
      method: 'POST',
      headers: headers(key),
      body: JSON.stringify({
        model: TTS_MODEL,
        messages: [{ role: 'assistant', content: say.slice(0, 300) }],
        audio: { format: 'wav', voice },
      }),
      signal: AbortSignal.timeout(VOICE_TIMEOUT_MS),
    })
  } catch (error) {
    const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError'
    return { ok: false, status: timeout ? 504 : 502, error: timeout ? '联网女声生成超时。' : '联网女声暂不可用。' }
  }
  if (!response.ok) return { ok: false, status: response.status, error: '联网女声暂不可用。' }

  let payload
  try {
    payload = await response.json()
  } catch {
    return { ok: false, status: 502, error: '联网女声响应格式异常。' }
  }
  const audioBase64 = String(payload?.choices?.[0]?.message?.audio?.data || '').trim()
  if (!audioBase64) return { ok: false, status: 502, error: '联网女声响应没有音频。' }
  return { ok: true, audioBase64, mime: 'audio/wav', voice, voiceGender: TTS_VOICE_GENDER }
}
