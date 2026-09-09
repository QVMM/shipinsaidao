import { get, post } from './api.js'
import { busy } from './lib/busy.js'
import { canWrite as roleCanWrite } from '../server/roles.js'

let user = null

export function getUser() {
  return user
}

export function setUser(next) {
  user = next
}

export async function hydrateAuth() {
  return busy(async () => {
  try {
    const data = await get('/api/auth/me')
    user = data.user || null
  } catch {
    user = null
  }
  return user
  })
}

export async function login(username, password) {
  return busy(async () => {
  const data = await post('/api/auth/login', { username, password })
  user = data.user
  return user
  })
}

export async function logout() {
  try {
    await post('/api/auth/logout', {})
  } catch {
    /* still clear local */
  }
  user = null
}

export function canWrite(action) {
  return roleCanWrite(user?.role, action)
}

export function roleLabel(role) {
  return {
    farm: '智慧养殖',
    screen: '安全检测',
    eval: '质量评价',
    trace: '数据溯源',
    admin: '管理员',
  }[role] || role || ''
}

export function isPublicHash(hash = location.hash) {
  const raw = decodeURIComponent((hash || '').replace(/^#/, ''))
  const id = raw.split('/').filter(Boolean)[0] || ''
  return id === 'consumer' || id === 'trace'
}
