/**
 * 指挥舱全流程节点规则。服务端 / 前端共用，避免各写一遍。
 */
import {
  computeVerdict,
  fedThistle,
  humanHeadline,
  humanWhy,
  lowInflammation,
  noFeedAntibiotic,
  residueClear,
} from './verdict.js'

export const STAGE_SCENES = [
  { id: 'feed', label: '饲料+大蓟' },
  { id: 'farm', label: '养殖' },
  { id: 'screen', label: '安全检测' },
  { id: 'eval', label: 'HPLC/健康评价' },
  { id: 'report', label: '检测报告' },
  { id: 'trace', label: '追溯码' },
  { id: 'market', label: '上市' },
]

/**
 * 快检节点：结果是未检出或阴性才算亮。
 * @param {object} state
 * @returns {boolean}
 */
export function screenSceneDone(state) {
  const q = state.screen?.qualitative === '阴性'
  const text = String(state.screen?.result || '').includes('未检出')
  return q || text
}

/**
 * 节点上那一个关键数。
 * @param {string} id
 * @param {object} data
 * @returns {string}
 */
export function nodeMetric(id, data) {
  const farm = data.farm || {}
  const screen = data.screen || {}
  const ev = data.eval || {}
  switch (id) {
    case 'feed':
      return farm.dose || '—'
    case 'farm':
      return farm.count !== '' && farm.count != null ? `${farm.count} 羽` : '—'
    case 'screen':
      return screen.result || screen.qualitative || '—'
    case 'eval':
      return ev.curveR !== '' && ev.curveR != null ? `R²=${ev.curveR}` : '—'
    case 'report':
      return data.report?.no || '未出证'
    case 'trace':
      return data.trace?.verifyId || '未出码'
    case 'market':
      return data.report?.generated && data.trace?.generated ? '已放行' : '待放行'
    default:
      return '—'
  }
}

/**
 * @param {object} data
 * @param {{ pass: boolean }} verdict
 * @returns {string}
 */
export function buildTicker(data, verdict) {
  const p = data.program || {}
  const bits = [
    `累计出栏 ${p.birds || '≥10万羽'}`,
    `公益快检 ${p.charityTests || '3000+'}`,
    `料肉比下降 ${p.fcrDrop || '≥0.05'}`,
    `死淘下降 ${p.mortDrop || '≥2个百分点'}`,
    `覆盖市场 ${p.markets ?? 12}`,
    `批次 ${data.batchId || ''}`,
    data.farm?.name || '',
    data.farm?.count != null && data.farm?.count !== '' ? `${data.farm.count}羽` : '',
    `氟苯尼考 ${data.screen?.result || '—'}`,
    `判定 ${humanHeadline(verdict)}`,
  ]
  return bits.filter(Boolean).join('   ·   ')
}

function clampScore(n) {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n)))
}

/**
 * 越低于对照越高分。r=0 → 100，r=1 → 40。
 * @param {unknown} value
 * @param {unknown} control
 * @returns {number}
 */
function lowIsGoodScore(value, control) {
  const v = Number(value)
  const c = Number(control)
  if (!Number.isFinite(v) || !Number.isFinite(c) || c <= 0) return 40
  return clampScore(40 + (1 - v / c) * 80)
}

/**
 * 焦点四维：残留 / 炎症对照 / 料肉比与死淘 / 出证出码。仍是 0–100，按实数算。
 * @param {object} data
 * @param {{ pass: boolean }} [verdict]
 * @returns {{ name: string, value: number }[]}
 */
export function buildRings(data, verdict) {
  const farm = data.farm || {}
  const ev = data.eval || {}
  const v = verdict || computeVerdict(data)
  const residue = residueClear(data)
    ? clampScore(70
      + (data.screen?.qualitative === '阴性' ? 10 : 0)
      + (String(data.screen?.result || '').includes('未检出') ? 8 : 0)
      + (String(data.eval?.valueText || '').includes('未检出') ? 8 : 0))
    : 34
  const inflamParts = [
    [ev.IL1b, ev.IL1bCtrl],
    [ev.IL6, ev.IL6Ctrl],
    [ev.TNFa, ev.TNFaCtrl],
    [ev.CRP, ev.CRPCtrl],
  ].map(([a, b]) => lowIsGoodScore(a, b))
  const inflam = clampScore(inflamParts.reduce((n, x) => n + x, 0) / inflamParts.length)
  let quality = v.pass ? 68 : 38
  const fcr = Number(farm.fcr)
  const fcrC = Number(farm.fcrControl)
  const mort = Number(farm.mortality)
  const mortC = Number(farm.mortalityControl)
  if (Number.isFinite(fcr) && Number.isFinite(fcrC)) quality += (fcrC - fcr) / 0.05 * 10
  if (Number.isFinite(mort) && Number.isFinite(mortC)) quality += (mortC - mort) * 6
  const trace = (data.report?.generated ? 50 : 0) + (data.trace?.generated ? 50 : 0)
  return [
    { name: '低残留', value: residue },
    { name: '低炎症', value: inflam },
    { name: '高品质', value: clampScore(quality) },
    { name: '可追溯', value: trace },
  ]
}

/**
 * 把公开批次收成指挥舱要用的七步 + 人话结论。
 * @param {object} data getBatch / 公开批次形
 * @returns {object}
 */
export function buildStageView(data) {
  const verdict = computeVerdict(data)
  const scenes = {
    feed: fedThistle(data),
    farm: noFeedAntibiotic(data),
    screen: screenSceneDone(data),
    eval: lowInflammation(data),
    report: !!data.report?.generated,
    trace: !!data.trace?.generated,
    market: !!(data.report?.generated && data.trace?.generated && verdict.pass),
  }
  const order = STAGE_SCENES.map((s) => s.id)
  const firstIncomplete = order.findIndex((id) => !scenes[id])
  const activeIndex = firstIncomplete === -1 ? order.length - 1 : firstIncomplete
  const pathT = firstIncomplete === -1 ? 1 : (activeIndex + 0.5) / order.length
  const nodes = STAGE_SCENES.map((s, i) => {
    const done = !!scenes[s.id]
    const active = i === activeIndex
    return {
      id: s.id,
      label: s.label,
      done,
      active,
      metric: nodeMetric(s.id, data),
      status: done ? '已完成' : (active ? '进行中' : '待执行'),
    }
  })
  return {
    ...data,
    verdict: {
      pass: verdict.pass,
      headline: humanHeadline(verdict),
      why: humanWhy(data, verdict),
      stamp: verdict.stamp,
    },
    feedAntibiotic: noFeedAntibiotic(data) ? '未使用' : '有记录',
    rings: buildRings(data, verdict),
    ticker: buildTicker(data, verdict),
    scenes,
    nodes,
    active: order[activeIndex],
    activeIndex,
    pathT,
  }
}
