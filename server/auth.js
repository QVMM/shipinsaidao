import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { getDb, nowIso } from './db.js'

const COOKIE = 'tihua_session'
const DAYS = 7

export const COOKIE_NAME = COOKIE

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
  reply.setCookie(COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
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
