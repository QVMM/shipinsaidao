/** 角色能写什么。管理员全开。 */

export const ROLE_LABEL = {
  farm: '智慧养殖',
  screen: '安全检测',
  eval: '质量评价',
  trace: '数据溯源',
  admin: '管理员',
}

export const ACCOUNTS = [
  { username: 'yangzhi', role: 'farm', displayName: '智慧养殖' },
  { username: 'kuaijian', role: 'screen', displayName: '安全检测' },
  { username: 'pingjia', role: 'eval', displayName: '质量评价' },
  { username: 'suyuan', role: 'trace', displayName: '数据溯源' },
  { username: 'guanli', role: 'admin', displayName: '管理员' },
]

export const DEFAULT_PASSWORD = 'Demo#2026'

const WRITE = {
  farm: new Set(['farm', 'meta']),
  screen: new Set(['screen']),
  eval: new Set(['eval']),
  trace: new Set(['farm', 'meta', 'screen', 'eval', 'report', 'trace', 'reset', 'audit', 'create']),
  admin: new Set(['farm', 'meta', 'screen', 'eval', 'report', 'trace', 'reset', 'audit', 'create']),
}

/**
 * @param {string} role
 * @param {string} action
 */
export function canWrite(role, action) {
  if (!role) return false
  return WRITE[role]?.has(action) === true
}

/**
 * @param {string} role
 * @param {string} action
 */
export function denyMessage(role, action) {
  const who = ROLE_LABEL[role] || '当前账号'
  const map = {
    farm: `当前账号（${who}）不能改养殖档案。`,
    meta: `当前账号（${who}）不能改批次信息。`,
    screen: `当前账号（${who}）不能改安全检测结果。`,
    eval: `当前账号（${who}）不能改质量评价。`,
    report: `当前账号（${who}）不能生成检测报告。`,
    trace: `当前账号（${who}）不能出追溯码。`,
    reset: '只有管理员和溯源员可以恢复预填数据。',
    audit: `当前账号（${who}）不能做封存验真。`,
    create: `当前账号（${who}）不能新建批次。`,
  }
  return map[action] || `当前账号（${who}）没有这项权限。`
}

/**
 * PATCH 体里出现的顶层字段对应哪些写动作。
 * @param {object} body
 * @returns {string[]}
 */
export function actionsInPatch(body) {
  const actions = []
  if (!body || typeof body !== 'object') return actions
  if (body.farm != null) actions.push('farm')
  if (body.screen != null) actions.push('screen')
  if (body.eval != null) actions.push('eval')
  if (
    body.batchId != null
    || body.productName != null
    || body.brand != null
    || body.platform != null
    || body.team != null
    || body.program != null
  ) {
    actions.push('meta')
  }
  if (body.report != null) actions.push('report')
  if (body.trace != null) actions.push('trace')
  if (body.review != null) actions.push('audit')
  return [...new Set(actions)]
}
