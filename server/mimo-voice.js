/** MiMo is used only for text-to-speech. Questions and evidence stay local. */

const DEFAULT_BASE_URL = 'https://token-plan-cn.xiaomimimo.com/v1'
const TTS_MODEL = 'mimo-v2.5-tts'
const DEFAULT_VOICE = '茉莉'

function apiKey() {
  return String(process.env.MIMO_API_KEY || '').trim()
}

function baseUrl() {
  return String(process.env.MIMO_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '')
}

function proxyUrl() {
  const value = String(process.env.MIMO_PROXY_URL || '').trim()
  if (!value || /^(?:0|false|none|off)$/i.test(value)) return ''
  return value.replace(/\/$/, '')
}

export function mimoVoiceConfigured() {
  return Boolean(apiKey() || proxyUrl())
}

async function synthesizeViaProxy(say) {
  const proxy = proxyUrl()
  if (!proxy) return { ok: false, status: 503, error: 'MiMo 语音服务未配置。', fallback: 'browser' }
  const timeoutMs = Math.max(1000, Number(process.env.MIMO_TTS_TIMEOUT_MS || 8500))
  const signal = AbortSignal.timeout(timeoutMs)

  try {
    const session = await fetch(`${proxy}/api/djtk/stage-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal,
    })
    const cookie = String(session.headers.get('set-cookie') || '').split(';', 1)[0]
    if (!session.ok || !cookie.startsWith('djtk_stage=')) {
      return { ok: false, status: session.status || 502, error: 'MiMo 语音服务暂不可用。', fallback: 'browser' }
    }

    const response = await fetch(`${proxy}/api/djtk/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ text: say.slice(0, 300) }),
      signal,
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.audioBase64) {
      return { ok: false, status: response.status || 502, error: 'MiMo 语音服务暂不可用。', fallback: 'browser' }
    }
    return {
      ok: true,
      audioBase64: String(payload.audioBase64),
      mime: String(payload.mime || 'audio/wav'),
      voice: String(payload.voice || DEFAULT_VOICE),
      voiceGender: 'female',
      engine: 'mimo-v2.5-tts-proxy',
    }
  } catch (error) {
    const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError'
    return {
      ok: false,
      status: timeout ? 504 : 502,
      error: timeout ? 'MiMo 语音生成超时。' : 'MiMo 语音服务暂不可用。',
      fallback: 'browser',
    }
  }
}

export async function synthesizeMimoVoice(text) {
  const say = String(text || '').trim()
  const key = apiKey()
  if (!say) return { ok: false, status: 400, error: '没有要播报的文字。', fallback: 'browser' }
  if (!key) return synthesizeViaProxy(say)

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
        audio: { format: 'wav', voice: String(process.env.MIMO_TTS_VOICE || DEFAULT_VOICE) },
      }),
      signal: AbortSignal.timeout(Math.max(1000, Number(process.env.MIMO_TTS_TIMEOUT_MS || 6000))),
    })
  } catch (error) {
    const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError'
    return {
      ok: false,
      status: timeout ? 504 : 502,
      error: timeout ? 'MiMo 语音生成超时。' : 'MiMo 语音服务暂不可用。',
      fallback: 'browser',
    }
  }

  if (!response.ok) {
    return { ok: false, status: response.status, error: 'MiMo 语音服务暂不可用。', fallback: 'browser' }
  }

  let payload
  try {
    payload = await response.json()
  } catch {
    return { ok: false, status: 502, error: 'MiMo 语音响应格式异常。', fallback: 'browser' }
  }
  const audioBase64 = String(payload?.choices?.[0]?.message?.audio?.data || '').trim()
  if (!audioBase64) {
    return { ok: false, status: 502, error: 'MiMo 语音响应没有音频。', fallback: 'browser' }
  }

  return {
    ok: true,
    audioBase64,
    mime: 'audio/wav',
    voice: String(process.env.MIMO_TTS_VOICE || DEFAULT_VOICE),
    voiceGender: 'female',
    engine: 'mimo-v2.5-tts',
  }
}
