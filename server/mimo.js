/**
 * Xiaomi MIMO Token Plan (OpenAI-compatible).
 * Key usage lives only here. Never log the key.
 */

import { DEFAULT_BATCH_ID, getBatch } from './db.js'

const DEFAULT_BASE = 'https://token-plan-cn.xiaomimimo.com/v1'
const CHAT_MODELS = ['mimo-v2.5', 'mimo-v2.5-pro']
const TTS_MODEL = 'mimo-v2.5-tts'
const TTS_VOICES = ['茉莉', 'mimo_default']
const MIMO_TIMEOUT_MS = 12_000
const MAX_COMPLETION_TOKENS = 320

export const DJTK_SYSTEM_PROMPT = [
  'You are DJTK智控助手 for 替抗蓟化减抗鸡肉全链条质控与溯源平台.',
  'Answer in plain Chinese, 2 to 4 short spoken sentences suitable for TTS.',
  'No markdown, no bullet lists, no blank lines, no English UI labels.',
  'Use 基地-A07 style names OK; never invent real cities or school names.',
  'ONLY claim florfenicol / 兽药残留 / 安全 / 合格 from the EVIDENCE JSON; if a field is missing say 平台尚无该检测记录.',
  'Do not invent zeros, concentrations, or「抗生素归零」unless evidence explicitly supports it.',
  'Cover origin/safety/next step when relevant.',
  'Guide next clicks: 指挥舱焦点档案、检测、评价、出证、溯源；do not invent shopping buttons.',
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
 * Compact evidence pack for the system prompt (no secrets).
 * @param {string} [batchId]
 */
export function buildDjtkEvidence(batchId) {
  const id = String(batchId || DEFAULT_BATCH_ID || '').trim() || DEFAULT_BATCH_ID
  const full = getBatch(id)
  if (!full) {
    return { batchId: id, missing: true, note: '平台尚无该批次记录' }
  }
  const farm = full.farm || {}
  const screen = full.screen || {}
  const ev = full.eval || {}
  const samples = Array.isArray(screen.samples)
    ? screen.samples.slice(0, 6).map((s) => ({
      id: s.id,
      group: s.group,
      qualitative: s.qualitative,
      result: s.result,
    }))
    : []
  return {
    batchId: full.batchId,
    farm: {
      name: farm.name || '',
      location: farm.location || '',
      house: farm.house || '',
      breed: farm.breed || '',
      additive: farm.additive || '',
      dose: farm.dose || '',
      count: farm.count ?? '',
      stockDate: farm.stockDate || '',
      plannedSlaughter: farm.plannedSlaughter || '',
      feedAntibioticNote: (farm.medLog || []).find((r) => /饲用抗生素/.test(String(r.item || '')))?.result || '',
    },
    screen: {
      target: screen.target || '',
      qualitative: screen.qualitative || '',
      result: screen.result || '',
      valueText: screen.valueText || '',
      valueNum: screen.valueNum ?? '',
      unit: screen.unit || '',
      lod: screen.lod ?? '',
      sampleDate: screen.sampleDate || '',
      samples,
    },
    eval: {
      valueText: ev.valueText || '',
      lod: ev.lod ?? '',
      unit: ev.unit || '',
      testDate: ev.testDate || '',
    },
    report: {
      generated: !!full.report?.generated,
      no: full.report?.no || '',
    },
    trace: {
      generated: !!full.trace?.generated,
      verifyId: full.trace?.verifyId || '',
    },
    nextStepHint: '指挥舱焦点档案 → 检测 → 评价 → 出证 → 溯源',
  }
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
      signal: AbortSignal.timeout(MIMO_TIMEOUT_MS),
    })
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError'
    return {
      ok: false,
      status: timedOut ? 504 : 502,
      error: timedOut ? 'mimo_timeout' : 'mimo_network',
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
 * Client may forge assistant turns — only keep user lines.
 * @param {unknown} history
 */
function sanitizeHistory(history) {
  return (Array.isArray(history) ? history : [])
    .filter((m) => m && m.role === 'user' && String(m.content || '').trim())
    .slice(-6)
    .map((m) => ({ role: 'user', content: String(m.content).trim().slice(0, 200) }))
}

/**
 * @param {{ question: string, history?: { role: string, content: string }[], batchId?: string, evidence?: object }} opts
 * @returns {Promise<{ ok: true, answer: string, model: string } | { ok: false, status: number, error: string, body: string }>}
 */
export async function mimoChat({ question, history = [], batchId, evidence } = {}) {
  const q = String(question || '').trim()
  if (!q) {
    return { ok: false, status: 400, error: 'invalid', body: '请先输入问题。' }
  }
  const pack = evidence || buildDjtkEvidence(batchId)
  const system = [
    DJTK_SYSTEM_PROMPT,
    'EVIDENCE JSON (authoritative; do not invent beyond it):',
    JSON.stringify(pack),
  ].join('\n')

  const messages = [
    { role: 'system', content: system },
    ...sanitizeHistory(history),
    { role: 'user', content: q.slice(0, 200) },
  ]

  let lastFail = null
  for (const model of CHAT_MODELS) {
    const r = await postCompletions({
      model,
      messages,
      temperature: 0.35,
      max_tokens: MAX_COMPLETION_TOKENS,
    })
    if (!r.ok) {
      lastFail = r
      continue
    }
    const answer = String(r.json?.choices?.[0]?.message?.content || '')
      .replace(/\n{2,}/g, '\n')
      .trim()
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
      messages: [{ role: 'assistant', content: say.slice(0, 400) }],
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
 * Chat then optional TTS. Prefer speak:false + separate /tts to avoid huge payloads.
 * @param {{ question: string, history?: { role: string, content: string }[], batchId?: string, speak?: boolean }} opts
 */
export async function mimoAsk(opts = {}) {
  const speak = opts.speak !== false
  const chat = await mimoChat(opts)
  if (!chat.ok) return chat
  if (!speak) {
    return {
      ok: true,
      answer: chat.answer,
      audioBase64: null,
      mime: 'audio/wav',
      voice: null,
      model: chat.model,
    }
  }
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
