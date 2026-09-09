import { cloneSeed, DEMO_SEED } from './data.js'
import { computeVerdict } from './lib/verdict.js'
import { get, patch, post } from './api.js'
import { getUser } from './auth.js'
import { busy } from './lib/busy.js'

const listeners = new Set()
const DEFAULT_BATCH_ID = DEMO_SEED.batchId
const BATCH_KEY = 'tihua-batch'

let state = cloneSeed()
let loadedId = DEFAULT_BATCH_ID
let snapshot = structuredClone(state)
let dirty = new Set()
let flushTimer = 0
let flash = ''
let loaded = false

export function getState() {
  return state
}

export function getFlash() {
  return flash
}

export function setFlash(msg) {
  flash = msg || ''
  emit()
}

export function getVerdict() {
  return computeVerdict(state)
}

export function currentBatchId() {
  return loadedId || state.batchId || chosenBatchId() || DEFAULT_BATCH_ID
}

export function isLoaded() {
  return loaded
}

/**
 * @returns {string}
 */
export function chosenBatchId() {
  try {
    return sessionStorage.getItem(BATCH_KEY) || ''
  } catch {
    return ''
  }
}

/**
 * @param {string} [id]
 */
export function setChosenBatchId(id) {
  try {
    if (id) sessionStorage.setItem(BATCH_KEY, id)
    else sessionStorage.removeItem(BATCH_KEY)
  } catch {
    /* ignore */
  }
}

export function setState(p) {
  state = deepMerge(state, p)
  if (p.farm) dirty.add('farm')
  if (p.screen) dirty.add('screen')
  if (p.eval) dirty.add('eval')
  if (p.report) dirty.add('report')
  if (p.trace) dirty.add('trace')
  if (p.review) dirty.add('review')
  scheduleFlush()
  emit()
}

export function patchPath(path, value) {
  const segs = path.split('.')
  const next = structuredClone(state)
  let cur = next
  for (let i = 0; i < segs.length - 1; i++) {
    if (cur[segs[i]] == null || typeof cur[segs[i]] !== 'object') cur[segs[i]] = {}
    cur = cur[segs[i]]
  }
  const last = segs[segs.length - 1]
  const prev = cur[last]
  cur[last] = typeof prev === 'number' && value !== '' && !Number.isNaN(Number(value)) ? Number(value) : value
  state = next
  markDirty(segs[0])
  scheduleFlush()
}

export function patchMed(index, field, value) {
  const next = structuredClone(state)
  next.farm.medLog[index][field] = value
  state = next
  dirty.add('farm')
  scheduleFlush()
}

/**
 * @param {number} index
 * @param {string} field
 * @param {unknown} value
 */
export function patchSample(index, field, value) {
  const next = structuredClone(state)
  if (!Array.isArray(next.screen.samples) || !next.screen.samples[index]) return
  next.screen.samples[index][field] = value
  state = next
  dirty.add('screen')
  scheduleFlush()
}

export function addMed() {
  const next = structuredClone(state)
  next.farm.medLog.push({ date: '', item: '', dose: '', purpose: '', result: '' })
  state = next
  dirty.add('farm')
  flushNow()
  emit()
}

export async function resetState() {
  try {
    const data = await post(`/api/batches/${enc(currentBatchId())}/reset`, {})
    adopt(data)
    flash = '已恢复预填批次。'
    emit()
  } catch (err) {
    flash = err.message || '恢复失败。'
    emit()
  }
}

export async function loadBatch(batchId) {
  const id = batchId || chosenBatchId()
  if (!id) {
    const err = new Error('尚未选择批次')
    err.code = 'no-batch'
    throw err
  }
  return busy(async () => {
  const data = await get(`/api/batches/${enc(id)}`)
  adopt(data)
  setChosenBatchId(state.batchId)
  loaded = true
  emit()
  return state
  })
}

/**
 * @returns {Promise<{ batchId: string, productName: string, farmName?: string, count?: number, updatedAt: string }[]>}
 */
export async function listBatches() {
  return busy(async () => {
    const data = await get('/api/batches')
    return data.items || []
  })
}

/**
 * @returns {Promise<object>}
 */
export async function createBatch() {
  return busy(async () => {
    const data = await post('/api/batches', {})
    adopt(data)
    setChosenBatchId(state.batchId)
    loaded = true
    emit()
    return state
  })
}

export async function loadPublic(batchId = DEFAULT_BATCH_ID) {
  return busy(async () => {
  const data = await get(`/api/public/trace/${enc(batchId)}`)
  const seed = cloneSeed()
  state = {
    ...seed,
    ...data,
    farm: { ...seed.farm, ...(data.farm || {}) },
    screen: {
      ...seed.screen,
      ...(data.screen || {}),
      samples: Array.isArray(data.screen?.samples) ? data.screen.samples : [],
      extra: data.screen?.extra || {},
    },
    eval: { ...seed.eval, ...(data.eval || {}) },
    report: { ...seed.report, ...(data.report || {}) },
    trace: { ...seed.trace, ...(data.trace || {}) },
    review: { ...seed.review, ...(data.review || {}) },
  }
  loadedId = state.batchId
  snapshot = structuredClone(state)
  dirty.clear()
  loaded = true
  emit()
  return state
  })
}

export async function generateReport(force = false) {
  return busy(async () => {
  const data = await post(`/api/batches/${enc(currentBatchId())}/report`, { force })
  adopt(data)
  emit()
  return state
  })
}

export async function generateTrace(force = false) {
  return busy(async () => {
  const data = await post(`/api/batches/${enc(currentBatchId())}/trace`, { force })
  adopt(data)
  emit()
  return state
  })
}

/**
 * @param {object} review
 */
export async function saveReview(review) {
  return busy(async () => {
    const data = await post(`/api/batches/${enc(currentBatchId())}/review`, review)
    adopt(data)
    emit()
    return state
  })
}

/**
 * @param {string} [batchId]
 */
export async function loadAudit(batchId) {
  const q = batchId ? `?batchId=${enc(batchId)}` : ''
  const data = await get(`/api/audit${q}`)
  return data.items || []
}

/**
 * @param {string} [batchId]
 */
export async function loadSeal(batchId) {
  const id = batchId || currentBatchId()
  return get(`/api/public/seal/${enc(id)}`)
}

/**
 * @returns {Promise<object>}
 */
export async function demoTamper() {
  return busy(async () => {
    const data = await post(`/api/batches/${enc(currentBatchId())}/seal/tamper`, {})
    if (data.batch) adopt(data.batch)
    emit()
    return data
  })
}

/**
 * @returns {Promise<object>}
 */
export async function demoRestore() {
  return busy(async () => {
    const data = await post(`/api/batches/${enc(currentBatchId())}/seal/restore`, {})
    if (data.batch) adopt(data.batch)
    emit()
    return data
  })
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function markDirty(top) {
  if (top === 'farm' || top === 'screen' || top === 'eval' || top === 'report' || top === 'trace' || top === 'review') {
    dirty.add(top)
  } else dirty.add('meta')
}

function scheduleFlush() {
  if (!getUser()) return
  clearTimeout(flushTimer)
  flushTimer = window.setTimeout(() => {
    flushNow()
  }, 400)
}

export async function flushNow() {
  clearTimeout(flushTimer)
  if (!getUser() || dirty.size === 0) return
  const body = {}
  if (dirty.has('farm')) body.farm = state.farm
  if (dirty.has('screen')) body.screen = state.screen
  if (dirty.has('eval')) body.eval = state.eval
  if (dirty.has('review')) body.review = state.review
  if (dirty.has('meta')) {
    body.batchId = state.batchId
    body.productName = state.productName
    body.brand = state.brand
    body.platform = state.platform
    body.team = state.team
    body.program = state.program
  }
  dirty.clear()
  try {
    const data = await patch(`/api/batches/${enc(loadedId)}`, body, { silent: true })
    adopt(data)
    if (flash) {
      flash = ''
      emit()
    }
  } catch (err) {
    state = structuredClone(snapshot)
    flash = err.message || '没有权限保存。'
    emit()
  }
}

function adopt(data) {
  state = data
  if (!state.screen) state.screen = {}
  if (!Array.isArray(state.screen.samples)) state.screen.samples = []
  if (!state.screen.extra || typeof state.screen.extra !== 'object') state.screen.extra = {}
  if (!state.review) {
    state.review = {
      sampleAccept: false, dataReview: false, reportIssue: false,
      reviewed: false, reviewer: '', reviewedAt: '',
    }
  }
  loadedId = data.batchId
  snapshot = structuredClone(state)
  dirty.clear()
}

function emit() {
  listeners.forEach((fn) => fn(state))
}

function deepMerge(base, p) {
  const out = structuredClone(base)
  for (const [k, v] of Object.entries(p)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = { ...out[k], ...v }
    else out[k] = v
  }
  return out
}

function enc(id) {
  return encodeURIComponent(id)
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (dirty.size) flushNow()
  })
}
