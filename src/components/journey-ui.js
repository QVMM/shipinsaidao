import { STEPS, getPageMeta } from '../lib/journey.js'
import { ensureReport, ensureTrace, jumpReport } from '../lib/actions.js'
import { iconChevron } from '../icons.js'
import { armButton } from '../lib/busy.js'
import { canWrite } from '../auth.js'

/**
 * 始终可见的故事步进：你在哪、下一步是哪。
 * @param {string} pageId
 * @returns {string}
 */
export function renderStepper(pageId) {
  const current = STEPS.find((s) => s.pages.includes(pageId))
  const currentIdx = current ? STEPS.indexOf(current) : -1
  return `
    <ol class="stepper" aria-label="产品路径">
      ${STEPS.map((s, i) => {
        const cls = currentIdx < 0 ? '' : i < currentIdx ? 'done' : i === currentIdx ? 'now' : ''
        const currentAttr = i === currentIdx ? ' aria-current="step"' : ''
        return `<li class="${cls}"${currentAttr}><a href="${s.href}">${s.label}</a></li>`
      }).join('')}
    </ol>
  `
}

/**
 * 已隐藏：不再展示「这一页看什么」三行说明。
 * @param {string} [_metaKey]
 * @returns {string}
 */
export function renderBrief(_metaKey) {
  return ''
}

/**
 * 每页一个主按钮。extra 留给打印、重出这类次要操作。
 * @param {string} metaKey
 * @param {string} [extra]
 * @returns {string}
 */
const REPORT_ACTIONS = new Set(['jump-report', 'gen-report', 'next-report'])

function gateReportLink(link) {
  if (!link) return link
  if (!link.action || !REPORT_ACTIONS.has(link.action)) return link
  if (canWrite('report')) return link
  if (link.href) {
    return { href: link.href, label: String(link.label || '').replace('生成检测报告', '查看检测报告') }
  }
  return null
}

export function renderNextBar(metaKey, extra = '') {
  const meta = getPageMeta(metaKey)
  const n = gateReportLink(meta.next)
  const s = gateReportLink(meta.secondary)
  const primary = n
    ? (n.action
      ? `<button type="button" class="btn gold" data-action="${n.action}">${n.label}${iconChevron}</button>`
      : `<a class="btn gold" href="${n.href}">${n.label}${iconChevron}</a>`)
    : ''
  const secondary = s
    ? (s.action
      ? `<button type="button" class="text-link" data-action="${s.action}">${s.label}</button>`
      : `<a class="text-link" href="${s.href}">${s.label}</a>`)
    : ''
  return `
    <div class="next-bar">
      ${primary}
      ${secondary}
      ${extra}
    </div>
  `
}

/**
 * 把旅程按钮接到出报告 / 出码。
 * @param {ParentNode} root
 * @param {object} state
 */
export function bindJourneyActions(root, state) {
  armButton(root.querySelector('[data-action="jump-report"]'), () => jumpReport(state))
  armButton(root.querySelector('[data-action="next-report"]'), () => jumpReport(state))
  armButton(root.querySelector('[data-action="gen-report"]'), () => ensureReport(state))
  armButton(root.querySelector('[data-action="gen-qr"]'), () => ensureTrace(state))
}
