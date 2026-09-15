/** DJTK智控助手：演示话术三段（开头风险 → 中间判定 → 升华收束）。 */

import { speakDemoAct, stopDemoSpeech } from './demo-tts.js'
import { DEMO_ACTS, DEMO_SCRIPT } from './demo-script.js'

export { DEMO_ACTS, DEMO_SCRIPT }
export { DEMO_CHIP_LABELS, matchDemoAct, demoReply } from './demo-script.js'

export const CUSTOMS_URL = 'http://stats.customs.gov.cn/'

/** @typedef {'open' | 'mid' | 'end'} DemoAct */

/** 兼容旧引用 */
export const CUSTOMS_ALERT = {
  source: '【演示·非真实】海关中心政务公开',
  sourceHref: CUSTOMS_URL,
  title: '【演示·非真实】出口鸡肉兽药残留预警',
  body: DEMO_SCRIPT.open.assistant.say,
  next: DEMO_SCRIPT.open.assistant.note,
  cta: DEMO_SCRIPT.open.cta,
  href: DEMO_SCRIPT.open.href,
  openCustoms: '打开海关政务公开（演示链接）',
}

/**
 * @param {'staff' | 'stage'} [tone]
 * @param {DemoAct} [act]
 * @returns {string}
 */
export function renderMonitorAssistant(tone = 'staff', act = 'open') {
  const s = DEMO_SCRIPT[act] || DEMO_SCRIPT.open
  if (tone === 'stage') {
    return `
    <aside class="monitor-assist is-stage is-collapsed is-${esc(s.tone)}" data-monitor-assist data-collapsed="1" data-demo-act="${esc(s.id)}">
      <button type="button" class="ma-chip" data-assist-toggle aria-expanded="false" title="展开 DJTK 智控助手">
        <i class="ma-chip-dot" aria-hidden="true"></i>
        <span class="ma-chip-label">DJTK</span>
        <span class="ma-chip-text">${esc(s.chip)}</span>
        <span class="ma-chip-hint">展开</span>
      </button>
      <div class="ma-panel" hidden data-demo-panel>
        ${renderDemoPanel(s, true)}
      </div>
    </aside>
  `
  }
  return `
    <aside class="monitor-assist is-staff is-${esc(s.tone)}" data-monitor-assist data-demo-act="${esc(s.id)}" data-demo-panel>
      ${renderDemoPanel(s, false)}
    </aside>
  `
}

/**
 * @param {typeof DEMO_SCRIPT[DemoAct]} s
 * @param {boolean} withCollapse
 */
function renderDemoPanel(s, withCollapse) {
  const team = (s.team || [])
    .map((line) => `<li>${esc(line)}</li>`)
    .join('')
  return `
    <div class="ma-panel-hd">
      <p class="ma-kicker">
        <b>DJTK智控助手</b>
        <span class="ma-step">${esc(s.step)}</span>
        ${s.customs ? `· <a class="ma-source" href="${esc(CUSTOMS_URL)}" target="_blank" rel="noopener noreferrer">【演示·非真实】海关中心政务公开</a>` : ''}
      </p>
      ${withCollapse ? '<button type="button" class="ma-collapse" data-assist-toggle aria-label="收起助手">收起</button>' : ''}
    </div>
    <div class="ma-dialog" data-demo-dialog>
      <article class="ma-bubble is-user">
        <header>${esc(s.engineer.who)}</header>
        <p>${esc(s.engineer.say)}</p>
      </article>
      <article class="ma-bubble is-bot">
        <header>
          <span class="ma-mark" aria-hidden="true"><span>${esc(s.mark)}</span></span>
          ${esc(s.assistant.who)}
        </header>
        <p>${esc(s.assistant.say)}</p>
        ${s.assistant.note ? `<p class="ma-note">${esc(s.assistant.note)}</p>` : ''}
        ${team ? `<ul class="ma-team">${team}</ul>` : ''}
      </article>
    </div>
    <div class="ma-actions ${withCollapse ? '' : 'is-staff-actions'}">
      ${s.customs ? `<a class="ma-link-out${withCollapse ? '' : ' is-staff-link'}" href="${esc(CUSTOMS_URL)}" target="_blank" rel="noopener noreferrer">打开海关政务公开（演示链接）</a>` : ''}
      <button type="button" class="ma-speak" data-demo-speak>播报本段</button>
      <button type="button" class="ma-speak-stop" data-demo-stop hidden>停止播报</button>
      <span class="ma-speak-status" data-demo-speak-status hidden aria-live="polite"></span>
      <button type="button" class="ma-prev" data-demo-prev>上一段</button>
      <button type="button" class="ma-next-act" data-demo-next>${esc(s.nextLabel)}</button>
      <a class="ma-cta" href="${esc(s.href)}" data-assistant-cta>${esc(s.cta)}</a>
    </div>
  `
}

/**
 * @param {ParentNode} root
 * @param {{ onStart?: () => void, onAct?: (act: DemoAct) => void }} [opts]
 */
export function bindMonitorAssistant(root, opts = {}) {
  const box = /** @type {HTMLElement | null} */ (root.querySelector('[data-monitor-assist]'))
  if (!box || box.dataset.bound === '1') return
  box.dataset.bound = '1'

  /** @type {DemoAct} */
  let act = /** @type {DemoAct} */ (box.dataset.demoAct || 'open')
  const isStage = box.classList.contains('is-stage')

  const setSpeakingUi = (on, { error = false } = {}) => {
    const play = box.querySelector('[data-demo-speak]')
    const stop = box.querySelector('[data-demo-stop]')
    const st = box.querySelector('[data-demo-speak-status]')
    if (play) {
      play.hidden = on
      // Keep 「播报本段」 visible after success or failure (retry)
      if (!on) play.hidden = false
    }
    if (stop) stop.hidden = !on
    box.classList.toggle('is-speaking', on)
    if (st) {
      if (on) {
        st.hidden = false
        st.textContent = '播报中…'
        st.classList.remove('is-error')
      } else if (error) {
        st.hidden = false
        st.textContent = '播报失败，可重试'
        st.classList.add('is-error')
      } else {
        st.hidden = true
        st.textContent = ''
        st.classList.remove('is-error')
      }
    }
  }

  const playAct = () => {
    const s = DEMO_SCRIPT[act]
    setSpeakingUi(true)
    speakDemoAct(s, {
      onStart() { setSpeakingUi(true) },
      onEnd() { setSpeakingUi(false) },
      onError() { setSpeakingUi(false, { error: true }) },
    })
  }

  const setCollapsed = (collapsed) => {
    const panel = box.querySelector('.ma-panel')
    const chip = box.querySelector('.ma-chip')
    box.classList.toggle('is-collapsed', collapsed)
    box.dataset.collapsed = collapsed ? '1' : '0'
    if (panel) panel.hidden = collapsed
    if (chip) chip.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
    if (collapsed) {
      stopDemoSpeech()
      setSpeakingUi(false)
    }
  }

  const paint = (next, { autoSpeak = true } = {}) => {
    act = next
    const s = DEMO_SCRIPT[act]
    box.dataset.demoAct = act
    box.classList.remove('is-warn', 'is-ok', 'is-warm')
    box.classList.add(`is-${s.tone}`)

    const chipText = box.querySelector('.ma-chip-text')
    if (chipText) chipText.textContent = s.chip

    if (isStage) {
      const panel = box.querySelector('[data-demo-panel]')
      if (panel) panel.innerHTML = renderDemoPanel(s, true)
    } else {
      box.innerHTML = renderDemoPanel(s, false)
    }
    opts.onAct?.(act)
    if (autoSpeak && (!isStage || box.dataset.collapsed !== '1')) playAct()
  }

  box.addEventListener('click', (ev) => {
    const t = /** @type {HTMLElement} */ (ev.target)
    const toggle = t.closest?.('[data-assist-toggle]')
    if (toggle && box.contains(toggle)) {
      ev.preventDefault()
      const willExpand = box.dataset.collapsed === '1'
      setCollapsed(!willExpand)
      if (willExpand) playAct()
      return
    }
    const speakBtn = t.closest?.('[data-demo-speak]')
    if (speakBtn && box.contains(speakBtn)) {
      ev.preventDefault()
      playAct()
      return
    }
    const stopBtn = t.closest?.('[data-demo-stop]')
    if (stopBtn && box.contains(stopBtn)) {
      ev.preventDefault()
      stopDemoSpeech()
      setSpeakingUi(false)
      return
    }
    const next = t.closest?.('[data-demo-next]')
    if (next && box.contains(next)) {
      ev.preventDefault()
      const i = DEMO_ACTS.indexOf(act)
      if (isStage) setCollapsed(false)
      paint(DEMO_ACTS[(i + 1) % DEMO_ACTS.length])
      return
    }
    const prev = t.closest?.('[data-demo-prev]')
    if (prev && box.contains(prev)) {
      ev.preventDefault()
      const i = DEMO_ACTS.indexOf(act)
      if (isStage) setCollapsed(false)
      paint(DEMO_ACTS[(i - 1 + DEMO_ACTS.length) % DEMO_ACTS.length])
      return
    }
    const link = t.closest?.('[data-assistant-cta]')
    if (link && box.contains(link)) {
      stopDemoSpeech()
      setSpeakingUi(false)
      opts.onStart?.()
      const href = link.getAttribute('href') || ''
      if (href.startsWith('#/')) {
        ev.preventDefault()
        location.hash = href
      }
    }
  })
}


function esc(v) {
  return v == null ? '' : String(v)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
