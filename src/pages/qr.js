import QRCode from 'qrcode'
import { getVerdict, getState, loadSeal, demoTamper, demoRestore } from '../store.js'
import { humanHeadline } from '../lib/verdict.js'
import { renderNextBar, bindJourneyActions } from '../components/journey-ui.js'
import { ensureTrace } from '../lib/actions.js'
import { armButton } from '../lib/busy.js'
import { val } from '../bind-fields.js'
import { canWrite } from '../auth.js'
import {
  SEAL_CHAIN_BAD,
  SEAL_CHAIN_OK,
  SEAL_LIVE_BAD,
  SEAL_LIVE_OK,
  SEAL_OK,
} from '../lib/seal-copy.js'

export const meta = { id: 'qr', title: '追溯码' }

/**
 * 二维码指向本机消费者页（含批次号）。画布编码真实 URL，页面文案不展示隧道域名。
 * @param {string} batchId
 * @returns {string}
 */
export function traceUrl(batchId) {
  const hash = `#/trace/${encodeURIComponent(batchId)}`
  return `${location.origin}${location.pathname}${hash}`
}

/**
 * @param {object} state
 * @returns {string}
 */
export function render(state) {
  const v = getVerdict()
  if (!state.trace.generated) {
    return `
      <div class="page-head">
        <h2>追溯码</h2>
      </div>
      ${renderNextBar('qrEmpty')}
      <div class="card empty">尚未出码。点上面即可生成。建议先有报告，没有也会一并补上。</div>
    `
  }
  return `
    <div class="page-head">
      <h2>追溯码</h2>
    </div>
    ${renderNextBar('qr', `
      <button type="button" class="btn line" data-action="copy">复制批次号</button>
      <button type="button" class="btn line" data-action="dl">下载二维码</button>
      <button type="button" class="btn line" data-action="regen">重出</button>
    `)}
    <div class="card qr-hero">
      <div class="qr-box"><canvas id="qr-canvas" width="240" height="240"></canvas></div>
      <div>
        <p class="qr-kicker">批次溯源页</p>
        <p class="qr-batch">${val(state.batchId)}</p>
        <p class="qr-meta">核验号 ${val(state.trace.verifyId)} · ${val(state.trace.generatedAt)}<br>判定 ${humanHeadline(v, state)} · 报告 ${val(state.report.no || '将随出码补齐')}</p>
        <p class="sub qr-url">扫码打开<br><code>批次溯源页 · ${val(state.batchId)}</code></p>
      </div>
    </div>
    ${renderSealCard()}
  `
}

/**
 * @returns {string}
 */
function renderSealCard() {
  const writable = canWrite('trace')
  return `
    <div class="card mt-14" data-seal-card>
      <h3>封存验真</h3>
      <div data-seal-body>
        <p class="sub">正在读取…</p>
      </div>
      ${writable ? `
        <div class="seal-actions">
          <button type="button" class="btn line" data-action="seal-tamper">演示改数</button>
          <button type="button" class="btn" data-action="seal-restore">恢复</button>
        </div>
      ` : ''}
    </div>
  `
}

/**
 * @param {string} iso
 * @returns {string}
 */
function fmtAt(iso) {
  const s = String(iso || '')
  if (s.length >= 16) return s.slice(0, 16).replace('T', ' ')
  return s || '—'
}

/**
 * @param {Element} root
 * @param {object} state
 */
export async function bind(root, state) {
  bindJourneyActions(root, state)
  armButton(root.querySelector('[data-action="regen"]'), () => ensureTrace(state, true))
  const copy = root.querySelector('[data-action="copy"]')
  if (copy) {
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(state.batchId)
        copy.textContent = '已复制'
      } catch {
        copy.textContent = state.batchId
      }
    })
  }
  const canvas = root.querySelector('#qr-canvas')
  if (canvas) {
    await QRCode.toCanvas(canvas, traceUrl(state.batchId), {
      width: 240,
      margin: 1,
      color: { dark: '#12261c', light: '#fffdf8' },
    })
    const dl = root.querySelector('[data-action="dl"]')
    if (dl) {
      dl.addEventListener('click', () => {
        const a = document.createElement('a')
        a.href = canvas.toDataURL('image/png')
        a.download = `${state.batchId}-追溯码.png`
        a.click()
      })
    }
  }
  await bindSeal(root, state)
}

/**
 * @param {Element} root
 * @param {object} state
 */
async function bindSeal(root, state) {
  const batchId = state.batchId || getState().batchId
  const sealBody = root.querySelector('[data-seal-body]')
  async function paintSeal(seal) {
    if (!sealBody) return
    if (!seal) {
      sealBody.innerHTML = '<p class="sub">没有封存记录。</p>'
      return
    }
    const chainOk = !!seal.okChain
    const liveOk = !!seal.okLive
    const events = (seal.events || []).slice(-12)
    sealBody.innerHTML = `
      <p class="seal-audit-hl ${liveOk && chainOk ? 'ok' : 'bad'}">${val(seal.headline || SEAL_OK)}</p>
      <p class="sub">指纹 ${val(seal.fingerprint || '—')}</p>
      <p class="sub">${chainOk ? SEAL_CHAIN_OK : SEAL_CHAIN_BAD} · ${liveOk ? SEAL_LIVE_OK : SEAL_LIVE_BAD}</p>
      <ul class="seal-events">
        ${events.map((e) => `<li><span>${val(fmtAt(e.at))}</span><b>${val(e.post)}</b>${val(e.summary)}</li>`).join('') || '<li class="sub">暂无事件</li>'}
      </ul>
    `
  }
  try {
    await paintSeal(await loadSeal(batchId))
  } catch (ex) {
    if (sealBody) sealBody.innerHTML = `<p class="sub">${val(ex.message || '读取失败')}</p>`
  }
  async function runDemo(fn) {
    const tamper = root.querySelector('[data-action="seal-tamper"]')
    const restore = root.querySelector('[data-action="seal-restore"]')
    const pair = [tamper, restore]
    if (pair.some((el) => el && el.classList.contains('is-busy'))) return
    pair.forEach((el) => {
      if (!el) return
      el.classList.add('is-busy')
      el.disabled = true
    })
    try {
      const data = await fn()
      if (data?.seal) await paintSeal(data.seal)
    } catch (ex) {
      if (sealBody) {
        const p = document.createElement('p')
        p.className = 'login-error'
        p.textContent = ex.message || '操作失败。'
        sealBody.prepend(p)
      }
    } finally {
      pair.forEach((el) => {
        if (!el) return
        el.classList.remove('is-busy')
        el.disabled = false
      })
    }
  }
  root.querySelector('[data-action="seal-tamper"]')?.addEventListener('click', () => runDemo(demoTamper))
  root.querySelector('[data-action="seal-restore"]')?.addEventListener('click', () => runDemo(demoRestore))
}
