import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import { DEMO_SEED, makeReportNo, makeVerifyId, blankBatchFromSpotlight } from '../src/data.js'
import { makeDemoHouseEnv, shanghaiYmd, resolveHouseEnv, looksLikeOldHouseEnv } from '../src/lib/house-env.js'
import { FLEET_SEEDS, SEED_BATCH_IDS } from '../src/data-fleet.js'
import { buildStageView } from '../src/lib/stage-view.js'
import { ACCOUNTS, DEFAULT_PASSWORD } from './roles.js'
import {
  appendSeal,
  rebuildSeal,
  ensureSeals,
  snapshotOf,
  canonicalJson,
  getSeal,
  compactSeal,
  kindForPost,
} from './seal.js'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))

export const DEFAULT_BATCH_ID = DEMO_SEED.batchId

let db

export function formatNow() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date())
  const g = (t) => parts.find((p) => p.type === t)?.value
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}`
}

export function nowIso() {
  return new Date().toISOString()
}

export function getDb() {
  if (db) return db
  const file = resolve(root, process.env.DATABASE_PATH || 'data/tihua.db')
  mkdirSync(dirname(file), { recursive: true })
  db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db)
  return db
}

function migrate(d) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS batches (
      id INTEGER PRIMARY KEY,
      batch_id TEXT UNIQUE NOT NULL,
      product_name TEXT,
      brand TEXT,
      platform TEXT,
      team TEXT,
      program_json TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS farm_records (
      id INTEGER PRIMARY KEY,
      batch_id TEXT UNIQUE NOT NULL REFERENCES batches(batch_id),
      name TEXT, partners TEXT, location TEXT, house TEXT, flock_id TEXT, breed TEXT,
      hatch_date TEXT, stock_date TEXT, planned_slaughter TEXT, count REAL, density TEXT,
      feed_brand TEXT, additive TEXT, dose TEXT, dose_start_day REAL, feed_note TEXT,
      fcr REAL, fcr_control REAL, mortality REAL, mortality_control REAL
    );
    CREATE TABLE IF NOT EXISTS med_logs (
      id INTEGER PRIMARY KEY,
      batch_id TEXT NOT NULL REFERENCES batches(batch_id),
      sort_order INTEGER NOT NULL,
      date TEXT, item TEXT, dose TEXT, purpose TEXT, result TEXT
    );
    CREATE TABLE IF NOT EXISTS screen_records (
      id INTEGER PRIMARY KEY,
      batch_id TEXT UNIQUE NOT NULL REFERENCES batches(batch_id),
      sample_id TEXT, sample_date TEXT, sample_part TEXT, method TEXT,
      mdspe_min REAL, gold_min REAL, target TEXT, qualitative TEXT, result TEXT,
      lod_note TEXT, operator TEXT, qc_line TEXT, notes TEXT
    );
    CREATE TABLE IF NOT EXISTS eval_records (
      id INTEGER PRIMARY KEY,
      batch_id TEXT UNIQUE NOT NULL REFERENCES batches(batch_id),
      test_date TEXT, instrument TEXT, curve_r REAL, lod REAL, value_text TEXT,
      value_num TEXT, unit TEXT, operator TEXT,
      il1b REAL, il1b_ctrl REAL, il6 REAL, il6_ctrl REAL,
      tnfa REAL, tnfa_ctrl REAL, crp REAL, crp_ctrl REAL,
      shannon REAL, shannon_ctrl REAL, lacto_change REAL, ecoli_change REAL
    );
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY,
      batch_id TEXT UNIQUE NOT NULL REFERENCES batches(batch_id),
      generated INTEGER NOT NULL DEFAULT 0,
      no TEXT, generated_at TEXT, generated_by INTEGER REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS traces (
      id INTEGER PRIMARY KEY,
      batch_id TEXT UNIQUE NOT NULL REFERENCES batches(batch_id),
      generated INTEGER NOT NULL DEFAULT 0,
      verify_id TEXT, generated_at TEXT, generated_by INTEGER REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY,
      at TEXT NOT NULL,
      user_id INTEGER,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT,
      before_json TEXT,
      after_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity, entity_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
    CREATE INDEX IF NOT EXISTS idx_med_batch ON med_logs(batch_id, sort_order);
    CREATE TABLE IF NOT EXISTS reviews (
      batch_id TEXT UNIQUE NOT NULL REFERENCES batches(batch_id),
      sample_accept INTEGER NOT NULL DEFAULT 0,
      data_review INTEGER NOT NULL DEFAULT 0,
      report_issue INTEGER NOT NULL DEFAULT 0,
      reviewed INTEGER NOT NULL DEFAULT 0,
      reviewer TEXT,
      reviewed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS seal_events (
      id INTEGER PRIMARY KEY,
      batch_id TEXT NOT NULL,
      at TEXT NOT NULL,
      post TEXT NOT NULL,
      kind TEXT NOT NULL,
      summary TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      prev_hash TEXT NOT NULL,
      event_hash TEXT NOT NULL,
      hmac TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_seal_batch ON seal_events(batch_id, id);
  `)
  ensureColumn(d, 'screen_records', 'extra_json', 'TEXT')
  ensureColumn(d, 'screen_records', 'instrument', 'TEXT')
  ensureColumn(d, 'screen_records', 'curve_r', 'REAL')
  ensureColumn(d, 'screen_records', 'lod', 'REAL')
  ensureColumn(d, 'screen_records', 'value_text', 'TEXT')
  ensureColumn(d, 'screen_records', 'value_num', 'TEXT')
  ensureColumn(d, 'screen_records', 'unit', 'TEXT')
  ensureColumn(d, 'screen_records', 'hplc_date', 'TEXT')
  ensureColumn(d, 'screen_records', 'hplc_operator', 'TEXT')
  ensureColumn(d, 'farm_records', 'house_env_json', 'TEXT')
  migrateDose(d)
  seedSpotlightScreenExtra(d)
  migrateDemoCopy(d)
  migrateHplcToScreen(d)
  migrateHouseEnv(d)
  migrateSmoothHouseEnv(d)
  migrateSpotlightIssued(d)
  restoreSpotlightFarm(d)
  migrateLiveBlankBatch(d)
  rebuildUnissuedFleetSeals(d)
}

function ensureColumn(d, table, name, spec) {
  const cols = d.prepare(`PRAGMA table_info(${table})`).all()
  if (!cols.some((c) => c.name === name)) {
    d.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${spec}`)
  }
}

function migrateDose(d) {
  d.prepare(`
    UPDATE farm_records
    SET dose = replace(dose, '800 mg/kg 饲料', '5000 mg/kg 饲料（0.5%）')
    WHERE dose LIKE '%800 mg%'
  `).run()
  d.prepare(`
    UPDATE farm_records
    SET dose = replace(dose, '800 mg/kg', '5000 mg/kg（0.5%）')
    WHERE dose LIKE '%800 mg%'
  `).run()
  d.prepare(`
    UPDATE farm_records
    SET feed_note = replace(feed_note, '全程添加，替代饲用抗生素', '常规添加 5000 mg/kg（0.5%），应激添加 10000 mg/kg（1%），替代饲用抗生素')
    WHERE feed_note LIKE '%全程添加%' AND feed_note NOT LIKE '%5000%'
  `).run()
  d.prepare(`
    UPDATE med_logs
    SET dose = '常规 5000 mg/kg（0.5%） / 应激 10000 mg/kg（1%）'
    WHERE dose LIKE '%800 mg%' AND item LIKE '%蓟%'
  `).run()
}

function seedSpotlightScreenExtra(d) {
  const id = DEMO_SEED.batchId
  const row = d.prepare('SELECT extra_json FROM screen_records WHERE batch_id = ?').get(id)
  if (!row) return
  const empty = !row.extra_json || row.extra_json === 'null' || row.extra_json === '{}'
  if (!empty) {
    try {
      const parsed = JSON.parse(row.extra_json)
      if (Array.isArray(parsed.samples) && parsed.samples.length) return
    } catch { /* rewrite */ }
  }
  d.prepare('UPDATE screen_records SET extra_json = ? WHERE batch_id = ?').run(
    JSON.stringify({ samples: DEMO_SEED.screen.samples, extra: DEMO_SEED.screen.extra }),
    id,
  )
}


function migrateHplcToScreen(d) {
  const rows = d.prepare(`
    SELECT e.batch_id, e.test_date, e.instrument, e.curve_r, e.lod, e.value_text, e.value_num, e.unit, e.operator,
           s.instrument AS s_instrument, s.value_text AS s_value
    FROM eval_records e
    JOIN screen_records s ON s.batch_id = e.batch_id
  `).all()
  const upd = d.prepare(`
    UPDATE screen_records
    SET instrument=?, curve_r=?, lod=?, value_text=?, value_num=?, unit=?, hplc_date=?, hplc_operator=?
    WHERE batch_id=?
  `)
  for (const r of rows) {
    if (r.s_instrument || r.s_value) continue
    if (!r.instrument && !r.value_text && r.curve_r == null) continue
    upd.run(
      r.instrument || '', r.curve_r, r.lod, r.value_text || '', r.value_num || '',
      r.unit || 'μg/kg', r.test_date || '', r.operator || '', r.batch_id,
    )
  }
}

function migrateHouseEnv(d) {
  const rows = d.prepare('SELECT batch_id, stock_date, house_env_json FROM farm_records').all()
  const upd = d.prepare('UPDATE farm_records SET house_env_json = ? WHERE batch_id = ?')
  for (const r of rows) {
    if (r.house_env_json) continue
    const day = String(r.stock_date || '').slice(0, 10) || '2026-08-11'
    upd.run(JSON.stringify(makeDemoHouseEnv(day, r.batch_id)), r.batch_id)
  }
}

function smoothHouseEnvDay(batchId, stockDate, env) {
  if (batchId === DEMO_SEED.batchId || batchId === '蓟化-2026-0812') return '2026-08-11'
  const fromAt = String(env?.series?.[0]?.at || '').slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(fromAt)) return fromAt
  const stock = String(stockDate || '').slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(stock)) return stock
  return '2026-08-11'
}

function migrateSmoothHouseEnv(d) {
  const rows = d.prepare('SELECT batch_id, stock_date, house_env_json FROM farm_records').all()
  const upd = d.prepare('UPDATE farm_records SET house_env_json = ? WHERE batch_id = ?')
  for (const r of rows) {
    if (!r.house_env_json) continue
    try {
      const env = JSON.parse(r.house_env_json)
      if (!looksLikeOldHouseEnv(env)) continue
      const day = smoothHouseEnvDay(r.batch_id, r.stock_date, env)
      upd.run(JSON.stringify(makeDemoHouseEnv(day, r.batch_id)), r.batch_id)
    } catch {
      continue
    }
  }
}


function migrateSpotlightIssued(d) {
  const id = DEMO_SEED.batchId
  const row = d.prepare('SELECT generated, no FROM reports WHERE batch_id = ?').get(id)
  if (!row) return
  const emptyNo = !String(row.no || '').trim()
  if (row.generated && !emptyNo) return
  d.prepare(`
    UPDATE reports SET generated = 1, no = ?, generated_at = ?
    WHERE batch_id = ?
  `).run(DEMO_SEED.report.no, DEMO_SEED.report.generatedAt, id)
  d.prepare(`
    UPDATE traces SET generated = 1, verify_id = ?, generated_at = ?
    WHERE batch_id = ?
  `).run(DEMO_SEED.trace.verifyId, DEMO_SEED.trace.generatedAt, id)
  rebuildSeal(id)
}

/**
 * 焦点批养殖档案被改空后，从 DEMO_SEED.farm 拉回。不碰检测/评价/报告/追溯。
 * 恢复后补一条养殖岗封存，使 live 与链对得上。不 rebuildSeal。
 * @param {import('better-sqlite3').Database} d
 */
function restoreSpotlightFarm(d) {
  const id = DEMO_SEED.batchId
  const exists = d.prepare('SELECT batch_id FROM batches WHERE batch_id = ?').get(id)
  if (!exists) return
  const farm = d.prepare('SELECT name, additive, "count" AS count FROM farm_records WHERE batch_id = ?').get(id)
  if (!farm) return
  const emptyCount = farm.count == null || Number(farm.count) === 0
  const emptyAdd = !String(farm.additive || '').trim()
  const wrongName = farm.name === '郑州职业技术学院'
  if (!emptyCount && !emptyAdd && !wrongName) return
  upsertFarm(d, id, DEMO_SEED.farm)
  appendSeal(id, {
    post: '养殖',
    kind: kindForPost(id, '养殖'),
    summary: '已恢复日粮与存栏',
  })
}

/**
 * 现场新建批 蓟化-2026-0901：进苗/入孵用当天，出栏 +50 天，用药本只留「饲用抗生素 未使用」。
 * 保留基地名与大蓟日粮。不出证、不出码。
 * @param {import('better-sqlite3').Database} d
 */
function migrateLiveBlankBatch(d) {
  const id = '蓟化-2026-0901'
  const row = d.prepare(
    'SELECT stock_date, hatch_date, planned_slaughter FROM farm_records WHERE batch_id = ?',
  ).get(id)
  if (!row) return
  const stock = String(row.stock_date || '').slice(0, 10)
  const planned = String(row.planned_slaughter || '').slice(0, 10)
  const copied = stock === '2026-06-22' || planned === '2026-08-12' || stock === '2026-08-12'
  if (!copied) return
  d.prepare(`
    UPDATE farm_records
    SET hatch_date = ?, stock_date = ?, planned_slaughter = ?
    WHERE batch_id = ?
  `).run('2026-09-01', '2026-09-01', '2026-10-21', id)
  d.prepare('DELETE FROM med_logs WHERE batch_id = ?').run(id)
  d.prepare(`
    INSERT INTO med_logs (batch_id, sort_order, date, item, dose, purpose, result)
    VALUES (?, 0, ?, '饲用抗生素', '—', '—', '未使用')
  `).run(id, '2026-09-01')
}

/**
 * 未出证体系批若链尾仍是「准予上市」，按新 historyPlan 重铺。不碰焦点 0812，不碰 0901。
 * @param {import('better-sqlite3').Database} d
 */
function rebuildUnissuedFleetSeals(d) {
  const rows = d.prepare(`
    SELECT b.batch_id AS batchId
    FROM batches b
    LEFT JOIN reports r ON r.batch_id = b.batch_id
    WHERE (r.generated IS NULL OR r.generated = 0)
      AND b.batch_id != ?
      AND b.batch_id != '蓟化-2026-0901'
  `).all(DEMO_SEED.batchId)
  for (const r of rows) {
    const last = d.prepare(
      'SELECT summary FROM seal_events WHERE batch_id = ? ORDER BY id DESC LIMIT 1',
    ).get(r.batchId)
    if (last?.summary !== '准予上市') continue
    rebuildSeal(r.batchId)
  }
}


function migrateDemoCopy(d) {
  const id = DEMO_SEED.batchId
  const qc = DEMO_SEED.screen.qcLine
  d.prepare(`
    UPDATE screen_records
    SET qc_line = ?
    WHERE batch_id = ? AND (qc_line LIKE '%检测线未显色%' OR qc_line IS NULL OR qc_line = '')
  `).run(qc, id)
  d.prepare(`
    UPDATE farm_records
    SET hatch_date = '2026-06-22'
    WHERE batch_id = ? AND hatch_date = '2026-06-21'
  `).run(id)
  const slaughters = [
    ['蓟化-2026-0824', '2026-09-05'],
    ['蓟化-2026-0826', '2026-09-08'],
    ['蓟化-2026-0828', '2026-09-12'],
  ]
  const updS = d.prepare(`
    UPDATE farm_records SET planned_slaughter = ?
    WHERE batch_id = ? AND (planned_slaughter IS NULL OR planned_slaughter <= '2026-08-31')
  `)
  for (const [bid, date] of slaughters) updS.run(date, bid)
  d.prepare(`
    UPDATE screen_records
    SET operator = replace(operator, '快速检测工程师', '安全检测工程师')
    WHERE operator LIKE '%快速检测工程师%'
  `).run()
  d.prepare(`
    UPDATE users SET display_name = '安全检测'
    WHERE username = 'kuaijian' AND display_name = '快速检测'
  `).run()
  const row = d.prepare('SELECT reviewed, reviewer FROM reviews WHERE batch_id = ?').get(id)
  const batchOk = d.prepare('SELECT 1 FROM batches WHERE batch_id = ?').get(id)
  if (batchOk && (!row || !row.reviewed)) {
    const r = DEMO_SEED.review || {}
    upsertReview(d, id, r)
  }
}

export function seed(opts = {}) {
  const d = getDb()
  const { resetPasswords = true, resetDemo = true } = opts
  const hash = bcrypt.hashSync(DEFAULT_PASSWORD, 10)
  const at = nowIso()
  const extra = resetPasswords ? ', password_hash = excluded.password_hash' : ''
  const upsert = d.prepare(`
    INSERT INTO users (username, password_hash, role, display_name, created_at)
    VALUES (@username, @password_hash, @role, @display_name, @created_at)
    ON CONFLICT(username) DO UPDATE SET
      role = excluded.role,
      display_name = excluded.display_name
      ${extra}
  `)
  const tx = d.transaction(() => {
    for (const a of ACCOUNTS) {
      upsert.run({
        username: a.username,
        password_hash: hash,
        role: a.role,
        display_name: a.displayName,
        created_at: at,
      })
    }
    if (resetDemo) writeSeedBatches(null, at)
  })
  tx()
}

export function ensureSeeded() {
  const n = getDb().prepare('SELECT COUNT(*) AS n FROM users').get().n
  if (n === 0) seed()
  ensureSeals()
}

export function audit(user, action, entity, entityId, before, after) {
  getDb().prepare(`
    INSERT INTO audit_logs (at, user_id, action, entity, entity_id, before_json, after_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    nowIso(),
    user?.id ?? null,
    action,
    entity,
    entityId == null ? null : String(entityId),
    before == null ? null : JSON.stringify(before),
    after == null ? null : JSON.stringify(after),
  )
}

export function listAudit(batchId) {
  const sql = `
    SELECT a.id, a.at, a.action, a.entity, a.entity_id, a.before_json, a.after_json,
           u.username, u.display_name, u.role
    FROM audit_logs a
    LEFT JOIN users u ON u.id = a.user_id
    ${batchId ? 'WHERE a.entity_id = ?' : ''}
    ORDER BY a.id DESC
    LIMIT 200
  `
  const rows = batchId ? getDb().prepare(sql).all(batchId) : getDb().prepare(sql).all()
  return rows.map((r) => ({
    id: r.id,
    at: r.at,
    action: r.action,
    entity: r.entity,
    entityId: r.entity_id,
    username: r.username,
    displayName: r.display_name,
    role: r.role,
    before: r.before_json ? JSON.parse(r.before_json) : null,
    after: r.after_json ? JSON.parse(r.after_json) : null,
  }))
}

export function listBatches() {
  return getDb().prepare(`
    SELECT b.batch_id AS batchId, b.product_name AS productName, b.updated_at AS updatedAt,
           f.name AS farmName, f.count AS count
    FROM batches b
    LEFT JOIN farm_records f ON f.batch_id = b.batch_id
    ORDER BY b.id ASC
  `).all()
}

/**
 * 蓟化-YYYY-MMDD，上海日历。撞号则 -2、-3…
 * @returns {string}
 */
export function nextBatchId() {
  const { year, month, day } = shanghaiYmd()
  const base = `蓟化-${year}-${month}${day}`
  const d = getDb()
  const exists = (id) => d.prepare('SELECT 1 AS n FROM batches WHERE batch_id = ?').get(id)
  if (!exists(base)) return base
  let n = 2
  while (exists(`${base}-${n}`)) n += 1
  return `${base}-${n}`
}

/**
 * @param {object} user
 * @returns {object}
 */
export function createBatch(user) {
  const d = getDb()
  const batchId = nextBatchId()
  const seed = blankBatchFromSpotlight(batchId)
  const at = nowIso()
  d.transaction(() => {
    writeFullBatch(batchId, seed, user?.id, { createdAt: at })
  })()
  const after = getBatch(batchId)
  appendSeal(batchId, {
    post: '系统',
    kind: 'freeze',
    summary: '批次建档',
  }, snapshotOf(after))
  audit(user, 'create', 'batch', batchId, null, after)
  return getBatch(batchId)
}

export function getBatch(batchId) {
  const d = getDb()
  const b = d.prepare('SELECT * FROM batches WHERE batch_id = ?').get(batchId)
  if (!b) return null
  const farm = d.prepare('SELECT * FROM farm_records WHERE batch_id = ?').get(batchId)
  const med = d.prepare('SELECT * FROM med_logs WHERE batch_id = ? ORDER BY sort_order ASC, id ASC').all(batchId)
  const screen = d.prepare('SELECT * FROM screen_records WHERE batch_id = ?').get(batchId)
  const ev = d.prepare('SELECT * FROM eval_records WHERE batch_id = ?').get(batchId)
  const report = d.prepare('SELECT * FROM reports WHERE batch_id = ?').get(batchId)
  const trace = d.prepare('SELECT * FROM traces WHERE batch_id = ?').get(batchId)
  const review = d.prepare('SELECT * FROM reviews WHERE batch_id = ?').get(batchId)
  const assembled = assemble(b, farm, med, screen, ev, report, trace, review)
  assembled.seal = compactSeal(getSeal(batchId))
  return assembled
}

export function getPublicTrace(batchId) {
  const full = getBatch(batchId)
  if (!full) return null
  return {
    batchId: full.batchId,
    productName: full.productName,
    brand: full.brand,
    team: full.team,
    farm: {
      name: full.farm.name,
      partners: full.farm.partners,
      location: full.farm.location,
      house: full.farm.house,
      flockId: full.farm.flockId,
      breed: full.farm.breed,
      stockDate: full.farm.stockDate,
      count: full.farm.count,
      additive: full.farm.additive,
      dose: full.farm.dose,
      plannedSlaughter: full.farm.plannedSlaughter,
      medLog: (full.farm.medLog || []).map((r) => ({
        date: r.date, item: r.item, dose: r.dose, purpose: r.purpose, result: r.result,
      })),
    },
    screen: {
      qualitative: full.screen.qualitative,
      result: full.screen.result,
      target: full.screen.target,
      mdspeMin: full.screen.mdspeMin,
      goldMin: full.screen.goldMin,
      instrument: full.screen.instrument,
      curveR: full.screen.curveR,
      lod: full.screen.lod,
      valueText: full.screen.valueText,
      valueNum: full.screen.valueNum,
      unit: full.screen.unit,
      hplcDate: full.screen.hplcDate,
      hplcOperator: full.screen.hplcOperator,
      samples: (full.screen.samples || []).map((s) => ({
        id: s.id, group: s.group, tLine: s.tLine, qualitative: s.qualitative, result: s.result,
      })),
    },
    eval: {
      valueText: full.eval.valueText,
      valueNum: full.eval.valueNum,
      lod: full.eval.lod,
      unit: full.eval.unit,
      IL1b: full.eval.IL1b,
      IL1bCtrl: full.eval.IL1bCtrl,
      IL6: full.eval.IL6,
      IL6Ctrl: full.eval.IL6Ctrl,
      TNFa: full.eval.TNFa,
      TNFaCtrl: full.eval.TNFaCtrl,
      CRP: full.eval.CRP,
      CRPCtrl: full.eval.CRPCtrl,
    },
    report: { generated: full.report.generated, no: full.report.no, generatedAt: full.report.generatedAt },
    trace: { generated: full.trace.generated, verifyId: full.trace.verifyId, generatedAt: full.trace.generatedAt },
    seal: compactSeal(getSeal(batchId)),
  }
}

export function getPublicStage(batchId) {
  const full = getBatch(batchId)
  if (!full) return null
  const view = buildStageView(full)
  const farm = full.farm || {}
  const screen = full.screen || {}
  const ev = full.eval || {}
  const prog = full.program || {}
  const dateOnly = (v) => String(v || '').slice(0, 10)
  return {
    batchId: full.batchId,
    productName: full.productName || '',
    farm: {
      name: farm.name || '',
      count: farm.count ?? '',
      breed: farm.breed || '',
      feedBrand: farm.feedBrand || '',
      additive: farm.additive || '',
      dose: farm.dose || '',
      fcr: farm.fcr ?? '',
      fcrControl: farm.fcrControl ?? '',
      mortality: farm.mortality ?? '',
      mortalityControl: farm.mortalityControl ?? '',
      stockDate: farm.stockDate || '',
      plannedSlaughter: farm.plannedSlaughter || '',
      feedAntibiotic: view.feedAntibiotic,
      houseEnv: resolveHouseEnv(farm.houseEnv, new Date(), {
        listed: !!(full.report?.generated && full.trace?.generated),
      }),
      medLog: (farm.medLog || []).slice(-4).map((r) => ({
        date: r.date, item: r.item, dose: r.dose, purpose: r.purpose, result: r.result,
      })),
    },
    screen: {
      result: screen.result || '',
      qualitative: screen.qualitative || '',
      target: screen.target || '',
      lodNote: screen.lodNote || '',
      sampleDate: screen.sampleDate || '',
      sampleId: screen.sampleId || '',
      operator: screen.operator || '',
      qcLine: screen.qcLine || '',
      samples: Array.isArray(screen.samples) ? screen.samples : [],
      instrument: screen.instrument || '',
      curveR: screen.curveR ?? '',
      lod: screen.lod ?? '',
      valueText: screen.valueText || '',
      valueNum: screen.valueNum ?? '',
      unit: screen.unit || '',
      hplcDate: screen.hplcDate || '',
      hplcOperator: screen.hplcOperator || '',
    },
    eval: {
      valueText: ev.valueText || '',
      lod: ev.lod ?? '',
      unit: ev.unit || '',
      curveR: ev.curveR ?? '',
      testDate: ev.testDate || '',
      IL1b: ev.IL1b ?? '',
      IL1bCtrl: ev.IL1bCtrl ?? '',
      IL6: ev.IL6 ?? '',
      IL6Ctrl: ev.IL6Ctrl ?? '',
      TNFa: ev.TNFa ?? '',
      TNFaCtrl: ev.TNFaCtrl ?? '',
      CRP: ev.CRP ?? '',
      CRPCtrl: ev.CRPCtrl ?? '',
    },
    report: {
      generated: !!full.report?.generated,
      no: full.report?.no || '',
      generatedAt: full.report?.generatedAt || '',
    },
    trace: {
      generated: !!full.trace?.generated,
      verifyId: full.trace?.verifyId || '',
      generatedAt: full.trace?.generatedAt || '',
    },
    program: {
      birds: prog.birds || '',
      fcrDrop: prog.fcrDrop || '',
      mortDrop: prog.mortDrop || '',
      markets: prog.markets ?? '',
      charityTests: prog.charityTests || '',
    },
    timeline: [
      { id: 'stock', label: '入栏', date: dateOnly(farm.stockDate) },
      { id: 'screen', label: '安全检测', date: dateOnly(screen.sampleDate) },
      { id: 'slaughter', label: '出栏', date: dateOnly(farm.plannedSlaughter) },
    ],
    ticker: view.ticker,
    rings: view.rings,
    nodes: view.nodes,
    verdict: {
      pass: view.verdict.pass,
      headline: view.verdict.headline,
      why: view.verdict.why,
      stamp: view.verdict.stamp,
    },
    scenes: view.scenes,
    active: view.active,
    activeIndex: view.activeIndex,
    pathT: view.pathT,
    seal: compactSeal(getSeal(batchId)),
  }
}

export function patchBatch(batchId, patch, user) {
  const d = getDb()
  const before = getBatch(batchId)
  if (!before) return null
  const tx = d.transaction(() => {
    const id = batchId
    if (
      patch.productName != null
      || patch.brand != null
      || patch.platform != null
      || patch.team != null
      || patch.program != null
    ) {
      const cur = d.prepare('SELECT * FROM batches WHERE batch_id = ?').get(id)
      d.prepare(`
        UPDATE batches SET product_name=?, brand=?, platform=?, team=?, program_json=?, updated_at=?
        WHERE batch_id=?
      `).run(
        patch.productName ?? cur.product_name,
        patch.brand ?? cur.brand,
        patch.platform ?? cur.platform,
        patch.team ?? cur.team,
        patch.program ? JSON.stringify(patch.program) : cur.program_json,
        nowIso(),
        id,
      )
    }
    if (patch.farm) upsertFarm(d, id, { ...farmFromRow(d, id), ...patch.farm })
    if (patch.screen) upsertScreen(d, id, { ...screenFromRow(d, id), ...patch.screen })
    if (patch.eval) upsertEval(d, id, { ...evalFromRow(d, id), ...patch.eval })
    if (patch.review) upsertReview(d, id, { ...reviewFromRow(d, id), ...patch.review })
    d.prepare('UPDATE batches SET updated_at = ? WHERE batch_id = ?').run(nowIso(), id)
    return id
  })
  const id = tx()
  const after = getBatch(id)
  audit(user, 'update', 'batch', id, before, after)
  if (canonicalJson(snapshotOf(before)) !== canonicalJson(snapshotOf(after))) {
    const meta = sealMetaForPatch(patch)
    appendSeal(id, {
      post: meta.post,
      kind: kindForPost(id, meta.post),
      summary: meta.summary,
    }, snapshotOf(after))
    refreshSeal(after)
  }
  return after
}

function refreshSeal(batch) {
  if (batch?.batchId) batch.seal = compactSeal(getSeal(batch.batchId))
  return batch
}

function sealMetaForPatch(patch) {
  if (patch?.screen) return { post: '检测', summary: '检测岗改了筛查结果' }
  if (patch?.eval) return { post: '评价', summary: '评价岗改了炎症数据' }
  if (patch?.farm) return { post: '养殖', summary: '养殖岗改了投喂记录' }
  if (patch?.review) return { post: '溯源', summary: '审核岗改了复核记录' }
  return { post: '系统', summary: '档案有改动' }
}

export function generateReport(batchId, user, force = false) {
  const d = getDb()
  const before = getBatch(batchId)
  if (!before) return null
  if (before.report.generated && !force) return before
  const at = formatNow()
  const no = makeReportNo(batchId)
  d.prepare(`
    INSERT INTO reports (batch_id, generated, no, generated_at, generated_by)
    VALUES (?, 1, ?, ?, ?)
    ON CONFLICT(batch_id) DO UPDATE SET
      generated=1, no=excluded.no, generated_at=excluded.generated_at, generated_by=excluded.generated_by
  `).run(batchId, no, at, user.id)
  d.prepare('UPDATE batches SET updated_at = ? WHERE batch_id = ?').run(nowIso(), batchId)
  upsertReview(d, batchId, {
    sampleAccept: true,
    dataReview: true,
    reportIssue: true,
    reviewed: true,
    reviewer: user?.displayName || user?.username || '',
    reviewedAt: at,
  })
  const after = getBatch(batchId)
  audit(user, force ? 'regenerate_report' : 'generate_report', 'report', batchId, before.report, after.report)
  appendSeal(batchId, {
    post: '溯源',
    kind: 'issue_report',
    summary: `已出检测报告 ${after.report.no || ''}`.trim(),
  }, snapshotOf(after))
  return refreshSeal(after)
}

export function generateTrace(batchId, user, force = false) {
  const d = getDb()
  let current = getBatch(batchId)
  if (!current) return null
  if (!current.report.generated || force) {
    current = generateReport(batchId, user, false) || current
  }
  if (current.trace.generated && !force) return current
  const at = formatNow()
  const verifyId = makeVerifyId(batchId)
  d.prepare(`
    INSERT INTO traces (batch_id, generated, verify_id, generated_at, generated_by)
    VALUES (?, 1, ?, ?, ?)
    ON CONFLICT(batch_id) DO UPDATE SET
      generated=1, verify_id=excluded.verify_id,
      generated_at=excluded.generated_at, generated_by=excluded.generated_by
  `).run(batchId, verifyId, at, user.id)
  d.prepare('UPDATE batches SET updated_at = ? WHERE batch_id = ?').run(nowIso(), batchId)
  const after = getBatch(batchId)
  audit(user, force ? 'regenerate_trace' : 'generate_trace', 'trace', batchId, current.trace, after.trace)
  appendSeal(batchId, {
    post: '溯源',
    kind: 'issue_code',
    summary: '已出追溯码',
  }, snapshotOf(after))
  return refreshSeal(after)
}

export function saveReview(batchId, review, user) {
  const d = getDb()
  const before = getBatch(batchId)
  if (!before) return null
  upsertReview(d, batchId, { ...before.review, ...review, reviewedAt: review.reviewedAt || formatNow() })
  d.prepare('UPDATE batches SET updated_at = ? WHERE batch_id = ?').run(nowIso(), batchId)
  const after = getBatch(batchId)
  audit(user, 'review', 'review', batchId, before.review, after.review)
  appendSeal(batchId, {
    post: '溯源',
    kind: 'review',
    summary: after.review?.reviewed ? '准予上市' : '审核记录已更新',
  }, snapshotOf(after))
  return refreshSeal(after)
}

export function resetBatch(batchId, user) {
  const before = getBatch(batchId) || getBatch(DEFAULT_BATCH_ID)
  writeSeedBatches(user?.id, nowIso())
  const after = getBatch(DEFAULT_BATCH_ID)
  audit(user, 'reset', 'batch', DEFAULT_BATCH_ID, before, after)
  return after
}

function writeSeedBatches(userId, at) {
  writeFullBatch(DEFAULT_BATCH_ID, DEMO_SEED, userId, { createdAt: at })
  for (const item of FLEET_SEEDS) {
    writeFullBatch(item.batchId, item, userId, { createdAt: item.program?.seedAt || at })
  }
  for (const id of SEED_BATCH_IDS) rebuildSeal(id)
}

export function deleteBatchCascade(d, batchId) {
  d.prepare('DELETE FROM seal_events WHERE batch_id = ?').run(batchId)
  d.prepare('DELETE FROM med_logs WHERE batch_id = ?').run(batchId)
  d.prepare('DELETE FROM farm_records WHERE batch_id = ?').run(batchId)
  d.prepare('DELETE FROM screen_records WHERE batch_id = ?').run(batchId)
  d.prepare('DELETE FROM eval_records WHERE batch_id = ?').run(batchId)
  d.prepare('DELETE FROM reports WHERE batch_id = ?').run(batchId)
  d.prepare('DELETE FROM traces WHERE batch_id = ?').run(batchId)
  d.prepare('DELETE FROM reviews WHERE batch_id = ?').run(batchId)
  d.prepare('DELETE FROM batches WHERE batch_id = ?').run(batchId)
}

function writeFullBatch(batchId, seed, userId, { createdAt } = {}) {
  const d = getDb()
  const at = createdAt || nowIso()
  d.prepare('DELETE FROM med_logs WHERE batch_id = ?').run(batchId)
  d.prepare('DELETE FROM farm_records WHERE batch_id = ?').run(batchId)
  d.prepare('DELETE FROM screen_records WHERE batch_id = ?').run(batchId)
  d.prepare('DELETE FROM eval_records WHERE batch_id = ?').run(batchId)
  d.prepare('DELETE FROM reports WHERE batch_id = ?').run(batchId)
  d.prepare('DELETE FROM traces WHERE batch_id = ?').run(batchId)
  d.prepare('DELETE FROM reviews WHERE batch_id = ?').run(batchId)
  d.prepare(`
    INSERT INTO batches (batch_id, product_name, brand, platform, team, program_json, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(batch_id) DO UPDATE SET
      product_name=excluded.product_name, brand=excluded.brand, platform=excluded.platform,
      team=excluded.team, program_json=excluded.program_json, updated_at=excluded.updated_at
  `).run(
    batchId, seed.productName, seed.brand, seed.platform, seed.team,
    JSON.stringify(seed.program || {}), userId ?? null, at, at,
  )
  upsertFarm(d, batchId, seed.farm)
  upsertScreen(d, batchId, seed.screen)
  upsertEval(d, batchId, seed.eval)
  if (seed.review) upsertReview(d, batchId, seed.review)
  d.prepare(`
    INSERT INTO reports (batch_id, generated, no, generated_at, generated_by)
    VALUES (?, ?, ?, ?, NULL)
    ON CONFLICT(batch_id) DO UPDATE SET
      generated=excluded.generated, no=excluded.no, generated_at=excluded.generated_at, generated_by=NULL
  `).run(batchId, seed.report.generated ? 1 : 0, seed.report.no || '', seed.report.generatedAt || '')
  d.prepare(`
    INSERT INTO traces (batch_id, generated, verify_id, generated_at, generated_by)
    VALUES (?, ?, ?, ?, NULL)
    ON CONFLICT(batch_id) DO UPDATE SET
      generated=excluded.generated, verify_id=excluded.verify_id, generated_at=excluded.generated_at, generated_by=NULL
  `).run(batchId, seed.trace.generated ? 1 : 0, seed.trace.verifyId || '', seed.trace.generatedAt || '')
}

function farmFromRow(d, batchId) {
  const row = d.prepare('SELECT * FROM farm_records WHERE batch_id = ?').get(batchId)
  const med = d.prepare('SELECT * FROM med_logs WHERE batch_id = ? ORDER BY sort_order ASC, id ASC').all(batchId)
  return rowToFarm(row, med)
}

function screenFromRow(d, batchId) {
  return rowToScreen(d.prepare('SELECT * FROM screen_records WHERE batch_id = ?').get(batchId))
}

function evalFromRow(d, batchId) {
  return rowToEval(d.prepare('SELECT * FROM eval_records WHERE batch_id = ?').get(batchId))
}

function houseEnvJsonOf(farm, batchId) {
  if (farm?.houseEnv && typeof farm.houseEnv === 'object') return JSON.stringify(farm.houseEnv)
  const day = String(farm?.stockDate || '').slice(0, 10) || undefined
  return JSON.stringify(makeDemoHouseEnv(day, batchId))
}

function upsertFarm(d, batchId, farm) {
  d.prepare(`
    INSERT INTO farm_records (
      batch_id, name, partners, location, house, flock_id, breed, hatch_date, stock_date,
      planned_slaughter, count, density, feed_brand, additive, dose, dose_start_day, feed_note,
      fcr, fcr_control, mortality, mortality_control, house_env_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(batch_id) DO UPDATE SET
      name=excluded.name, partners=excluded.partners, location=excluded.location, house=excluded.house,
      flock_id=excluded.flock_id, breed=excluded.breed, hatch_date=excluded.hatch_date,
      stock_date=excluded.stock_date, planned_slaughter=excluded.planned_slaughter, count=excluded.count,
      density=excluded.density, feed_brand=excluded.feed_brand, additive=excluded.additive,
      dose=excluded.dose, dose_start_day=excluded.dose_start_day, feed_note=excluded.feed_note,
      fcr=excluded.fcr, fcr_control=excluded.fcr_control, mortality=excluded.mortality,
      mortality_control=excluded.mortality_control, house_env_json=excluded.house_env_json
  `).run(
    batchId, farm.name ?? '', farm.partners ?? '', farm.location ?? '', farm.house ?? '',
    farm.flockId ?? '', farm.breed ?? '', farm.hatchDate ?? '', farm.stockDate ?? '',
    farm.plannedSlaughter ?? '', numOrNull(farm.count), farm.density ?? '',
    farm.feedBrand ?? '', farm.additive ?? '', farm.dose ?? '', numOrNull(farm.doseStartDay),
    farm.feedNote ?? '', numOrNull(farm.fcr), numOrNull(farm.fcrControl),
    numOrNull(farm.mortality), numOrNull(farm.mortalityControl), houseEnvJsonOf(farm, batchId),
  )
  if (Array.isArray(farm.medLog)) {
    d.prepare('DELETE FROM med_logs WHERE batch_id = ?').run(batchId)
    const ins = d.prepare(`
      INSERT INTO med_logs (batch_id, sort_order, date, item, dose, purpose, result)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    farm.medLog.forEach((row, i) => {
      ins.run(batchId, i, row.date ?? '', row.item ?? '', row.dose ?? '', row.purpose ?? '', row.result ?? '')
    })
  }
}

function extraJsonOf(s) {
  return JSON.stringify({
    samples: Array.isArray(s.samples) ? s.samples : [],
    extra: s.extra && typeof s.extra === 'object' ? s.extra : {},
  })
}

function upsertScreen(d, batchId, s) {
  d.prepare(`
    INSERT INTO screen_records (
      batch_id, sample_id, sample_date, sample_part, method, mdspe_min, gold_min,
      target, qualitative, result, lod_note, operator, qc_line, notes, extra_json,
      instrument, curve_r, lod, value_text, value_num, unit, hplc_date, hplc_operator
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(batch_id) DO UPDATE SET
      sample_id=excluded.sample_id, sample_date=excluded.sample_date, sample_part=excluded.sample_part,
      method=excluded.method, mdspe_min=excluded.mdspe_min, gold_min=excluded.gold_min,
      target=excluded.target, qualitative=excluded.qualitative, result=excluded.result,
      lod_note=excluded.lod_note, operator=excluded.operator, qc_line=excluded.qc_line,
      notes=excluded.notes, extra_json=excluded.extra_json,
      instrument=excluded.instrument, curve_r=excluded.curve_r, lod=excluded.lod,
      value_text=excluded.value_text, value_num=excluded.value_num, unit=excluded.unit,
      hplc_date=excluded.hplc_date, hplc_operator=excluded.hplc_operator
  `).run(
    batchId, s.sampleId ?? '', s.sampleDate ?? '', s.samplePart ?? '', s.method ?? '',
    numOrNull(s.mdspeMin), numOrNull(s.goldMin), s.target ?? '', s.qualitative ?? '',
    s.result ?? '', s.lodNote ?? '', s.operator ?? '', s.qcLine ?? '', s.notes ?? '',
    extraJsonOf(s),
    s.instrument ?? '', numOrNull(s.curveR), numOrNull(s.lod),
    s.valueText ?? '', s.valueNum === '' || s.valueNum == null ? '' : String(s.valueNum),
    s.unit ?? 'μg/kg', s.hplcDate ?? '', s.hplcOperator ?? '',
  )
}

function upsertEval(d, batchId, e) {
  d.prepare(`
    INSERT INTO eval_records (
      batch_id, test_date, instrument, curve_r, lod, value_text, value_num, unit, operator,
      il1b, il1b_ctrl, il6, il6_ctrl, tnfa, tnfa_ctrl, crp, crp_ctrl,
      shannon, shannon_ctrl, lacto_change, ecoli_change
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(batch_id) DO UPDATE SET
      test_date=excluded.test_date, instrument=excluded.instrument, curve_r=excluded.curve_r,
      lod=excluded.lod, value_text=excluded.value_text, value_num=excluded.value_num,
      unit=excluded.unit, operator=excluded.operator, il1b=excluded.il1b, il1b_ctrl=excluded.il1b_ctrl,
      il6=excluded.il6, il6_ctrl=excluded.il6_ctrl, tnfa=excluded.tnfa, tnfa_ctrl=excluded.tnfa_ctrl,
      crp=excluded.crp, crp_ctrl=excluded.crp_ctrl, shannon=excluded.shannon,
      shannon_ctrl=excluded.shannon_ctrl, lacto_change=excluded.lacto_change, ecoli_change=excluded.ecoli_change
  `).run(
    batchId, e.testDate ?? '', e.instrument ?? '', numOrNull(e.curveR), numOrNull(e.lod),
    e.valueText ?? '', e.valueNum === '' || e.valueNum == null ? '' : String(e.valueNum),
    e.unit ?? '', e.operator ?? '',
    numOrNull(e.IL1b), numOrNull(e.IL1bCtrl), numOrNull(e.IL6), numOrNull(e.IL6Ctrl),
    numOrNull(e.TNFa), numOrNull(e.TNFaCtrl), numOrNull(e.CRP), numOrNull(e.CRPCtrl),
    numOrNull(e.shannon), numOrNull(e.shannonCtrl), numOrNull(e.lactoChange), numOrNull(e.ecoliChange),
  )
}

function assemble(b, farm, med, screen, ev, report, trace, review) {
  return {
    batchId: b.batch_id,
    updatedAt: b.updated_at || '',
    productName: b.product_name,
    brand: b.brand,
    platform: b.platform,
    team: b.team,
    program: b.program_json ? JSON.parse(b.program_json) : {},
    farm: rowToFarm(farm, med),
    screen: rowToScreen(screen),
    eval: rowToEval(ev),
    report: {
      generated: !!(report && report.generated),
      generatedAt: report?.generated_at || '',
      no: report?.no || '',
    },
    trace: {
      generated: !!(trace && trace.generated),
      generatedAt: trace?.generated_at || '',
      verifyId: trace?.verify_id || '',
    },
    review: rowToReview(review),
  }
}

function rowToFarm(row, med) {
  if (!row) return { ...DEMO_SEED.farm, medLog: [] }
  return {
    name: row.name ?? '',
    partners: row.partners ?? '',
    location: row.location ?? '',
    house: row.house ?? '',
    flockId: row.flock_id ?? '',
    breed: row.breed ?? '',
    hatchDate: row.hatch_date ?? '',
    stockDate: row.stock_date ?? '',
    plannedSlaughter: row.planned_slaughter ?? '',
    count: numOrEmpty(row.count),
    density: row.density ?? '',
    feedBrand: row.feed_brand ?? '',
    additive: row.additive ?? '',
    dose: row.dose ?? '',
    doseStartDay: numOrEmpty(row.dose_start_day),
    feedNote: row.feed_note ?? '',
    fcr: numOrEmpty(row.fcr),
    fcrControl: numOrEmpty(row.fcr_control),
    mortality: numOrEmpty(row.mortality),
    mortalityControl: numOrEmpty(row.mortality_control),
    medLog: (med || []).map((r) => ({
      date: r.date ?? '', item: r.item ?? '', dose: r.dose ?? '',
      purpose: r.purpose ?? '', result: r.result ?? '',
    })),
    houseEnv: parseHouseEnv(row.house_env_json),
  }
}

function parseHouseEnv(raw) {
  if (!raw) return makeDemoHouseEnv()
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed
  } catch { /* fallback */ }
  return makeDemoHouseEnv()
}

function parseExtra(raw) {
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

function rowToScreen(row) {
  if (!row) return { ...DEMO_SEED.screen, samples: [], extra: {} }
  const extra = parseExtra(row.extra_json)
  return {
    sampleId: row.sample_id ?? '',
    sampleDate: row.sample_date ?? '',
    samplePart: row.sample_part ?? '',
    method: row.method ?? '',
    mdspeMin: numOrEmpty(row.mdspe_min),
    goldMin: numOrEmpty(row.gold_min),
    target: row.target ?? '',
    qualitative: row.qualitative ?? '',
    result: row.result ?? '',
    lodNote: row.lod_note ?? '',
    operator: row.operator ?? '',
    qcLine: row.qc_line ?? '',
    notes: row.notes ?? '',
    samples: extra.samples,
    extra: extra.extra,
    instrument: row.instrument ?? '',
    curveR: numOrEmpty(row.curve_r),
    lod: numOrEmpty(row.lod),
    valueText: row.value_text ?? '',
    valueNum: row.value_num === '' || row.value_num == null ? '' : coerceMaybeNumber(row.value_num),
    unit: row.unit ?? 'μg/kg',
    hplcDate: row.hplc_date ?? '',
    hplcOperator: row.hplc_operator ?? '',
  }
}

function rowToReview(row) {
  if (!row) {
    return {
      sampleAccept: false,
      dataReview: false,
      reportIssue: false,
      reviewed: false,
      reviewer: '',
      reviewedAt: '',
    }
  }
  return {
    sampleAccept: !!row.sample_accept,
    dataReview: !!row.data_review,
    reportIssue: !!row.report_issue,
    reviewed: !!row.reviewed,
    reviewer: row.reviewer ?? '',
    reviewedAt: row.reviewed_at ?? '',
  }
}

function reviewFromRow(d, batchId) {
  return rowToReview(d.prepare('SELECT * FROM reviews WHERE batch_id = ?').get(batchId))
}

function upsertReview(d, batchId, r) {
  d.prepare(`
    INSERT INTO reviews (batch_id, sample_accept, data_review, report_issue, reviewed, reviewer, reviewed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(batch_id) DO UPDATE SET
      sample_accept=excluded.sample_accept, data_review=excluded.data_review,
      report_issue=excluded.report_issue, reviewed=excluded.reviewed,
      reviewer=excluded.reviewer, reviewed_at=excluded.reviewed_at
  `).run(
    batchId,
    r.sampleAccept ? 1 : 0,
    r.dataReview ? 1 : 0,
    r.reportIssue ? 1 : 0,
    r.reviewed ? 1 : 0,
    r.reviewer ?? '',
    r.reviewedAt ?? '',
  )
}

function rowToEval(row) {
  if (!row) return { ...DEMO_SEED.eval }
  return {
    testDate: row.test_date ?? '',
    instrument: row.instrument ?? '',
    curveR: numOrEmpty(row.curve_r),
    lod: numOrEmpty(row.lod),
    valueText: row.value_text ?? '',
    valueNum: row.value_num === '' || row.value_num == null ? '' : coerceMaybeNumber(row.value_num),
    unit: row.unit ?? '',
    operator: row.operator ?? '',
    IL1b: numOrEmpty(row.il1b),
    IL1bCtrl: numOrEmpty(row.il1b_ctrl),
    IL6: numOrEmpty(row.il6),
    IL6Ctrl: numOrEmpty(row.il6_ctrl),
    TNFa: numOrEmpty(row.tnfa),
    TNFaCtrl: numOrEmpty(row.tnfa_ctrl),
    CRP: numOrEmpty(row.crp),
    CRPCtrl: numOrEmpty(row.crp_ctrl),
    shannon: numOrEmpty(row.shannon),
    shannonCtrl: numOrEmpty(row.shannon_ctrl),
    lactoChange: numOrEmpty(row.lacto_change),
    ecoliChange: numOrEmpty(row.ecoli_change),
  }
}

function numOrNull(v) {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

function numOrEmpty(v) {
  if (v === '' || v == null) return ''
  const n = Number(v)
  return Number.isNaN(n) ? v : n
}

function coerceMaybeNumber(v) {
  const n = Number(v)
  return Number.isNaN(n) ? v : n
}
