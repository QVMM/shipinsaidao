/**
 * Xiaomi MIMO Token Plan (OpenAI-compatible).
 * Key usage lives only here. Never log the key.
 */

import { DEFAULT_BATCH_ID, getBatch } from './db.js'
import { offlineMode } from './runtime.js'
import { computeVerdict, issuanceGate } from '../src/lib/verdict.js'

const DEFAULT_BASE = 'https://token-plan-cn.xiaomimimo.com/v1'
const CHAT_MODELS = [String(process.env.MIMO_CHAT_MODEL || 'mimo-v2.5').trim() || 'mimo-v2.5']
const TTS_MODEL = 'mimo-v2.5-tts'
const TTS_VOICES = ['茉莉', 'mimo_default']
const CHAT_TIMEOUT_MS = 10_000
const TTS_TIMEOUT_MS = 10_000
const CHAT_ATTEMPTS = 2
const RETRY_DELAY_MS = 120
const MAX_COMPLETION_TOKENS = 256
const REQUIRED_OPENING_REPLY = '对近一个月出口鸡肉安全信息搜集分析，发现某海关中心查验多批次出口鸡肉氟苯尼考兽药残留超标问题，相关产品依法退市，造成约 10 万吨订单缺口。'
const REQUIRED_RESULT_REPLY = '已完成结果审核，并对标高品质鸡肉三维评价体系做出判定，大蓟替抗鸡肉抽检样品全部合格。'
const REQUIRED_CLOSING_REPLY = '屏幕之外可能是素未谋面的陌生人，也可能是我们的家人；感谢替抗蓟化团队，以技能筑牢安全防线，护航中国高品质鸡肉走向世界餐桌。'

export const DJTK_SYSTEM_PROMPT = [
  'You are DJTK智控助手 for 替抗蓟化减抗鸡肉全链条质控与溯源平台.',
  'Answer in plain Chinese, 2 to 4 short spoken sentences suitable for TTS.',
  '回答不超过三句，优先短句。',
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
  'First answers should help: 鸡从哪来、安不安全、下一步点哪里、焦点批次风险、氟苯尼考筛查结果、待复核、法规与监管数据状态.',
  '【外部监管数据】当前离线实例没有实时海关或市场监管数据源。If asked about customs, regulation or public notices, state that no live external source is connected and never invent a notice.',
  '【筛查问法】For 氟苯尼考筛查结果: cite only evidence screen.qualitative / screen.result / report.no; never invent 阴性/合格; never give medication advice.',
  '【三维评价】肉质品质指标只引用 evidence.eval.moisture（水分%）、tenderness（剪切力N）、pH、waterHolding（保水性%）；与炎症、菌群共同构成评价证据，不可单项臆断放行。',
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
  if (/合格|准予上市|可以上桌|可上桌/.test(raw) && evidence?.verdict?.pass !== true) {
    const reasons = Array.isArray(evidence?.verdict?.reasons) ? evidence.verdict.reasons.filter(Boolean) : []
    const why = reasons.length ? `：${reasons.join('；')}` : ''
    return `当前批次尚未达到出证条件${why}。请以平台判定条和原始记录为准。`
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

  if (/海关|监管|法规|政务公开/.test(q)) {
    return {
      answer: `${prefix}当前离线实例未接入实时外部监管数据。请在“法规与风险”页确认数据源状态；本批判断只依据平台内可核验记录。`,
      degraded: true,
    }
  }

  if (/氟苯|用药|兽药|剂量|处方|怎么用|如何用|合规使用|休药/.test(q)) {
    if (/筛查|结果|检出|残留|阴性|阳性/.test(q) && !/怎么用|如何用|剂量|处方|合规使用/.test(q)) {
      if (qualitative || result) {
        const bits = []
        if (qualitative) bits.push(`筛查定性 ${qualitative}`)
        if (result) bits.push(`结果 ${result}`)
        if (reportNo) bits.push(`报告号 ${reportNo}`)
        return {
          answer: `${prefix}本批平台氟苯尼考相关证据：${bits.join('，')}。本助手不做用药处方，其余请打开检测/焦点档案核对。`,
          degraded: true,
        }
      }
      return {
        answer: `${prefix}平台尚无明确筛查字段可引用。请打开安全检测或焦点档案查看本批记录。本助手不做用药处方。`,
        degraded: true,
      }
    }
    return { answer: `${prefix}${DJTK_SAFE_REFUSE}`, degraded: true }
  }

  if (/风险|待复核|复核/.test(q)) {
    const stamp = String(ev?.report?.stamp || ev?.verdict?.stamp || '').trim()
    const res = result || qualitative
    const bits = []
    if (ev?.batchId) bits.push(`批次 ${ev.batchId}`)
    if (stamp) bits.push(`印章 ${stamp}`)
    if (res) bits.push(`检测 ${res}`)
    if (bits.length) {
      return {
        answer: `${prefix}据平台记录：${bits.join('，')}。待复核与下一步请看焦点档案判定条；可打开安全检测或健康评价核对，勿臆造合格。`,
        degraded: true,
      }
    }
    return {
      answer: `${prefix}请看焦点档案判定条与报告印章是否为待复核；下一步可点安全检测或健康评价，以页面为准。`,
      degraded: true,
    }
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



/**
 * Intentional local evidence reply for booth chips / common intents (speed path).
 * Grounded ONLY in evidence; no 【降级·未连模型】 prefix; model label is local-evidence.
 * @param {string} question
 * @param {object} [evidence]
 * @returns {{ answer: string, fast: true } | null}
 */
export function buildFastAnswer(question, evidence) {
  const q = String(question || '').trim()
  if (!q) return null

  const ev = evidence && typeof evidence === 'object' ? evidence : {}
  const qualitative = String(ev?.screen?.qualitative || '').trim()
  const result = String(ev?.screen?.result || '').trim()
  const reportNo = String(ev?.report?.no || '').trim()
  const feedNote = String(ev?.farm?.feedAntibioticNote || '').trim()
  const farmName = String(ev?.farm?.name || '').trim()
  const farmLoc = String(ev?.farm?.location || '').trim()
  const house = String(ev?.farm?.house || '').trim()
  const breed = String(ev?.farm?.breed || '').trim()
  const batch = String(ev?.batchId || '').trim()
  const nextHint = String(ev?.nextStepHint || '指挥舱焦点档案 → 检测 → 评价 → 出证 → 溯源').trim()

  const ok = (answer) => ({ answer, fast: true })

  if (/出口鸡肉安全/.test(q) && /大数据平台/.test(q) && /风险排查/.test(q)) {
    return ok(REQUIRED_OPENING_REPLY)
  }

  if (/质检结果已出/.test(q) && /样品结果判定/.test(q)) {
    if (ev?.verdict?.pass === true) return ok(REQUIRED_RESULT_REPLY)
    const reasons = Array.isArray(ev?.verdict?.reasons) ? ev.verdict.reasons.filter(Boolean) : []
    return ok(`已完成结果审核，当前批次尚未达到出证条件${reasons.length ? `：${reasons.join('；')}` : ''}。请完成复核后再作最终判定。`)
  }

  if (/大蓟替抗\s*高品质鸡肉解决方案\s*技能展示完成/.test(q)) {
    return ok(REQUIRED_CLOSING_REPLY)
  }

  if (/海关|监管|法规|政务公开/.test(q)) {
    return ok('当前离线实例未接入实时外部监管数据。请在“法规与风险”页确认数据源状态；本批判断只依据平台内可核验记录。')
  }

  // Medication how-to → refuse (do not invent 合格/用药处方)
  if (/氟苯|用药|兽药|剂量|处方|怎么用|如何用|合规使用|休药/.test(q)) {
    const isScreenAsk = /筛查|结果|检出|残留|阴性|阳性/.test(q) && !/怎么用|如何用|剂量|处方|合规使用/.test(q)
    if (isScreenAsk) {
      if (qualitative || result) {
        const bits = []
        if (qualitative) bits.push(`筛查定性 ${qualitative}`)
        if (result) bits.push(`结果 ${result}`)
        if (reportNo) bits.push(`报告号 ${reportNo}`)
        return ok(`本批平台氟苯尼考相关证据：${bits.join('，')}。本助手不做用药处方，详情请打开检测或焦点档案核对。`)
      }
      return ok('平台尚无明确筛查字段可引用。请打开安全检测或焦点档案查看本批记录。本助手不做用药处方。')
    }
    return ok(DJTK_SAFE_REFUSE)
  }

  // 待复核
  if (/待复核|复核/.test(q)) {
    const stamp = String(ev?.report?.stamp || ev?.verdict?.stamp || '').trim()
    const res = result || qualitative
    const bits = []
    if (batch) bits.push(`批次 ${batch}`)
    if (stamp) bits.push(`印章 ${stamp}`)
    if (res) bits.push(`检测 ${res}`)
    if (bits.length) {
      return ok(`据平台记录：${bits.join('，')}。待复核请看焦点档案判定条；可打开安全检测或健康评价核对。`)
    }
    return ok('请看焦点档案判定条与报告印章是否为待复核；下一步可点安全检测或健康评价，以页面为准。')
  }

  // 焦点 / 风险
  if (/焦点|风险/.test(q)) {
    const bits = []
    if (batch) bits.push(`焦点批次 ${batch}`)
    if (qualitative || result) bits.push(`筛查 ${qualitative || result}`)
    if (reportNo) bits.push(`报告 ${reportNo}`)
    if (bits.length) {
      return ok(`${bits.join('，')}。风险与下一步请看焦点档案判定条，勿臆造合格。`)
    }
    return ok('请打开焦点档案查看当前批次判定与风险提示，以页面记录为准。')
  }

  // 从哪来 / 基地 / 鸡舍 / 品种
  if (/从哪来|哪来|产地|基地|鸡舍|品种|从哪/.test(q) || (/哪|来|从/.test(q) && /鸡|批/.test(q))) {
    const bits = []
    if (batch) bits.push(`批次 ${batch}`)
    if (farmName) bits.push(farmName)
    if (farmLoc) bits.push(farmLoc)
    if (house) bits.push(house)
    if (breed) bits.push(`品种 ${breed}`)
    if (bits.length) {
      return ok(`据平台批次记录：${bits.join('，')}。`)
    }
    return ok('请打开焦点档案查看基地、鸡舍与品种字段。')
  }

  // 安不安全 / 能上桌 / 合格
  if (/安全|合格|残留|上桌|放心|检出|食用/.test(q)) {
    if (qualitative || result) {
      const bits = []
      if (qualitative) bits.push(`筛查定性 ${qualitative}`)
      if (result) bits.push(`结果 ${result}`)
      if (reportNo) bits.push(`报告号 ${reportNo}`)
      if (feedNote) bits.push(`饲用抗生素记录 ${feedNote}`)
      return ok(`本批平台证据：${bits.join('，')}。其余请打开检测或焦点档案核对。`)
    }
    return ok('平台证据不足，无法笼统宣称合格或可上桌。请打开检测或焦点档案查看本批记录。')
  }

  // 下一步 / 点哪
  if (/下一步|点哪|操作|去哪/.test(q)) {
    return ok(`${nextHint}。请以界面节点为准。`)
  }

  return null
}

/**
 * Shrink evidence JSON for MIMO prompt (latency): drop empties, cap samples at 2.
 * @param {object} pack
 */
export function trimEvidenceForPrompt(pack) {
  if (!pack || typeof pack !== 'object') return pack
  const out = {}
  for (const [k, v] of Object.entries(pack)) {
    if (v == null || v === '') continue
    if (Array.isArray(v)) {
      if (!v.length) continue
      out[k] = v.slice(0, 2)
      continue
    }
    if (typeof v === 'object') {
      const nested = trimEvidenceForPrompt(v)
      if (nested && Object.keys(nested).length) out[k] = nested
      continue
    }
    out[k] = v
  }
  if (out.screen && Array.isArray(out.screen.samples) && out.screen.samples.length > 2) {
    out.screen.samples = out.screen.samples.slice(0, 2)
  }
  return out
}


export function mimoConfigured() {
  if (offlineMode()) return false
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
  const verdict = computeVerdict(full)
  const gate = issuanceGate(full)
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
      IL1b: ev.IL1b ?? '',
      IL1bCtrl: ev.IL1bCtrl ?? '',
      IL6: ev.IL6 ?? '',
      IL6Ctrl: ev.IL6Ctrl ?? '',
      TNFa: ev.TNFa ?? '',
      TNFaCtrl: ev.TNFaCtrl ?? '',
      CRP: ev.CRP ?? '',
      CRPCtrl: ev.CRPCtrl ?? '',
      moisture: ev.moisture ?? '',
      tenderness: ev.tenderness ?? '',
      pH: ev.pH ?? '',
      waterHolding: ev.waterHolding ?? '',
    },
    report: {
      generated: !!full.report?.generated,
      no: full.report?.no || '',
    },
    trace: {
      generated: !!full.trace?.generated,
      verifyId: full.trace?.verifyId || '',
    },
    review: {
      reviewed: !!full.review?.reviewed,
      reviewer: full.review?.reviewer || '',
      reviewedAt: full.review?.reviewedAt || '',
    },
    verdict: {
      pass: verdict.pass,
      label: verdict.label,
      stamp: verdict.stamp,
      reasons: gate.reasons,
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
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<{ ok: true, status: number, json: any } | { ok: false, status: number, error: string, body: string }>}
 */
async function postCompletions(body, { timeoutMs = CHAT_TIMEOUT_MS } = {}) {
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
      signal: AbortSignal.timeout(timeoutMs),
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

function retryableChatFailure(result) {
  if (!result || result.ok) return false
  if (result.error === 'mimo_timeout' || result.error === 'mimo_network' || result.error === 'mimo_empty') {
    return true
  }
  return result.error === 'mimo_http' && (result.status === 408 || result.status === 429 || result.status >= 500)
}

function wait(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
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
 * @returns {Promise<{ ok: true, answer: string, model: string, attempts: number } | { ok: false, status: number, error: string, body: string, attempts?: number }>}
 */
export async function mimoChat({ question, history = [], batchId, evidence } = {}) {
  const q = String(question || '').trim()
  if (!q) {
    return { ok: false, status: 400, error: 'invalid', body: '请先输入问题。' }
  }
  const pack = evidence || buildDjtkEvidence(batchId)
  const promptPack = trimEvidenceForPrompt(pack)
  const system = [
    DJTK_SYSTEM_PROMPT,
    'EVIDENCE JSON (authoritative; do not invent beyond it):',
    JSON.stringify(promptPack),
  ].join('\n')

  const messages = [
    { role: 'system', content: system },
    ...sanitizeHistory(history),
    { role: 'user', content: q.slice(0, 200) },
  ]

  let lastFail = null
  let attempts = 0
  for (const model of CHAT_MODELS) {
    for (let attempt = 1; attempt <= CHAT_ATTEMPTS; attempt += 1) {
      attempts += 1
      const r = await postCompletions({
        model,
        messages,
        temperature: 0.2,
        thinking: { type: 'disabled' },
        max_completion_tokens: MAX_COMPLETION_TOKENS,
      })
      if (!r.ok) {
        lastFail = { ...r, attempts }
      } else {
        const rawAnswer = String(r.json?.choices?.[0]?.message?.content || '')
          .replace(/\n{2,}/g, '\n')
          .trim()
        if (rawAnswer) {
          const answer = sanitizeDjtkAnswer(rawAnswer, pack)
          return { ok: true, answer, model, evidence: pack, attempts }
        }
        lastFail = { ok: false, status: 502, error: 'mimo_empty', body: '模型没有返回文字。', attempts }
      }
      if (attempt < CHAT_ATTEMPTS && retryableChatFailure(lastFail)) {
        await wait(RETRY_DELAY_MS)
        continue
      }
      break
    }
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
    }, { timeoutMs: TTS_TIMEOUT_MS })
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
      attempts: chat.attempts,
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
      attempts: chat.attempts,
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
    attempts: chat.attempts,
  }
}
