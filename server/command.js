/**
 * 公开指挥舱：体系 KPI + 漏斗 + 队列 + 焦点档案。不需登录。
 */
import { DEFAULT_BATCH_ID, getBatch, getPublicStage, listBatches, nowIso } from './db.js'
import { compactSeal, getSeal } from './seal.js'
import {
  ALERT_META,
  PIPELINE,
  SPOTLIGHT_ID,
  asNum,
  deriveStage,
  hasScreenResult,
  isAlert,
  meanOf,
  resultOf,
  stationOf,
} from '../src/lib/pipeline.js'
import { residueClear } from '../src/lib/verdict.js'
import { resolveHouseEnv, shanghaiYmd } from '../src/lib/house-env.js'

function birdsOf(batch) {
  const n = asNum(batch.farm?.count)
  return Number.isFinite(n) ? n : 0
}

function eventAt(v, fallbackHour = '08:00') {
  const s = String(v || '').trim()
  if (!s) return ''
  if (s.length >= 16) return s.slice(0, 16)
  if (s.length >= 10) return `${s.slice(0, 10)} ${fallbackHour}`
  return s
}

/**
 * @param {object} batch
 * @param {string} stage
 */
function eventsOf(batch, stage) {
  const id = batch.batchId
  const out = []
  const stock = eventAt(batch.farm?.stockDate, '07:30')
  if (stock) out.push({ at: stock, line: `${id} 入栏 ${birdsOf(batch)}羽 · ${batch.farm?.house || ''}` })
  if (batch.screen?.sampleDate) {
    if (hasScreenResult(batch) && !residueClear(batch)) {
      out.push({ at: eventAt(batch.screen.sampleDate), line: `${id} 氟苯尼考阳性预警` })
    } else if (hasScreenResult(batch) && residueClear(batch)) {
      out.push({ at: eventAt(batch.screen.sampleDate), line: `${id} 安全检测未检出` })
    } else {
      out.push({ at: eventAt(batch.screen.sampleDate), line: `${id} 进入安全检测` })
    }
  }
  const evalAt = batch.eval?.testDate || batch.screen?.hplcDate
  if (evalAt) {
    if (stage === 'alert' && residueClear(batch)) {
      out.push({ at: eventAt(evalAt, '15:00'), line: `${id} 炎症预警` })
    } else {
      out.push({ at: eventAt(evalAt, '15:00'), line: `${id} 炎症评价完成` })
    }
  }
  if (batch.report?.generated) {
    out.push({ at: eventAt(batch.report.generatedAt, '16:20'), line: `${id} 已出证 ${batch.report.no || ''}`.trim() })
  }
  if (batch.trace?.generated) {
    out.push({ at: eventAt(batch.trace.generatedAt, '16:40'), line: `${id} 已出码 ${batch.trace.verifyId || ''}`.trim() })
  }
  if (stage === 'market') {
    const at = eventAt(batch.trace?.generatedAt || batch.farm?.plannedSlaughter, '18:00')
    out.push({ at, line: `${id} 已上市` })
  }
  if (batch.batchId === SPOTLIGHT_ID) {
    out.push({
      at: eventAt(batch.eval?.testDate || batch.updatedAt, '14:40'),
      line: `${id} 焦点批次 合格准予上市`,
    })
  }
  return out.filter((e) => e.at && e.line)
}

function dayOf(batch) {
  const candidates = [
    batch.screen?.sampleDate,
    batch.screen?.hplcDate,
    batch.eval?.testDate,
    batch.updatedAt,
    batch.report?.generatedAt,
    batch.trace?.generatedAt,
  ]
  for (const c of candidates) {
    const d = String(c || '').slice(0, 10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d
  }
  return ''
}

function shiftIso(iso, delta) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + delta)
  const p = (n) => String(n).padStart(2, '0')
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`
}

function trendFrom(rows) {
  const today = shanghaiYmd().iso
  const dates = new Set([today])
  for (const row of rows) {
    const d = dayOf(row.batch)
    if (d) dates.add(d)
  }
  let days = [...dates].sort()
  while (days.length < 7) days.unshift(shiftIso(days[0] || today, -1))
  days = days.slice(-7)
  const map = new Map(days.map((d) => [d, { date: d.slice(5), screens: 0, clears: 0, alerts: 0 }]))
  for (const row of rows) {
    const raw = dayOf(row.batch)
    const bucket = map.get(raw)
    if (!bucket) continue
    if (hasScreenResult(row.batch) || row.batch.screen?.sampleDate) bucket.screens += 1
    if (hasScreenResult(row.batch) && residueClear(row.batch)) bucket.clears += 1
    if (row.stage === 'alert') bucket.alerts += 1
  }
  return {
    demo: false,
    label: '近七日筛查',
    note: '按入库批次日期滚动',
    days: days.map((d) => map.get(d)),
  }
}

/**
 * @returns {object}
 */
export function getPublicCommand() {
  const items = listBatches().map((row) => getBatch(row.batchId)).filter(Boolean)
  const rows = items.map((batch) => {
    const stage = deriveStage(batch)
    return {
      batch,
      stage,
      station: stationOf(batch, stage),
      alert: stage === 'alert' || isAlert(batch),
    }
  })

  const funnel = [
    ...PIPELINE.map((p) => {
      const hit = rows.filter((r) => r.stage === p.stage)
      return {
        stage: p.stage,
        label: p.label,
        count: hit.length,
        birds: hit.reduce((n, r) => n + birdsOf(r.batch), 0),
      }
    }),
    (() => {
      const hit = rows.filter((r) => r.stage === 'alert')
      return {
        stage: ALERT_META.stage,
        label: ALERT_META.label,
        count: hit.length,
        birds: hit.reduce((n, r) => n + birdsOf(r.batch), 0),
      }
    })(),
  ]

  const by = Object.fromEntries(funnel.map((f) => [f.stage, f]))
  const inLabRows = rows.filter((r) => r.station === 'screening' || r.station === 'evaluating')
  const inLabBirds = inLabRows.reduce((n, r) => n + birdsOf(r.batch), 0)
  /** 在栏羽 = 在养羽 + 在检羽（工位，含预警批）。与顶栏两枚芯片同一口径。 */
  const birdsLive = (by.farming?.birds || 0) + inLabBirds
  const screened = rows.filter((r) => hasScreenResult(r.batch))
  const cleared = screened.filter((r) => residueClear(r.batch))
  const detectRate = screened.length
    ? Math.round((cleared.length / screened.length) * 1000) / 10
    : 0
  const alertRows = rows.filter((r) => r.stage === 'alert')
  const posN = alertRows.filter((r) => hasScreenResult(r.batch) && !residueClear(r.batch)).length
  const inflamN = alertRows.length - posN
  const alertBits = []
  if (posN) alertBits.push('阳性')
  if (inflamN) alertBits.push('炎症')
  const alertNote = alertRows.length
    ? `${alertBits.join('/') || '预警'} ${alertRows.length} 批`
    : '无'

  const kpis = {
    inFarm: by.farming?.count || 0,
    inLab: inLabRows.length,
    inLabBirds,
    certified: (by.reporting?.count || 0) + (by.tracing?.count || 0),
    onMarket: by.market?.count || 0,
    alerts: by.alert?.count || 0,
    alertNote,
    birdsLive,
    detectRate,
  }

  const batches = rows.map((r) => ({
    batchId: r.batch.batchId,
    stage: r.stage,
    station: r.station,
    count: birdsOf(r.batch),
    base: r.batch.farm?.name || '',
    house: r.batch.farm?.house || '',
    result: resultOf(r.batch, r.stage),
    updatedAt: r.batch.updatedAt || '',
    spotlight: r.batch.batchId === SPOTLIGHT_ID,
    alert: r.alert,
  }))

  const rawEvents = rows
    .flatMap((r) => eventsOf(r.batch, r.stage))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
  const seen = new Set()
  const events = []
  for (const e of rawEvents) {
    const keep = e.line.includes('预警') || e.line.includes('安全检测')
    const key = keep ? e.line : e.line.split(' ')[0]
    if (seen.has(key) && !keep) continue
    seen.add(key)
    events.push(e)
    if (events.length >= 12) break
  }

  const spotlightId = items.some((b) => b.batchId === SPOTLIGHT_ID) ? SPOTLIGHT_ID : (DEFAULT_BATCH_ID || items[0]?.batchId || '')
  const spotlightFull = items.find((b) => b.batchId === spotlightId) || null
  const peers = rows.filter((r) => r.batch.batchId !== spotlightId && r.stage !== 'alert').map((r) => r.batch)

  const compare = {
    fcr: {
      spotlight: asNum(spotlightFull?.farm?.fcr),
      program: meanOf(peers, (b) => asNum(b.farm?.fcr)),
    },
    mortality: {
      spotlight: asNum(spotlightFull?.farm?.mortality),
      program: meanOf(peers, (b) => asNum(b.farm?.mortality)),
    },
    il6: {
      spotlight: asNum(spotlightFull?.eval?.IL6),
      program: meanOf(peers, (b) => asNum(b.eval?.IL6)),
      label: 'IL-6',
    },
  }
  for (const key of Object.keys(compare)) {
    if (!Number.isFinite(compare[key].spotlight)) compare[key].spotlight = null
  }

  const spotlightSeal = spotlightId ? compactSeal(getSeal(spotlightId)) : null
  return {
    generatedAt: nowIso(),
    spotlightId,
    kpis,
    funnel,
    batches,
    events,
    spotlight: spotlightId ? getPublicStage(spotlightId) : null,
    seal: spotlightSeal,
    compare,
    detect: {
      rate: detectRate,
      screened: screened.length,
      cleared: cleared.length,
      positive: screened.length - cleared.length,
      ...detectOf(spotlightFull),
    },
    listed: !!(spotlightFull?.report?.generated && spotlightFull?.trace?.generated),
    houseEnv: resolveHouseEnv(spotlightFull?.farm?.houseEnv, new Date(), {
      listed: !!(spotlightFull?.report?.generated && spotlightFull?.trace?.generated),
    }),
    trend: trendFrom(rows),
  }
}

/**
 * @param {object} [batch]
 */
function detectOf(batch) {
  const s = batch?.screen || {}
  const samples = Array.isArray(s.samples) ? s.samples : []
  const thistle = [...samples].reverse().find((row) => /大蓟/.test(row.group || '') || /^DJ-/i.test(row.id || ''))
  return {
    sampleId: thistle?.id || s.sampleId || '',
    qualitative: thistle?.qualitative || s.qualitative || '',
    result: thistle?.result || s.result || '',
    operator: s.operator || '',
    group: thistle?.group || '大蓟组',
    qcLine: s.qcLine || '',
    reportGenerated: !!batch?.report?.generated,
    traceGenerated: !!batch?.trace?.generated,
    evalDone: batch?.eval?.IL6 !== '' && batch?.eval?.IL6 != null,
    showFix: batch?.batchId === SPOTLIGHT_ID,
  }
}

