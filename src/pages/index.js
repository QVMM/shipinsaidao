import * as dashboard from './dashboard.js'
import * as farm from './farm.js'
import * as screen from './screen.js'
import * as evalPage from './eval.js'
import * as report from './report.js'
import * as qr from './qr.js'
import * as consumer from './consumer.js'
import * as stage from './stage.js'
import * as batches from './batches.js'
import * as audit from './audit.js'

/** 旧地址继续能跳：#/dashboard #/trace/批次 以及 batch/home/overview。 */
export const pages = {
  dashboard,
  farm,
  screen,
  eval: evalPage,
  report,
  qr,
  consumer,
  trace: consumer,
  stage,
  wall: stage,
  batches,
  audit,
  batch: dashboard,
  overview: dashboard,
  home: dashboard,
}

const ALIASES = {
  batch: 'dashboard',
  overview: 'dashboard',
  home: 'dashboard',
  trace: 'consumer',
  wall: 'stage',
}

const ROLE_BY_PAGE = {
  farm: 'farm',
  screen: 'screen',
  eval: 'eval',
  report: 'trace',
  qr: 'trace',
  consumer: 'trace',
  audit: 'trace',
}

/**
 * @returns {{ id: string, title: string, role: string, batchFromUrl: string, page: typeof dashboard }}
 */
export function parseHash() {
  const raw = decodeURIComponent((location.hash || '#/dashboard').replace(/^#/, ''))
  const parts = raw.split('/').filter(Boolean)
  const rawId = parts[0] || 'dashboard'
  const id = ALIASES[rawId] || rawId
  const page = pages[id] || pages[rawId] || dashboard
  const inferred = ROLE_BY_PAGE[page.meta.id]
  const stored = sessionStorage.getItem('tihua-role') || 'farm'
  const role = inferred || stored
  if (inferred) sessionStorage.setItem('tihua-role', inferred)
  return {
    id: page.meta.id,
    title: page.meta.title,
    role,
    batchFromUrl: rawId === 'trace' || rawId === 'stage' || rawId === 'wall'
      ? parts.slice(1).join('/')
      : '',
    page,
  }
}
