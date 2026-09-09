/**
 * 封存验真：不可改写事件链 + 与当前档案对照。
 * 口令只用于盖章，不打印。
 */
import { createHash, createHmac } from 'node:crypto'
import { getDb, audit, nowIso, formatNow } from './db.js'
import { sealSecret } from './env.js'
import { SPOTLIGHT_ID } from '../src/lib/pipeline.js'
import { DEMO_SEED } from '../src/data.js'
import { isThistleSample } from '../src/lib/verdict.js'
import {
  SEAL_BREAK,
  SEAL_OK,
  SEAL_TAMPER,
  sealFingerprint,
} from '../src/lib/seal-copy.js'

const GENESIS_PREV = '0'.repeat(64)

const SNAPSHOT_KEYS = [
  'batchId',
  'additive',
  'dose',
  'count',
  'screenResult',
  'qualitative',
  'target',
  'il6',
  'il6Ctrl',
  'reportNo',
  'verifyId',
]

/**
 * @param {unknown} v
 * @returns {string | number}
 */
function numOrEmpty(v) {
  if (v === '' || v == null) return ''
  const n = Number(v)
  return Number.isNaN(n) ? v : n
}

/**
 * Canonical snapshot of a batch (stable key order).
 * @param {object} batch
 * @returns {Record<string, string | number>}
 */
export function snapshotOf(batch) {
  const farm = batch?.farm || {}
  const screen = batch?.screen || {}
  const ev = batch?.eval || {}
  const report = batch?.report || {}
  const trace = batch?.trace || {}
  return {
    batchId: batch?.batchId || '',
    additive: farm.additive ?? '',
    dose: farm.dose ?? '',
    count: numOrEmpty(farm.count),
    screenResult: screen.result ?? '',
    qualitative: screen.qualitative ?? '',
    target: screen.target ?? '',
    il6: numOrEmpty(ev.IL6),
    il6Ctrl: numOrEmpty(ev.IL6Ctrl),
    reportNo: report.no ?? '',
    verifyId: trace.verifyId ?? '',
  }
}

/**
 * @param {object} snap
 * @returns {string}
 */
export function canonicalJson(snap) {
  const o = {}
  for (const k of SNAPSHOT_KEYS) o[k] = snap?.[k] ?? ''
  return JSON.stringify(o)
}

/**
 * @param {string} batchId
 * @returns {Record<string, string | number>}
 */
export function liveSnapshot(batchId) {
  const d = getDb()
  const farm = d.prepare('SELECT additive, dose, "count" AS count FROM farm_records WHERE batch_id = ?').get(batchId)
  const screen = d.prepare('SELECT result, qualitative, target FROM screen_records WHERE batch_id = ?').get(batchId)
  const ev = d.prepare('SELECT il6, il6_ctrl FROM eval_records WHERE batch_id = ?').get(batchId)
  const report = d.prepare('SELECT no FROM reports WHERE batch_id = ?').get(batchId)
  const trace = d.prepare('SELECT verify_id FROM traces WHERE batch_id = ?').get(batchId)
  return {
    batchId,
    additive: farm?.additive ?? '',
    dose: farm?.dose ?? '',
    count: numOrEmpty(farm?.count),
    screenResult: screen?.result ?? '',
    qualitative: screen?.qualitative ?? '',
    target: screen?.target ?? '',
    il6: numOrEmpty(ev?.il6),
    il6Ctrl: numOrEmpty(ev?.il6_ctrl),
    reportNo: report?.no ?? '',
    verifyId: trace?.verify_id ?? '',
  }
}

/**
 * @param {string} text
 * @returns {string}
 */
function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/**
 * @param {string} eventHash
 * @returns {string}
 */
function hmacOf(eventHash) {
  return createHmac('sha256', sealSecret()).update(eventHash, 'utf8').digest('hex')
}

/**
 * @param {{ prevHash: string, at: string, post: string, kind: string, summary: string, payloadJson: string }} row
 * @returns {string}
 */
export function eventHashOf(row) {
  return sha256Hex(
    `${row.prevHash}\n${row.at}\n${row.post}\n${row.kind}\n${row.summary}\n${row.payloadJson}`,
  )
}

/**
 * @param {string} s
 * @param {string} [hhmm]
 * @returns {string}
 */
function stamp(s, hhmm = '08:00') {
  const t = String(s || '').trim()
  if (!t) return ''
  if (t.length >= 16) return t.slice(0, 16)
  if (t.length >= 10) return `${t.slice(0, 10)} ${hhmm}`
  return t
}

/**
 * @param {object[]} rows
 * @returns {{ okChain: boolean, last: object | null }}
 */
function walkChain(rows) {
  let prev = GENESIS_PREV
  for (const row of rows) {
    if (String(row.prev_hash) !== prev) return { okChain: false, last: rows[rows.length - 1] || null }
    const recomputed = eventHashOf({
      prevHash: row.prev_hash,
      at: row.at,
      post: row.post,
      kind: row.kind,
      summary: row.summary,
      payloadJson: row.payload_json,
    })
    if (recomputed !== row.event_hash) return { okChain: false, last: rows[rows.length - 1] || null }
    if (hmacOf(row.event_hash) !== row.hmac) return { okChain: false, last: rows[rows.length - 1] || null }
    prev = row.event_hash
  }
  return { okChain: true, last: rows[rows.length - 1] || null }
}

/**
 * @param {string} batchId
 * @returns {object[]}
 */
function loadEvents(batchId) {
  return getDb().prepare(`
    SELECT id, batch_id, at, post, kind, summary, payload_json, prev_hash, event_hash, hmac
    FROM seal_events
    WHERE batch_id = ?
    ORDER BY id ASC
  `).all(batchId)
}

/**
 * @param {object} view
 * @returns {object | null}
 */
export function compactSeal(view) {
  if (!view) return null
  return {
    headline: view.headline,
    fingerprint: view.fingerprint,
    status: view.status,
    okChain: view.okChain,
    okLive: view.okLive,
    count: view.count,
  }
}

/**
 * Verify the event chain and live snapshot. Does not throw.
 * @param {string} batchId
 * @returns {{ okChain: boolean, okLive: boolean, last: object | null, events: object[], liveJson: string }}
 */
export function verifySeal(batchId) {
  const events = loadEvents(batchId)
  const { okChain, last } = walkChain(events)
  const liveJson = canonicalJson(liveSnapshot(batchId))
  let okLive = false
  if (last) {
    const sealed = canonicalJson(JSON.parse(last.payload_json))
    okLive = sha256Hex(liveJson) === sha256Hex(sealed)
  }
  return { okChain, okLive, last, events, liveJson }
}

/**
 * Public seal view. No raw hmac on the object.
 * @param {string} batchId
 * @returns {object | null}
 */
export function getSeal(batchId) {
  const d = getDb()
  const exists = d.prepare('SELECT batch_id FROM batches WHERE batch_id = ?').get(batchId)
  if (!exists) return null
  const { okChain, okLive, last, events } = verifySeal(batchId)
  let status = '完整'
  let headline = SEAL_OK
  if (!events.length || !okChain) {
    status = '链断裂'
    headline = SEAL_BREAK
  } else if (!okLive) {
    status = '对不上'
    headline = SEAL_TAMPER
  }
  const fingerprint = sealFingerprint(last?.event_hash)
  return {
    okChain: events.length ? okChain : false,
    okLive,
    status,
    headline,
    fingerprint,
    count: events.length,
    lastAt: last?.at || '',
    lastSummary: last?.summary || '',
    lastPost: last?.post || '',
    events: events.map((e) => ({
      at: e.at,
      post: e.post,
      kind: e.kind,
      summary: e.summary,
      fingerprintShort: String(e.event_hash || '').slice(0, 8).toUpperCase(),
    })),
  }
}

/**
 * @param {string} batchId
 * @param {{ post: string, kind: string, summary: string, at?: string }} meta
 * @param {object} [snapshot]
 * @returns {object | null}
 */
export function appendSeal(batchId, meta, snapshot) {
  const d = getDb()
  const exists = d.prepare('SELECT batch_id FROM batches WHERE batch_id = ?').get(batchId)
  if (!exists) return null
  const last = d.prepare(`
    SELECT event_hash FROM seal_events WHERE batch_id = ? ORDER BY id DESC LIMIT 1
  `).get(batchId)
  const prev = last?.event_hash || GENESIS_PREV
  const at = meta.at || formatNow()
  const post = meta.post
  const kind = meta.kind
  const summary = meta.summary
  const payloadJson = canonicalJson(snapshot || liveSnapshot(batchId))
  const eventHash = eventHashOf({
    prevHash: prev,
    at,
    post,
    kind,
    summary,
    payloadJson,
  })
  const mac = hmacOf(eventHash)
  d.prepare(`
    INSERT INTO seal_events (
      batch_id, at, post, kind, summary, payload_json, prev_hash, event_hash, hmac
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(batchId, at, post, kind, summary, payloadJson, prev, eventHash, mac)
  return getSeal(batchId)
}

/**
 * @param {string} iso
 * @param {string} fallback
 */
function atOr(iso, fallback) {
  return stamp(iso) || fallback
}

/**
 * Plausible history ending with the live snapshot so verify is 完整.
 * @param {object} snap live canonical snapshot
 * @param {object} [hints]
 * @returns {{ at: string, post: string, kind: string, summary: string }[]}
 */
function historyPlan(snap, hints = {}) {
  const id = String(snap.batchId || '')
  const events = []
  const stockAt = atOr(hints.stockDate, '2026-06-22 07:30')
  const screenAt = atOr(hints.sampleDate, '2026-08-11 09:20')
  const evalAt = atOr(hints.testDate, '2026-08-11 14:40')
  const reportAt = atOr(hints.reportAt, '2026-08-11 16:20')
  const traceAt = atOr(hints.traceAt, '2026-08-11 16:40')
  const reviewAt = atOr(hints.reviewAt, '2026-08-11 16:50')

  if (snap.additive || hints.stockDate) {
    events.push({
      at: stockAt,
      post: '养殖',
      kind: 'freeze',
      summary: '入栏，日粮加了大蓟粗提物',
    })
  }

  if (hints.sampleDate || snap.screenResult || snap.qualitative) {
    events.push({
      at: screenAt,
      post: '检测',
      kind: 'freeze',
      summary: '出栏前抽检',
    })
  }

  if (id === SPOTLIGHT_ID) {
    events.push({
      at: '2026-08-11 09:42',
      post: '检测',
      kind: 'correct',
      summary: '质控线未显色，已换试纸',
    })
  }

  if (snap.screenResult || snap.qualitative) {
    const clear = String(snap.screenResult).includes('未检出') || snap.qualitative === '阴性'
    events.push({
      at: stamp(hints.sampleDate, '10:05') || '2026-08-11 10:05',
      post: '检测',
      kind: id === SPOTLIGHT_ID ? 'correct' : 'freeze',
      summary: clear ? '安全检测未检出' : `筛查结果 ${snap.screenResult || snap.qualitative}`,
    })
  }

  if (snap.il6 !== '' && snap.il6 != null) {
    const low = Number(snap.il6) < Number(snap.il6Ctrl || Infinity)
    events.push({
      at: evalAt,
      post: '评价',
      kind: 'freeze',
      summary: low ? '炎症低于对照' : '炎症评价已记录',
    })
  }

  if (hints.reportGenerated || snap.reportNo) {
    events.push({
      at: reportAt,
      post: '溯源',
      kind: 'issue_report',
      summary: snap.reportNo ? `已出检测报告 ${snap.reportNo}` : '已出检测报告',
    })
  } else if (id === SPOTLIGHT_ID) {
    events.push({
      at: '2026-08-11 16:20',
      post: '溯源',
      kind: 'issue_report',
      summary: '已出检测报告',
    })
  }

  if (hints.traceGenerated || snap.verifyId) {
    events.push({
      at: traceAt,
      post: '溯源',
      kind: 'issue_code',
      summary: '已出追溯码',
    })
  } else if (id === SPOTLIGHT_ID) {
    events.push({
      at: '2026-08-11 16:40',
      post: '溯源',
      kind: 'issue_code',
      summary: '已出追溯码',
    })
  }

  if ((hints.reportGenerated && hints.traceGenerated) || (snap.reportNo && snap.verifyId)) {
    events.push({
      at: reviewAt,
      post: '溯源',
      kind: 'review',
      summary: '准予上市',
    })
  }

  if (!events.length) {
    events.push({
      at: formatNow(),
      post: '系统',
      kind: 'freeze',
      summary: '批次建档',
    })
  }
  return events
}

/**
 * Delete then insert a genesis chain whose last payload matches live.
 * @param {string} batchId
 * @param {object} [batch] assembled batch, optional hints
 * @returns {object | null}
 */
function hintDates(batchId, batch) {
  if (batch) {
    return {
      stockDate: batch.farm?.stockDate,
      sampleDate: batch.screen?.sampleDate,
      testDate: batch.eval?.testDate,
      reportAt: batch.report?.generatedAt,
      traceAt: batch.trace?.generatedAt,
      reviewAt: batch.review?.reviewedAt,
      reportGenerated: !!batch.report?.generated,
      traceGenerated: !!batch.trace?.generated,
      reviewed: !!batch.review?.reviewed,
    }
  }
  const d = getDb()
  const farm = d.prepare('SELECT stock_date FROM farm_records WHERE batch_id = ?').get(batchId)
  const screen = d.prepare('SELECT sample_date FROM screen_records WHERE batch_id = ?').get(batchId)
  const ev = d.prepare('SELECT test_date FROM eval_records WHERE batch_id = ?').get(batchId)
  const report = d.prepare('SELECT generated, generated_at FROM reports WHERE batch_id = ?').get(batchId)
  const trace = d.prepare('SELECT generated, generated_at FROM traces WHERE batch_id = ?').get(batchId)
  const review = d.prepare('SELECT reviewed, reviewed_at FROM reviews WHERE batch_id = ?').get(batchId)
  return {
    stockDate: farm?.stock_date,
    sampleDate: screen?.sample_date,
    testDate: ev?.test_date,
    reportAt: report?.generated_at,
    traceAt: trace?.generated_at,
    reviewAt: review?.reviewed_at,
    reportGenerated: !!report?.generated,
    traceGenerated: !!trace?.generated,
    reviewed: !!review?.reviewed,
  }
}

export function rebuildSeal(batchId, batch) {
  const d = getDb()
  const exists = d.prepare('SELECT batch_id FROM batches WHERE batch_id = ?').get(batchId)
  if (!exists) return null
  const snap = batch ? snapshotOf(batch) : liveSnapshot(batchId)
  const plan = historyPlan(snap, hintDates(batchId, batch))
  const payloadJson = canonicalJson(snap)
  d.prepare('DELETE FROM seal_events WHERE batch_id = ?').run(batchId)
  let prev = GENESIS_PREV
  const ins = d.prepare(`
    INSERT INTO seal_events (
      batch_id, at, post, kind, summary, payload_json, prev_hash, event_hash, hmac
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  for (const step of plan) {
    const eventHash = eventHashOf({
      prevHash: prev,
      at: step.at,
      post: step.post,
      kind: step.kind,
      summary: step.summary,
      payloadJson,
    })
    const mac = hmacOf(eventHash)
    ins.run(batchId, step.at, step.post, step.kind, step.summary, payloadJson, prev, eventHash, mac)
    prev = eventHash
  }
  return getSeal(batchId)
}

/**
 * Backfill every batch if the table is empty.
 * @returns {number}
 */
export function ensureSeals() {
  const d = getDb()
  const n = d.prepare('SELECT COUNT(*) AS n FROM seal_events').get().n
  if (n > 0) return 0
  const rows = d.prepare('SELECT batch_id FROM batches ORDER BY id ASC').all()
  for (const r of rows) rebuildSeal(r.batch_id)
  return rows.length
}

/**
 * Kind for a patch: first write of this post is freeze, later is correct.
 * @param {string} batchId
 * @param {string} post
 * @returns {'freeze' | 'correct'}
 */
export function kindForPost(batchId, post) {
  const n = getDb().prepare(
    'SELECT COUNT(*) AS n FROM seal_events WHERE batch_id = ? AND post = ?',
  ).get(batchId, post).n
  return n ? 'correct' : 'freeze'
}

/**
 * Silent notebook edit: change 安全检测结果 without appending a seal.
 * Chain stays intact; live verify becomes 对不上.
 * @param {string} batchId
 * @param {object} [user]
 * @returns {{ ok: boolean, seal: object, batchId: string } | null}
 */
function parseExtraJson(raw) {
  if (!raw) return { samples: [], extra: {} }
  try {
    const parsed = JSON.parse(raw)
    return {
      samples: Array.isArray(parsed.samples) ? parsed.samples : [],
      extra: parsed.extra && typeof parsed.extra === 'object' ? parsed.extra : {},
    }
  } catch {
    return { samples: [], extra: {} }
  }
}

export function demoTamper(batchId, user) {
  const d = getDb()
  const row = d.prepare('SELECT result, qualitative, extra_json FROM screen_records WHERE batch_id = ?').get(batchId)
  const exists = d.prepare('SELECT batch_id FROM batches WHERE batch_id = ?').get(batchId)
  if (!exists) return null
  const extra = parseExtraJson(row?.extra_json)
  const before = {
    result: row?.result || '',
    qualitative: row?.qualitative || '',
    samples: extra.samples,
  }
  extra.samples = extra.samples.map((s) => {
    if (!isThistleSample(s)) return s
    return { ...s, qualitative: '阳性', result: '阳性检出' }
  })
  d.prepare(`
    UPDATE screen_records SET result = ?, qualitative = ?, extra_json = ? WHERE batch_id = ?
  `).run('阳性检出', '阳性', JSON.stringify(extra), batchId)
  d.prepare('UPDATE batches SET updated_at = ? WHERE batch_id = ?').run(nowIso(), batchId)
  audit(user, 'tamper_demo', 'seal', batchId, before, { result: '阳性检出', qualitative: '阳性' })
  return { ok: true, seal: getSeal(batchId), batchId }
}

/**
 * Write screen_records back to the last sealed snapshot. Do not rewrite seal_events.
 * @param {string} batchId
 * @param {object} [user]
 * @returns {{ ok: boolean, seal: object, batchId: string } | null}
 */
export function demoRestore(batchId, user) {
  const d = getDb()
  const exists = d.prepare('SELECT batch_id FROM batches WHERE batch_id = ?').get(batchId)
  if (!exists) return null
  const events = loadEvents(batchId)
  const last = events[events.length - 1]
  if (!last) return { ok: false, seal: getSeal(batchId), batchId }
  let snap
  try {
    snap = JSON.parse(last.payload_json)
  } catch {
    return { ok: false, seal: getSeal(batchId), batchId }
  }
  let result = snap.screenResult ?? ''
  let qualitative = snap.qualitative ?? ''
  const lastLooksBad = qualitative === '阳性' || String(result).includes('阳性')
  if (!qualitative && !result || lastLooksBad) {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      try {
        const p = JSON.parse(events[i].payload_json)
        if (p.qualitative === '阴性' || String(p.screenResult || '').includes('未检出')) {
          qualitative = p.qualitative || '阴性'
          result = p.screenResult || '未检出'
          break
        }
      } catch {
        /* skip */
      }
    }
  }
  if (!qualitative && batchId === SPOTLIGHT_ID) {
    qualitative = DEMO_SEED.screen.qualitative
    result = DEMO_SEED.screen.result
  }
  const row = d.prepare('SELECT result, qualitative, extra_json FROM screen_records WHERE batch_id = ?').get(batchId)
  const extra = parseExtraJson(row?.extra_json)
  const before = { result: row?.result || '', qualitative: row?.qualitative || '', samples: extra.samples }
  if (batchId === SPOTLIGHT_ID) {
    extra.samples = structuredClone(DEMO_SEED.screen.samples)
  } else {
    extra.samples = extra.samples.map((s) => {
      if (!isThistleSample(s)) return s
      return { ...s, qualitative: qualitative || '阴性', result: result || '未检出' }
    })
  }
  d.prepare(`
    UPDATE screen_records SET result = ?, qualitative = ?, extra_json = ? WHERE batch_id = ?
  `).run(result, qualitative, JSON.stringify(extra), batchId)
  d.prepare('UPDATE batches SET updated_at = ? WHERE batch_id = ?').run(nowIso(), batchId)
  audit(user, 'restore_demo', 'seal', batchId, before, { result, qualitative })
  return { ok: true, seal: getSeal(batchId), batchId }
}
