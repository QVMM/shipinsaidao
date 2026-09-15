/**
 * Xiaomi MIMO Token Plan (OpenAI-compatible).
 * Key usage lives only here. Never log the key.
 */

const DEFAULT_BASE = 'https://token-plan-cn.xiaomimimo.com/v1'
const CHAT_MODELS = ['mimo-v2.5', 'mimo-v2.5-pro']
const TTS_MODEL = 'mimo-v2.5-tts'
const TTS_VOICES = ['茉莉', 'mimo_default']

export const DJTK_SYSTEM_PROMPT = [
  'You are DJTK智控助手 for 替抗蓟化减抗鸡肉全链条质控与溯源平台.',
  'Answer in plain Chinese, short spoken sentences suitable for TTS.',
  'No markdown, no bullet lists, no English UI labels.',
  'Cover origin/safety/next step when relevant.',
  'No real city/school names; use 某某基地 / batch codes like 蓟化-2026-0812.',
  'Guide next clicks on this platform: 指挥舱焦点档案、检测、评价、出证、溯源；do not invent shopping buttons.',
  'First answers should help: 鸡从哪来、安不安全、下一步点哪里.',
].join(' ')

export function mimoConfigured() {
  const key = process.env.MIMO_API_KEY
  return Boolean(key && String(key).trim())
}

export function mimoBaseUrl() {
  const raw = process.env.MIMO_BASE_URL || DEFAULT_BASE
  return String(raw).replace(/\/$/, '')
}

function apiKey() {
  return String(process.env.MIMO_API_KEY || '').trim()
}

/**
 * @param {unknown} errBody
 * @returns {string}
 */
function redact(errBody) {
  const key = apiKey()
  let s = typeof errBody === 'string' ? errBody : JSON.stringify(errBody ?? {})
  if (key) s = s.split(key).join('[REDACTED]')
  return s.slice(0, 1200)
}

/**
 * @param {string} path
 * @param {object} body
 * @returns {Promise<{ ok: true, status: number, json: any } | { ok: false, status: number, error: string, body: string }>}
 */
async function postCompletions(body) {
  const key = apiKey()
  if (!key) {
    return { ok: false, status: 503, error: 'mimo_unconfigured', body: '未配置 MIMO_API_KEY。' }
  }
  const url = `${mimoBaseUrl()}/chat/completions`
  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    })
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: 'mimo_network',
      body: redact(err?.message || 'network error'),
    }
  }
  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: 'mimo_http',
      body: redact(json || text),
    }
  }
  return { ok: true, status: res.status, json }
}

/**
 * @param {{ question: string, history?: { role: string, content: string }[] }} opts
 * @returns {Promise<{ ok: true, answer: string, model: string } | { ok: false, status: number, error: string, body: string }>}
 */
export async function mimoChat({ question, history = [] }) {
  const q = String(question || '').trim()
  if (!q) {
    return { ok: false, status: 400, error: 'invalid', body: '请先输入问题。' }
  }
  const hist = (Array.isArray(history) ? history : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && String(m.content || '').trim())
    .slice(-8)
    .map((m) => ({ role: m.role, content: String(m.content).trim().slice(0, 800) }))

  const messages = [
    { role: 'system', content: DJTK_SYSTEM_PROMPT },
    ...hist,
    { role: 'user', content: q },
  ]

  let lastFail = null
  for (const model of CHAT_MODELS) {
    const r = await postCompletions({
      model,
      messages,
      temperature: 0.4,
      max_tokens: 280,
    })
    if (!r.ok) {
      lastFail = r
      continue
    }
    const answer = String(r.json?.choices?.[0]?.message?.content || '').trim()
    if (!answer) {
      lastFail = { ok: false, status: 502, error: 'mimo_empty', body: '模型没有返回文字。' }
      continue
    }
    return { ok: true, answer, model }
  }
  return lastFail || { ok: false, status: 502, error: 'mimo_chat_failed', body: '对话失败。' }
}

/**
 * @param {string} text
 * @returns {Promise<{ ok: true, audioBase64: string, mime: string, voice: string } | { ok: false, status: number, error: string, body: string }>}
 */
export async function mimoTts(text) {
  const say = String(text || '').trim()
  if (!say) {
    return { ok: false, status: 400, error: 'invalid', body: '没有要播报的文字。' }
  }
  let lastFail = null
  for (const voice of TTS_VOICES) {
    const r = await postCompletions({
      model: TTS_MODEL,
      messages: [{ role: 'assistant', content: say.slice(0, 600) }],
      audio: { format: 'wav', voice },
    })
    if (!r.ok) {
      lastFail = r
      continue
    }
    const data = r.json?.choices?.[0]?.message?.audio?.data
    if (!data) {
      lastFail = { ok: false, status: 502, error: 'mimo_tts_empty', body: 'TTS 没有返回音频。' }
      continue
    }
    return {
      ok: true,
      audioBase64: String(data),
      mime: 'audio/wav',
      voice,
    }
  }
  return lastFail || { ok: false, status: 502, error: 'mimo_tts_failed', body: '语音合成失败。' }
}

/**
 * Chat then TTS. TTS failure still returns the answer (audioBase64 null).
 * @param {{ question: string, history?: { role: string, content: string }[] }} opts
 */
export async function mimoAsk(opts) {
  const chat = await mimoChat(opts)
  if (!chat.ok) return chat
  const tts = await mimoTts(chat.answer)
  if (!tts.ok) {
    return {
      ok: true,
      answer: chat.answer,
      audioBase64: null,
      mime: 'audio/wav',
      voice: null,
      model: chat.model,
      ttsError: tts.body,
    }
  }
  return {
    ok: true,
    answer: chat.answer,
    audioBase64: tts.audioBase64,
    mime: tts.mime,
    voice: tts.voice,
    model: chat.model,
  }
}
