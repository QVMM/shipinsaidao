/** Local evidence engine for DJTK assistant; contains no external model client. */

import { DEFAULT_BATCH_ID, getBatch } from './db.js'
import { computeVerdict, issuanceGate } from '../src/lib/verdict.js'

const REQUIRED_OPENING_REPLY = '对近一个月出口鸡肉安全信息搜集分析，发现某海关中心查验多批次出口鸡肉氟苯尼考兽药残留超标问题，相关产品依法退市，造成约 10 万吨订单缺口。'
const REQUIRED_RESULT_REPLY = '已完成结果审核，并对标高品质鸡肉三维评价体系做出判定，大蓟替抗鸡肉抽检样品全部合格。'
const REQUIRED_CLOSING_REPLY = '屏幕之外可能是素未谋面的陌生人，也可能是我们的家人；感谢替抗蓟化团队，以技能筑牢安全防线，护航中国高品质鸡肉走向世界餐桌。'

const DJTK_RX_BAN =
  /可以合规使用|可以使用氟苯|推荐使用兽药|休药期后(?:可用|用药)?|推荐用药|可以用药|氟苯尼考可以|剂量建议|开具处方|兽药处方|用药剂量/
const DJTK_SAFE_REFUSE =
  '本助手不做用药处方，只根据平台检测与批次记录说明本批情况。请打开检测或焦点档案查看平台记录。'

/**
 * Post-filter: strip prescription-style / banned medication phrasing.
 * Preserves refusal wording and blocks unsafe claims.
 * @param {string} answer
 * @param {object} [evidence]
 */
export function sanitizeDjtkAnswer(answer, evidence) {
  const raw = String(answer || '').trim()
  if (!raw) return DJTK_SAFE_REFUSE
  // Already a refusal — keep as-is.
  if (/不做用药处方/.test(raw)) return raw
  if (DJTK_RX_BAN.test(raw)) {
    return DJTK_SAFE_REFUSE
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
 * Intentional local evidence reply for booth chips / common intents (speed path).
 * Grounded ONLY in evidence; model label is local-evidence.
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

  if (/出口鸡肉安全/.test(q) && /大数据平台|政务公开数据平台|海关中心/.test(q) && /风险排查/.test(q)) {
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
    return ok('海关中心政务公开数据平台采用在线更新、本地保留的接入策略，最近一次核验快照可在网络不可用时继续用于确定排查重点。当前批次是否上市，仍以养殖记录、安全检测、健康评价、检测报告与追溯记录为准。')
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
 * Complete local assistant reply. Common questions use the focused evidence
 * templates above; unmatched questions receive a concise product-level answer
 * that never leaves the server and never invents records.
 * @param {string} question
 * @param {object} [evidence]
 * @returns {{ answer: string, fast: boolean, local: true }}
 */
export function buildLocalAnswer(question, evidence) {
  const focused = buildFastAnswer(question, evidence)
  if (focused?.answer) return { ...focused, local: true }

  const q = String(question || '').trim()
  const ev = evidence && typeof evidence === 'object' ? evidence : {}
  const batch = String(ev?.batchId || '').trim()
  const metrics = ev?.eval || {}

  if (/水分|嫩度|剪切|pH|ph|保水/.test(q)) {
    const bits = []
    if (metrics.moisture !== '' && metrics.moisture != null) bits.push(`水分 ${metrics.moisture}%`)
    if (metrics.tenderness !== '' && metrics.tenderness != null) bits.push(`剪切力 ${metrics.tenderness} N`)
    if (metrics.pH !== '' && metrics.pH != null) bits.push(`pH ${metrics.pH}`)
    if (metrics.waterHolding !== '' && metrics.waterHolding != null) bits.push(`保水性 ${metrics.waterHolding}%`)
    return {
      answer: bits.length
        ? `${batch ? `批次 ${batch} 的` : ''}肉质品质记录为：${bits.join('，')}。请结合炎症、菌群与检测报告共同研判。`
        : '平台尚无可引用的肉质水分、剪切力、pH 或保水性记录，请打开健康评价核对。',
      fast: true,
      local: true,
    }
  }

  const subject = batch ? `批次 ${batch}` : '当前焦点批次'
  return {
    answer: `本平台围绕${subject}串联养殖、检测、健康评价、报告与追溯记录。可继续询问来源、安全状态、肉质指标、风险或下一步操作，回答只引用本地可核验证据。`,
    fast: false,
    local: true,
  }
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
