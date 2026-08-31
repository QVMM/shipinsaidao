import QRCode from 'qrcode'
import { getVerdict } from '../store.js'
import { humanHeadline } from '../lib/verdict.js'
import { renderNextBar, bindJourneyActions } from '../components/journey-ui.js'
import { ensureTrace } from '../lib/actions.js'
import { armButton } from '../lib/busy.js'
import { val } from '../bind-fields.js'

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
        <p class="qr-meta">核验号 ${val(state.trace.verifyId)} · ${val(state.trace.generatedAt)}<br>判定 ${humanHeadline(v)} · 报告 ${val(state.report.no || '将随出码补齐')}</p>
        <p class="sub qr-url">扫码打开<br><code>批次溯源页 · ${val(state.batchId)}</code></p>
      </div>
    </div>
  `
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
}
