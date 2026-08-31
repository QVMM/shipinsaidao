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
} from './db.js'
import { getPublicCommand } from './command.js'
import {
  clearSessionCookie,
  createSession,
  destroySession,
  findUserByName,
  publicUser,
  readToken,
  requireStaff,
  setSessionCookie,
  userFromToken,
  verifyPassword,
} from './auth.js'
import { actionsInPatch, canWrite, denyMessage } from './roles.js'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))

export async function buildApp() {
  ensureSeeded()

  const app = Fastify({
    logger: {
      serializers: {
        req(req) {
          return { method: req.method, url: req.url }
        },
      },
    },
  })

  await app.register(cookie, { secret: process.env.SESSION_SECRET || 'dev-only-change-me' })

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

  app.get('/api/batches', { preHandler: requireStaff }, async () => {
    return { items: listBatches() }
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
    const data = generateReport(decodeParam(req.params.batchId), req.user, !!req.body?.force)
    if (!data) return reply.code(404).send({ error: 'not_found', message: '没有这个批次。' })
    return data
  })

  app.post('/api/batches/:batchId/trace', { preHandler: requireStaff }, async (req, reply) => {
    if (!canWrite(req.user.role, 'trace')) {
      return reply.code(403).send({ error: 'forbidden', message: denyMessage(req.user.role, 'trace') })
    }
    const data = generateTrace(decodeParam(req.params.batchId), req.user, !!req.body?.force)
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

  app.get('/api/health', async () => ({ ok: true, defaultBatchId: DEFAULT_BATCH_ID }))

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
