import { NAV } from '../lib/journey.js'
import { ROLES } from '../data.js'
import { markSvg } from '../svg.js'
import { NAV_ICONS } from '../icons.js'
import { getFlash, getState, resetState } from '../store.js'
import { openStage } from '../lib/open-stage.js'
import { canWrite, getUser, logout, roleLabel } from '../auth.js'
import { renderStepper } from './journey-ui.js'

function renderNav(routeId) {
  return NAV.map((n) => `
    <a href="${n.href}" data-nav="${n.id}" class="${routeId === n.id ? 'active' : ''}">
      ${NAV_ICONS[n.id] || ''}
      <span>${n.label}</span>
    </a>
  `).join('')
}

export function renderShell(state, route, inner) {
  const user = getUser()
  const role = user?.role || route.role || 'farm'
  const flash = getFlash()
  return `
    <div class="app-shell">
      <aside class="rail">
        <div class="brand">
          <div class="brand-mark">${markSvg}</div>
          <div>
            <h1>替抗蓟化</h1>
            <p>减抗鸡肉 · 全链条质控</p>
          </div>
        </div>
        <nav class="nav" aria-label="产品信息">
          <span class="nav-indicator" aria-hidden="true"></span>
          ${renderNav(route.id)}
        </nav>
        <div class="rail-foot">
          ${user ? `
            <div class="who">
              <b>${esc(user.displayName)}</b>
              <span>${esc(user.username)} · ${esc(roleLabel(user.role))}</span>
              <button type="button" class="ghost" data-action="logout">退出</button>
            </div>
          ` : ''}
          <details class="roles-fold">
            <summary>岗位说明</summary>
            <div class="role-list" role="list">
              ${ROLES.map((r) => `
                <div class="role ${role === r.id ? 'active' : ''}" role="listitem">
                  <b>${r.label}</b>
                  <span>${r.who}</span>
                </div>
              `).join('')}
            </div>
          </details>
          <p class="demo-note">现场完成检测。本系统用于录入、出报告、出追溯码。各岗可查看全部页面，仅能改本岗数据。</p>
          <button type="button" class="ghost" data-action="open-stage">打开数据大屏</button>
          ${canWrite('reset') ? '<button type="button" class="ghost" data-action="reset">恢复预填数据</button>' : ''}
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <div class="crumb">替抗蓟化 · 当前：<b data-crumb-title>${route.title}</b></div>
          <div class="top-actions">
            <button type="button" class="batch-pill" data-batch-pill title="更换批次">${esc(state.batchId || '选择批次')}</button>
          </div>
        </header>
        <div class="stepper-wrap no-print">${renderStepper(route.id)}</div>
        ${flash ? `<div class="flash" role="status">${esc(flash)}</div>` : ''}
        <div class="content" id="page">${inner}</div>
      </div>
    </div>
  `
}

export function renderPublicShell(inner) {
  return `
    <div class="public-shell">
      <header class="public-bar">
        <div class="brand-mark">${markSvg}</div>
        <div>
          <strong>替抗蓟化</strong>
          <span>扫码可查 · 不用登录</span>
        </div>
      </header>
      <div class="content" id="page">${inner}</div>
    </div>
  `
}

export function renderSkeleton() {
  return `
    <div class="skel-page" aria-hidden="true">
      <div class="skel skel-hero"></div>
      <div class="skel skel-btn"></div>
    </div>
  `
}

export function updateChrome(root, state, route) {
  root.querySelectorAll('[data-nav]').forEach((a) => {
    a.classList.toggle('active', a.dataset.nav === route.id)
  })
  const crumb = root.querySelector('[data-crumb-title]')
  if (crumb) crumb.textContent = route.title
  const pill = root.querySelector('[data-batch-pill]')
  if (pill) pill.textContent = route.id === 'batches' ? '选择批次' : (state.batchId || '选择批次')
  const stepper = root.querySelector('.stepper-wrap')
  if (stepper) stepper.innerHTML = renderStepper(route.id)
  let flashEl = root.querySelector('.flash')
  const msg = getFlash()
  if (msg) {
    if (!flashEl) {
      flashEl = document.createElement('div')
      flashEl.className = 'flash'
      flashEl.setAttribute('role', 'status')
      root.querySelector('#page')?.before(flashEl)
    }
    flashEl.textContent = msg
  } else if (flashEl) {
    flashEl.remove()
  }
  const user = getUser()
  const role = user?.role || route.role || 'farm'
  root.querySelectorAll('.role-list .role').forEach((el, i) => {
    el.classList.toggle('active', ROLES[i]?.id === role)
  })
  slideNav(root, route.id)
}

export function slideNav(root, routeId) {
  const nav = root.querySelector('.nav')
  const ind = root.querySelector('.nav-indicator')
  const active = nav?.querySelector(`[data-nav="${routeId}"]`)
  if (!nav || !ind) return
  if (!active) {
    ind.style.opacity = '0'
    ind.style.height = '0px'
    nav.classList.remove('has-indicator')
    return
  }
  ind.style.opacity = '1'
  ind.style.transform = `translateY(${active.offsetTop}px)`
  ind.style.height = `${active.offsetHeight}px`
  nav.classList.add('has-indicator')
}

export function bindShell(root, onLogout) {
  const reset = root.querySelector('[data-action="reset"]')
  if (reset) {
    reset.addEventListener('click', () => {
      if (confirm('恢复为预填批次「蓟化-2026-0812」？当前改动会清除。')) resetState()
    })
  }
  const stageBtn = root.querySelector('[data-action="open-stage"]')
  if (stageBtn) {
    stageBtn.addEventListener('click', () => openStage(getState().batchId))
  }
  const pill = root.querySelector('[data-batch-pill]')
  if (pill) {
    pill.addEventListener('click', () => {
      location.hash = '#/batches'
    })
  }
  const out = root.querySelector('[data-action="logout"]')
  if (out) {
    out.addEventListener('click', async () => {
      await logout()
      onLogout?.()
    })
  }
}

function esc(v) {
  return v == null ? '' : String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')
}
