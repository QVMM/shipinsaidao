/** MiMo is used only as a text-to-speech provider. It never receives evidence or questions. */

const DEFAULT_BASE_URL = 'https://token-plan-cn.xiaomimimo.com/v1'
const TTS_MODEL = 'mimo-v2.5-tts'
const DEFAULT_TTS_VOICE = '茉莉'
const TTS_VOICE_GENDER = 'female'
const TTS_TIMEOUT_MS = 8_000

function apiKey() {
  return String(process.env.MIMO_API_KEY || '').trim()
}

function baseUrl() {
  return String(process.env.MIMO_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '')
}

function ttsVoice() {
  return String(process.env.MIMO_TTS_VOICE || DEFAULT_TTS_VOICE).trim() || DEFAULT_TTS_VOICE
}

export function mimoVoiceProfile() {
  return { voice: ttsVoice(), voiceGender: TTS_VOICE_GENDER }
}

export function mimoVoiceConfigured() {
  return Boolean(apiKey())
}

/**
 * @param {string} text
 * @returns {Promise<{ ok: true, audioBase64: string, mime: string, voice: string } | { ok: false, status: number, error: string }>}
 */
export async function synthesizeMimoVoice(text) {
  const say = String(text || '').trim()
  const key = apiKey()
  const voice = ttsVoice()
  if (!say) return { ok: false, status: 400, error: '没有要播报的文字。' }
  if (!key) return { ok: false, status: 503, error: 'MiMo 语音服务未配置。' }

  let response
  try {
    response = await fetch(`${baseUrl()}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: TTS_MODEL,
        messages: [{ role: 'assistant', content: say.slice(0, 300) }],
        audio: { format: 'wav', voice },
      }),
      signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
    })
  } catch (error) {
    const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError'
    return { ok: false, status: timeout ? 504 : 502, error: timeout ? 'MiMo 语音生成超时。' : 'MiMo 语音服务暂不可用。' }
  }

  if (!response.ok) {
    return { ok: false, status: response.status, error: 'MiMo 语音服务暂不可用。' }
  }

  let payload
  try {
    payload = await response.json()
  } catch {
    return { ok: false, status: 502, error: 'MiMo 语音响应格式异常。' }
  }
  const audioBase64 = String(payload?.choices?.[0]?.message?.audio?.data || '').trim()
  if (!audioBase64) return { ok: false, status: 502, error: 'MiMo 语音响应没有音频。' }

  return { ok: true, audioBase64, mime: 'audio/wav', voice, voiceGender: TTS_VOICE_GENDER }
}
