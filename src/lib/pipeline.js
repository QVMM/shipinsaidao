/**
 * 体系管线：每批只有一个 currentStage。指挥舱看体系，操作台看焦点。
 */
import { lowInflammation, residueClear } from './verdict.js'

export const PIPELINE = [
  { stage: 'farming', label: '养殖中', short: '在养', kpi: 'inFarm' },
  { stage: 'screening', label: '检测中', short: '检测', kpi: 'inLab' },
  { stage: 'evaluating', label: '评价中', short: '评价', kpi: 'inLab' },
  { stage: 'reporting', label: '待出证', short: '出证', kpi: 'certified' },
  { stage: 'tracing', label: '已出码', short: '出码', kpi: 'certified' },
  { stage: 'market', label: '已上市', short: '上市', kpi: 'onMarket' },
]

export const ALERT_META = { stage: 'alert', label: '预警', short: '预警', kpi: 'alerts' }

export const SPOTLIGHT_ID = '蓟化-2026-0812'

/**
 * @param {unknown} v
 * @returns {boolean}
 */
export function filled(v) {
  return v !== '' && v != null
}

/**
 * @param {object} batch
 * @returns {boolean}
 */
export function hasScreenResult(batch) {
  const q = batch.screen?.qualitative
  const r = String(batch.screen?.result || '').trim()
  return q === '阴性' || q === '阳性' || q === '无效' || r.length > 0
}

/**
 * @param {object} batch
 * @returns {boolean}
 */
export function hasScreenStarted(batch) {
  return filled(batch.screen?.sampleDate) || hasScreenResult(batch)
}

/**
 * @param {object} batch
 * @returns {boolean}
 */
export function hasEvalData(batch) {
  const e = batch.eval || {}
  return filled(e.IL6) || filled(e.IL1b) || filled(e.TNFa) || filled(e.CRP)
}

/**
 * 阳性或炎症偏高才进预警。没检过的在养批次不算。
 * @param {object} batch
 * @returns {boolean}
 */
export function isAlert(batch) {
  if (batch.screen?.qualitative === '无效') return true
  if (hasScreenResult(batch) && !residueClear(batch)) return true
  if (hasEvalData(batch) && filled(batch.eval?.IL6) && filled(batch.eval?.IL6Ctrl) && !lowInflammation(batch)) {
    return true
  }
  return false
}

/**
 * @param {object} batch
 * @returns {string}
 */
export function deriveStage(batch) {
  if (isAlert(batch)) return 'alert'
  const forced = batch.program?.pipelineStage
  if (forced && (forced === 'alert' || PIPELINE.some((p) => p.stage === forced))) return forced
  if (batch.trace?.generated && batch.report?.generated) {
    if (batch.program?.listed) return 'market'
    if (batch.batchId === SPOTLIGHT_ID) return 'market'
    return 'tracing'
  }
  if (hasEvalData(batch) || batch.report?.generated) return 'reporting'
  if (hasScreenResult(batch)) return 'evaluating'
  if (hasScreenStarted(batch)) return 'screening'
  return 'farming'
}

/**
 * 预警批仍落在出问题的工位上，不另开第七站。
 * @param {object} batch
 * @param {string} [stage]
 * @returns {string}
 */
export function stationOf(batch, stage) {
  const st = stage || deriveStage(batch)
  if (st !== 'alert') return st
  if (hasScreenResult(batch) && !residueClear(batch)) return 'screening'
  return 'evaluating'
}

/**
 * @param {string} stage
 * @returns {string}
 */
export function stageLabel(stage) {
  if (stage === 'alert') return ALERT_META.label
  return PIPELINE.find((p) => p.stage === stage)?.label || stage
}

/**
 * 队列 / 胶囊上的一句结果。
 * @param {object} batch
 * @param {string} stage
 * @returns {string}
 */
export function resultOf(batch, stage) {
  if (stage === 'alert') {
    if (batch.screen?.qualitative === '无效') return '筛查无效'
    if (hasScreenResult(batch) && !residueClear(batch)) return '氟苯尼考阳性'
    return '炎症偏高'
  }
  if (stage === 'farming') return '养殖中'
  if (stage === 'screening') return hasScreenResult(batch) ? (batch.screen.result || batch.screen.qualitative) : '检测中'
  if (stage === 'evaluating') return batch.screen?.result || '评价中'
  if (stage === 'reporting') return '待出证'
  if (stage === 'tracing') return batch.trace?.verifyId || '已出码'
  if (stage === 'market') return '已上市'
  return stageLabel(stage)
}

/**
 * @param {object[]} items
 * @param {(row: object) => number} pick
 * @returns {number | null}
 */
export function meanOf(items, pick) {
  const xs = items.map(pick).filter((n) => Number.isFinite(n))
  if (!xs.length) return null
  return Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100
}

/**
 * @param {unknown} v
 * @returns {number}
 */
export function asNum(v) {
  if (v === '' || v == null) return NaN
  const n = Number(v)
  return Number.isFinite(n) ? n : NaN
}
