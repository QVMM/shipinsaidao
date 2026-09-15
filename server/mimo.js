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
  '【产品定位 / Product】本产品是「大蓟替抗 / 减抗鸡肉」质控溯源助手，不是兽医处方助手。This product is 大蓟替抗 / 减抗鸡肉 — NEVER say 氟苯尼考可以合规使用 / 可以用药 / 推荐用药 / 休药期后可用 / dosage / prescription advice.',
  '【硬禁用药处方】不得回答氟苯尼考可否合规使用、剂量、休药期后可否用、推荐兽药等。For medication / florfenicol / antibiotic how-to questions: refuse —「本助手不做用药处方，只根据平台检测与批次记录说明本批情况。」Only state platform evidence about THIS batch (e.g. screen.qualitative 阴性/未检出, medLog feed-antibiotic note).',
  '【安全表述必须举证】Safety / 合格 / 未检出 claims MUST cite evidence fields (screen.qualitative / result / report.no). No bare「各项均符合标准」. When evidence has screen.qualitative、result、report.no, briefly mention them in safety answers.',
  'ONLY claim florfenicol / 兽药残留 / 安全 / 合格 from the EVIDENCE JSON; if a field is missing say 平台尚无该检测记录.',
  'Do not invent zeros, concentrations, or「抗生素归零」unless evidence explicitly supports it.',
  'If unsure / no evidence: refuse clearly — do not guess.',
  'Cover origin/safety/next step when relevant.',
  'Guide next clicks: 指挥舱焦点档案、检测、评价、出证、溯源；do not invent shopping buttons.',
  'First answers should help: 鸡从哪来、安不安全、下一步点哪里.',
].join(' ')

const DJTK_RX_BAN =
  /可以合规使用|可以使用氟苯|推荐使用兽药|休药期后(?:可用|用药)?|推荐用药|可以用药|氟苯尼考可以|剂量建议|开具处方|兽药处方|用药剂量/
const DJTK_SAFE_REFUSE =
  '本助手不做用药处方，只根据平台检测与批次记录说明本批情况。请打开检测或焦点档案查看平台记录。'

/**
 * Post-filter: strip prescription-style / banned medication phrasing.
 * Preserves 【降级·未连模型】 prefix and existing refuse wording.
 * @param {string} answer
 * @param {object} [evidence]
 */
export function sanitizeDjtkAnswer(answer, evidence) {
  const raw = String(answer || '').trim()
  if (!raw) return DJTK_SAFE_REFUSE
  // Already a refuse / degraded refuse — keep as-is (do not strip prefix)
  if (/不做用药处方/.test(raw)) return raw
  if (DJTK_RX_BAN.test(raw)) {
    const prefix = raw.startsWith('【降级·未连模型】') ? '【降级·未连模型】' : ''
    return `${prefix}${DJTK_SAFE_REFUSE}`
  }
  // Bare unqualified safety claim without citing evidence fields → soften if no evidence
  const hasCite =
    evidence &&
    (String(evidence?.screen?.qualitative || '') ||
      String(evidence?.screen?.result || '') ||
      String(evidence?.report?.no || ''))
  if (/各项均符合标准/.test(raw) && !hasCite) {
    return '平台证据不足，无法笼统宣称各项均符合标准。请打开检测或焦点档案查看本批记录。'
  }
  return raw
}

/**
 * Local degraded answer when MIMO is unavailable. Never invent 合格/未检出/可食用/可用药
 * unless evidence has explicit qualitative/result.
 * @param {string} question
 * @param {object} [evidence]
 * @returns {{ answer: string, degraded: true }}
 */
export function buildDegradedAnswer(question, evidence) {
  const q = String(question || '').trim()
  const ev = evidence && typeof evidence === 'object' ? evidence : {}
  const qualitative = String(ev?.screen?.qualitative || '').trim()
  const result = String(ev?.screen?.result || '').trim()
  const reportNo = String(ev?.report?.no || '').trim()
  const feedNote = String(ev?.farm?.feedAntibioticNote || '').trim()
  const prefix = '【降级·未连模型】'

  if (/氟苯|用药|兽药|剂量|处方|怎么用|如何用|合规使用|休药/.test(q)) {
    return { answer: `${prefix}${DJTK_SAFE_REFUSE}`, degraded: true }
  }

  const parts = [prefix]
  if (/哪|来|产地|基地|从/.test(q)) {
    const farm = ev?.farm?.name || ev?.farm?.location || ''
    const batch = ev?.batchId || ''
    if (farm || batch) {
      parts.push(
        `据平台批次记录${batch ? `（${batch}）` : ''}：${farm ? `关联 ${farm}` : '请打开焦点档案查看基地与鸡舍'}。`,
      )
    } else {
      parts.push('请打开检测/焦点档案查看平台记录。')
    }
    return { answer: parts.join(''), degraded: true }
  }

  if (/安全|合格|残留|上桌|放心|检出|食用/.test(q)) {
    if (qualitative || result) {
      const bits = []
      if (qualitative) bits.push(`筛查定性 ${qualitative}`)
      if (result) bits.push(`结果 ${result}`)
      if (reportNo) bits.push(`报告号 ${reportNo}`)
      if (feedNote) bits.push(`饲用抗生素记录 ${feedNote}`)
      parts.push(`本批平台证据：${bits.join('，')}。其余请打开检测/焦点档案核对。`)
    } else {
      parts.push('请打开检测/焦点档案查看平台记录。本助手在未连模型时不臆断合格或未检出。')
    }
    return { answer: parts.join(''), degraded: true }
  }

  if (/下一步|点哪|操作|去哪/.test(q)) {
    parts.push(String(ev?.nextStepHint || '指挥舱焦点档案 → 检测 → 评价 → 出证 → 溯源'))
    parts.push('。模型暂不可用，请以界面节点为准。')
    return { answer: parts.join(''), degraded: true }
  }

  parts.push('请打开检测/焦点档案查看平台记录。')
  return { answer: parts.join(''), degraded: true }
}


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
    const rawAnswer = String(r.json?.choices?.[0]?.message?.content || '')
      .replace(/\n{2,}/g, '\n')
      .trim()
    if (!rawAnswer) {
      lastFail = { ok: false, status: 502, error: 'mimo_empty', body: '模型没有返回文字。' }
      continue
    }
    const answer = sanitizeDjtkAnswer(rawAnswer, pack)
    return { ok: true, answer, model, evidence: pack }
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
  const answer = sanitizeDjtkAnswer(chat.answer, chat.evidence)
  if (!speak) {
    return {
      ok: true,
      answer,
      audioBase64: null,
      mime: 'audio/wav',
      voice: null,
      model: chat.model,
    }
  }
  const tts = await mimoTts(answer)
  if (!tts.ok) {
    return {
      ok: true,
      answer,
      audioBase64: null,
      mime: 'audio/wav',
      voice: null,
      model: chat.model,
      ttsError: tts.body,
    }
  }
  return {
    ok: true,
    answer,
    audioBase64: tts.audioBase64,
    mime: tts.mime,
    voice: tts.voice,
    model: chat.model,
  }
}
