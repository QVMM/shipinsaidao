import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { getDb, nowIso } from './db.js'

const COOKIE = 'tihua_session'
const STAGE_COOKIE = 'djtk_stage'
const DAYS = 7
/** Booth cookie TTL (seconds). */
const STAGE_TTL_SEC = 12 * 60 * 60

export const COOKIE_NAME = COOKIE
export const STAGE_COOKIE_NAME = STAGE_COOKIE

function publicUser(row) {
  if (!row) return null
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    displayName: row.display_name,
  }
}

export function findUserByName(username) {
  return getDb().prepare('SELECT * FROM users WHERE username = ?').get(username)
}

export function verifyPassword(user, password) {
  if (!user || typeof password !== 'string') return false
  return bcrypt.compareSync(password, user.password_hash)
}

export function createSession(userId) {
  const token = randomBytes(32).toString('hex')
  const created = nowIso()
  const expires = new Date(Date.now() + DAYS * 24 * 60 * 60 * 1000).toISOString()
  getDb().prepare(`
    INSERT INTO sessions (token, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(token, userId, expires, created)
  return { token, expiresAt: expires }
}

export function destroySession(token) {
  if (!token) return
  getDb().prepare('DELETE FROM sessions WHERE token = ?').run(token)
}

export function userFromToken(token) {
  if (!token) return null
  const row = getDb().prepare(`
    SELECT u.* FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ?
  `).get(token, nowIso())
  return publicUser(row)
}

export function readToken(req) {
  const raw = req.cookies?.[COOKIE]
  if (!raw) return ''
  if (typeof req.unsignCookie === 'function') {
    const u = req.unsignCookie(raw)
    if (u.valid) return u.value
    if (u.value) return ''
  }
  return raw
}

export function setSessionCookie(reply, token) {
  const secure = process.env.COOKIE_SECURE === '1' || process.env.NODE_ENV === 'production'
  reply.setCookie(COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    signed: true,
    maxAge: DAYS * 24 * 60 * 60,
  })
}

export function clearSessionCookie(reply) {
  reply.clearCookie(COOKIE, { path: '/' })
}

export async function requireStaff(req, reply) {
  const user = userFromToken(readToken(req))
  if (!user) {
    return reply.code(401).send({ error: 'unauthorized', message: '请先登录。' })
  }
  req.user = user
}

export { publicUser }

/**
 * Booth / stage: logged-in staff OR x-stage-token matching env DJTK_STAGE_TOKEN
 * OR valid httpOnly djtk_stage cookie minted by /api/djtk/stage-session.
 * No published default — unset env means header/body stage-token auth is disabled,
 * but booth cookie can still mint when MIMO_API_KEY is configured.
 */
export function stageDemoToken() {
  return String(process.env.DJTK_STAGE_TOKEN || process.env.STAGE_DEMO_TOKEN || '').trim()
}

/**
 * Server-only material used to HMAC-sign the booth cookie.
 * Prefers DJTK_STAGE_TOKEN; else SESSION_SECRET; else a hash of MIMO_API_KEY
 * (never returned to clients). Empty → booth cookie minting disabled.
 */
export function stageCookieSigningKey() {
  const stage = stageDemoToken()
  if (stage) return stage
  const sess = String(process.env.SESSION_SECRET || '').trim()
  if (sess && sess !== 'dev-only-change-me') return sess
  const mimo = String(process.env.MIMO_API_KEY || '').trim()
  if (mimo) {
    return createHmac('sha256', 'djtk-booth-v1').update(mimo).digest('hex')
  }
  // Dev fallback only when SESSION_SECRET is the placeholder
  if (sess) return sess
  return ''
}

/** True when booth may mint / accept the signed stage cookie. */
export function stageBoothEnabled() {
  return !!stageCookieSigningKey()
}


function hmacHex(key, msg) {
  return createHmac('sha256', key).update(msg).digest('hex')
}

/**
 * Mint opaque booth payload: `1.<expMs>.<nonce>` signed as `payload.sig`.
 * Never includes the raw stage token.
 */
export function mintStageCookieValue() {
  const key = stageCookieSigningKey()
  if (!key) return null
  const exp = Date.now() + STAGE_TTL_SEC * 1000
  const nonce = randomBytes(8).toString('hex')
  const payload = `1.${exp}.${nonce}`
  const sig = hmacHex(key, payload)
  return `${payload}.${sig}`
}

/**
 * Verify booth cookie value. Returns true if valid & not expired.
 */
export function verifyStageCookieValue(raw) {
  const key = stageCookieSigningKey()
  if (!key || !raw || typeof raw !== 'string') return false
  const parts = raw.split('.')
  // payload = 1.exp.nonce  → joined as "1.exp.nonce"; sig is last segment
  if (parts.length < 4) return false
  const sig = parts.pop()
  const payload = parts.join('.')
  const expected = hmacHex(key, payload)
  try {
    const a = Buffer.from(sig, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false
  } catch {
    return false
  }
  const [, expStr] = payload.split('.')
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || Date.now() > exp) return false
  return true
}

export function readStageCookie(req) {
  const raw = req.cookies?.[STAGE_COOKIE]
  if (!raw) return ''
  // Prefer unsigned raw (we HMAC ourselves); also accept cookie-plugin signed form.
  if (typeof req.unsignCookie === 'function') {
    const u = req.unsignCookie(raw)
    if (u.valid) return u.value
  }
  return raw
}

export function setStageSessionCookie(reply, value) {
  const secure = process.env.COOKIE_SECURE === '1' || process.env.NODE_ENV === 'production'
  reply.setCookie(STAGE_COOKIE, value, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    // We HMAC ourselves; do not double-sign with cookie plugin (avoids opaque opaque).
    signed: false,
    maxAge: STAGE_TTL_SEC,
  })
}

export function clearStageSessionCookie(reply) {
  reply.clearCookie(STAGE_COOKIE, { path: '/' })
}

export function stageCookieValid(req) {
  return verifyStageCookieValue(readStageCookie(req))
}

export async function requireStaffOrStage(req, reply) {
  const user = userFromToken(readToken(req))
  if (user) {
    req.user = user
    return
  }
  if (stageCookieValid(req)) {
    req.user = null
    req.stageDemo = true
    return
  }
  const expected = stageDemoToken()
  const provided = String(
    req.headers['x-stage-token']
    || req.body?.stageToken
    || (typeof req.query?.stageToken === 'string' ? req.query.stageToken : '')
    || '',
  ).trim()
  if (expected && provided && provided === expected) {
    req.user = null
    req.stageDemo = true
    return
  }
  return reply.code(401).send({ error: 'unauthorized', message: '请先登录工作人员账号，或由展台配置舞台令牌。' })
}
