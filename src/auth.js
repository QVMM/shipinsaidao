import { get, post } from './api.js'
import { busy } from './lib/busy.js'

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
  const role = user?.role
  if (!role) return false
  if (role === 'admin') return true
  if (action === 'farm' || action === 'meta') return role === 'farm'
  if (action === 'screen') return role === 'screen'
  if (action === 'eval') return role === 'eval'
  if (action === 'report' || action === 'trace' || action === 'reset' || action === 'audit') {
    return role === 'trace'
  }
  return false
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
