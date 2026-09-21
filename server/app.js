import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import staticFiles from '@fastify/static'
import {
  DEFAULT_BATCH_ID,
  ensureSeeded,
  generateReport,
  generateTrace,
  getBatch,
  getPublicTrace,
  getPublicStage,
  listAudit,
  listBatches,
  patchBatch,
  resetBatch,
  saveReview,
  createBatch,
} from './db.js'
import { getPublicCommand } from './command.js'
import {
  clearSessionCookie,
  createSession,
  destroySession,
  findUserByName,
  mintStageCookieValue,
  publicUser,
  readToken,
  requireStaff,
  requireStaffOrStage,
  setSessionCookie,
  setStageSessionCookie,
  stageBoothEnabled,
  stageCookieValid,
  userFromToken,
  verifyPassword,
} from './auth.js'
import { buildDjtkEvidence, buildLocalAnswer, sanitizeDjtkAnswer } from './local-assistant.js'
import { getOfflineVoiceStatus, transcribePcm16 } from './offline-voice.js'
import { synthesizeOfflineVoiceIsolated } from './offline-voice-runner.js'
import { actionsInPatch, canWrite, denyMessage } from './roles.js'
import { getSeal } from './seal.js'
import { offlineMode } from './runtime.js'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))

const DJTK_Q_MAX = 200
const DJTK_TTS_MAX = 300
const ASK_LIMIT = { windowMs: 60_000, max: 8 }
const TTS_LIMIT = { windowMs: 60_000, max: 15 }
const TRANSCRIBE_LIMIT = { windowMs: 60_000, max: 15 }

/** Simple in-memory rate limit (single instance). Key = IP + session fragment. */
function makeRateLimiter({ windowMs, max }) {
  /** @type {Map<string, { start: number, count: number }>} */
  const hits = new Map()
  return (key) => {
    const now = Date.now()
    let bucket = hits.get(key)
    if (!bucket || now - bucket.start > windowMs) {
      bucket = { start: now, count: 0 }
      hits.set(key, bucket)
    }
    bucket.count += 1
    if (hits.size > 5000) {
      for (const [k, v] of hits) {
        if (now - v.start > windowMs) hits.delete(k)
      }
    }
    return bucket.count <= max
  }
}

const askLimiter = makeRateLimiter(ASK_LIMIT)
const ttsLimiter = makeRateLimiter(TTS_LIMIT)
const transcribeLimiter = makeRateLimiter(TRANSCRIBE_LIMIT)
// A wall display, operator console and test/inspection tabs may share one NAT IP.
// This endpoint only mints a signed httpOnly booth cookie; Q&A keeps its own tighter limit.
const STAGE_SESSION_LIMIT = { windowMs: 60_000, max: 120 }
const stageSessionLimiter = makeRateLimiter(STAGE_SESSION_LIMIT)

function clientKey(req) {
  const ip = String(req.ip || req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim()
  const sess = readToken(req)
  const sessPart = sess ? sess.slice(0, 12) : 'anon'
  return `${ip}|${sessPart}`
}


export async function buildApp() {
  ensureSeeded()

  const app = Fastify({
    trustProxy: process.env.TRUST_PROXY === '1',
    logger: {
      serializers: {
        req(req) {
          return { method: req.method, url: req.url }
        },
      },
    },
  })

  await app.register(cookie, { secret: process.env.SESSION_SECRET || 'dev-only-change-me' })

  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: 4 * 1024 * 1024 }, (_req, body, done) => {
    done(null, body)
  })

  app.post('/api/auth/login', async (req, reply) => {
    const username = String(req.body?.username || '').trim()
    const password = String(req.body?.password || '')
    if (!username || !password) {
      return reply.code(400).send({ error: 'invalid', message: '请填写用户名和密码。' })
    }
    const user = findUserByName(username)
    if (!user || !verifyPassword(user, password)) {
      return reply.code(401).send({ error: 'invalid', message: '用户名或密码不对。' })
    }
    const { token } = createSession(user.id)
    setSessionCookie(reply, token)
    return { user: publicUser(user) }
  })

  app.post('/api/auth/logout', async (req, reply) => {
    destroySession(readToken(req))
    clearSessionCookie(reply)
    return { ok: true }
  })

  app.get('/api/auth/me', async (req) => {
    return { user: userFromToken(readToken(req)) }
  })

  app.get('/api/public/trace/:batchId', async (req, reply) => {
    const data = getPublicTrace(decodeParam(req.params.batchId))
    if (!data) return reply.code(404).send({ error: 'not_found', message: '没有这个批次的公开溯源。' })
    return data
  })

  app.get('/api/public/stage/:batchId', async (req, reply) => {
    const data = getPublicStage(decodeParam(req.params.batchId))
    if (!data) return reply.code(404).send({ error: 'not_found', message: '没有这个批次的公开大屏。' })
    return data
  })

  app.get('/api/public/command', async () => {
    return getPublicCommand()
  })

  app.get('/api/public/seal/:batchId', async (req, reply) => {
    const batchId = decodeParam(req.params.batchId)
    const data = getSeal(batchId)
    if (!data) return reply.code(404).send({ error: 'not_found', message: '没有这个批次的封存。' })
    return data
  })

  app.get('/api/batches', { preHandler: requireStaff }, async () => {
    return { items: listBatches() }
  })

  app.post('/api/batches', { preHandler: requireStaff }, async (req, reply) => {
    if (!canWrite(req.user.role, 'create')) {
      return reply.code(403).send({ error: 'forbidden', message: denyMessage(req.user.role, 'create') })
    }
    return createBatch(req.user)
  })

  app.get('/api/batches/:batchId', { preHandler: requireStaff }, async (req, reply) => {
    const data = getBatch(decodeParam(req.params.batchId))
    if (!data) return reply.code(404).send({ error: 'not_found', message: '没有这个批次。' })
    return data
  })

  app.patch('/api/batches/:batchId', { preHandler: requireStaff }, async (req, reply) => {
    const batchId = decodeParam(req.params.batchId)
    const body = req.body || {}
    const denied = actionsInPatch(body).find((a) => !canWrite(req.user.role, a))
    if (denied) {
      return reply.code(403).send({ error: 'forbidden', message: denyMessage(req.user.role, denied) })
    }
    const data = patchBatch(batchId, body, req.user)
    if (!data) return reply.code(404).send({ error: 'not_found', message: '没有这个批次。' })
    return data
  })

  app.post('/api/batches/:batchId/report', { preHandler: requireStaff }, async (req, reply) => {
    if (!canWrite(req.user.role, 'report')) {
      return reply.code(403).send({ error: 'forbidden', message: denyMessage(req.user.role, 'report') })
    }
    let data
    try {
      data = generateReport(decodeParam(req.params.batchId), req.user, !!req.body?.force)
    } catch (err) {
      if (err?.code === 'issuance_blocked') {
        return reply.code(409).send({ error: err.code, message: err.message, reasons: err.reasons })
      }
      throw err
    }
    if (!data) return reply.code(404).send({ error: 'not_found', message: '没有这个批次。' })
    return data
  })

  app.post('/api/batches/:batchId/trace', { preHandler: requireStaff }, async (req, reply) => {
    if (!canWrite(req.user.role, 'trace')) {
      return reply.code(403).send({ error: 'forbidden', message: denyMessage(req.user.role, 'trace') })
    }
    let data
    try {
      data = generateTrace(decodeParam(req.params.batchId), req.user, !!req.body?.force)
    } catch (err) {
      if (err?.code === 'issuance_blocked') {
        return reply.code(409).send({ error: err.code, message: err.message, reasons: err.reasons })
      }
      throw err
    }
    if (!data) return reply.code(404).send({ error: 'not_found', message: '没有这个批次。' })
    return data
  })

  app.post('/api/batches/:batchId/reset', { preHandler: requireStaff }, async (req, reply) => {
    if (!canWrite(req.user.role, 'reset')) {
      return reply.code(403).send({ error: 'forbidden', message: denyMessage(req.user.role, 'reset') })
    }
    const data = resetBatch(decodeParam(req.params.batchId), req.user)
    if (!data) return reply.code(404).send({ error: 'not_found', message: '没有这个批次。' })
    return data
  })

  app.post('/api/batches/:batchId/review', { preHandler: requireStaff }, async (req, reply) => {
    if (!canWrite(req.user.role, 'audit')) {
      return reply.code(403).send({ error: 'forbidden', message: denyMessage(req.user.role, 'audit') })
    }
    const data = saveReview(decodeParam(req.params.batchId), req.body || {}, req.user)
    if (!data) return reply.code(404).send({ error: 'not_found', message: '没有这个批次。' })
    return data
  })

  app.get('/api/audit', { preHandler: requireStaff }, async (req) => {
    const batchId = typeof req.query.batchId === 'string' ? req.query.batchId : ''
    return { items: listAudit(batchId || undefined) }
  })

  app.get('/api/djtk/status', async () => {
    const voiceProfile = getOfflineVoiceStatus()
    return {
      ok: true,
      mode: 'competition-offline',
      cloudModel: false,
      voiceInput: 'offline-sensevoice',
      voiceOutput: voiceProfile.ttsEngine,
      voiceName: voiceProfile.voice,
      voiceGender: voiceProfile.voiceGender,
      voiceReady: voiceProfile.ready,
      asrReady: voiceProfile.asrReady,
      ttsReady: voiceProfile.ttsReady,
      voiceMessage: voiceProfile.message,
      networkRequired: false,
      offlineMode: offlineMode(),
      stageAuth: 'staff-session-or-booth-cookie-or-x-stage-token',
      stageBooth: stageBoothEnabled(),
    }
  })

  /**
   * Mint httpOnly booth cookie for anonymous #/stage.
   * Never returns the raw stage token / signing key in the body.
   */
  async function mintStageSession(req, reply) {
    const ip = String(req.ip || req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim()
    if (!stageSessionLimiter(ip)) {
      return reply.code(429).send({ error: 'rate_limited', message: '展台会话请求太频繁，请稍后再试。' })
    }
    if (!stageBoothEnabled()) {
      return reply.code(503).send({
        error: 'stage_booth_disabled',
        message: '展台会话未启用（需配置 DJTK_STAGE_TOKEN 或 SESSION_SECRET）。',
        ok: false,
      })
    }
    if (stageCookieValid(req)) {
      return { ok: true, refreshed: false }
    }
    const value = mintStageCookieValue()
    if (!value) {
      return reply.code(503).send({ error: 'stage_booth_disabled', message: '展台会话无法签发。', ok: false })
    }
    setStageSessionCookie(reply, value)
    return { ok: true, refreshed: true }
  }

  app.post('/api/djtk/stage-session', mintStageSession)
  app.get('/api/djtk/stage-session', mintStageSession)

  app.post('/api/djtk/ask', { preHandler: requireStaffOrStage }, async (req, reply) => {
    if (!askLimiter(clientKey(req))) {
      return reply.code(429).send({ error: 'rate_limited', message: '提问太频繁，请稍后再试。' })
    }
    const question = String(req.body?.question || '').trim()
    const batchId = String(req.body?.batchId || DEFAULT_BATCH_ID || '').trim() || DEFAULT_BATCH_ID
    if (!question) {
      return reply.code(400).send({ error: 'invalid', message: '请先输入问题。' })
    }
    if (question.length > DJTK_Q_MAX) {
      return reply.code(400).send({ error: 'invalid', message: `问题请控制在 ${DJTK_Q_MAX} 字以内。` })
    }
    const evidence = buildDjtkEvidence(batchId)
    const result = buildLocalAnswer(question, evidence)
    return {
      answer: sanitizeDjtkAnswer(result.answer, evidence),
      audioBase64: null,
      mime: null,
      voice: 'system',
      model: 'local-evidence',
      degraded: false,
      fast: result.fast,
      local: true,
      ttsFallback: true,
    }
  })

  app.post('/api/djtk/transcribe', { preHandler: requireStaffOrStage }, async (req, reply) => {
    if (!transcribeLimiter(clientKey(req))) {
      return reply.code(429).send({ error: 'rate_limited', message: '语音识别请求太频繁，请稍后再试。' })
    }
    const sampleRate = Number(req.headers['x-sample-rate'] || 16000)
    if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 48000) {
      return reply.code(400).send({ error: 'invalid_sample_rate', message: '录音采样率不正确。' })
    }
    const result = await transcribePcm16(req.body, sampleRate)
    if (!result.ok) return reply.code(result.status).send({ error: 'offline_asr_failed', message: result.error })
    return result
  })

  app.post('/api/djtk/tts', { preHandler: requireStaffOrStage }, async (req, reply) => {
    if (!ttsLimiter(clientKey(req))) {
      return reply.code(429).send({ error: 'rate_limited', message: '语音请求太频繁，请稍后再试。' })
    }
    const text = String(req.body?.text || '').trim()
    if (!text) {
      return reply.code(400).send({ error: 'invalid', message: '没有要播报的文字。' })
    }
    if (text.length > DJTK_TTS_MAX) {
      return reply.code(400).send({ error: 'invalid', message: `播报文字请控制在 ${DJTK_TTS_MAX} 字以内。` })
    }
    const voice = await synthesizeOfflineVoiceIsolated(text)
    if (!voice.ok) {
      req.log.warn({ status: voice.status, error: voice.error }, 'djtk offline voice unavailable')
      return reply.code(voice.status).send({
        error: 'offline_voice_unavailable',
        message: voice.error,
        fallback: false,
      })
    }
    return voice
  })

  app.get('/api/health', async () => {
    const voice = getOfflineVoiceStatus()
    return {
      ok: true,
      defaultBatchId: DEFAULT_BATCH_ID,
      mode: 'competition-offline',
      voiceReady: voice.ready,
      networkRequired: false,
    }
  })

  const dist = resolve(root, 'dist')
  if (existsSync(dist)) {
    await app.register(staticFiles, { root: dist })
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'not_found', message: '没有这个接口。' })
      }
      return reply.sendFile('index.html')
    })
  }

  return app
}

function decodeParam(v) {
  try {
    return decodeURIComponent(v)
  } catch {
    return v
  }
}
