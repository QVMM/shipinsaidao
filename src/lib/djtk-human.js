/**
 * DJTK 数字人：指挥舱浮动面板 + 全屏 AI 指挥舱，问答 + MIMO 语音（失败则浏览器 TTS）。
 * Auth: staff session cookie preferred; optional x-stage-token only if injected
 * (window.__DJTK_STAGE_TOKEN__ or sessionStorage djtk_stage_token) — never hardcoded.
 */

import { post } from '../api.js'
import { chosenBatchId, getState } from '../store.js'

/** 展台快捷问：一律走 grounded ask，禁止本地臆造合格/用药。 */
const STARTERS = [
  '这批鸡从哪来？',
  '安不安全？能上桌吗？',
  '下一步我该点哪里？',
  '当前焦点批次风险？',
  '氟苯尼考筛查结果？',
  '有哪些待复核 / 下一步点哪？',
  '解释海关演示预警',
]

const SS_KEY = 'djtk_stage_token'

let activeAudio = null
/** @type {null | ((ok: boolean) => void)} */
let activeAudioDone = null

/** @type {null | { destroy: () => void, exitCabin: () => void }} */
let activeCtrl = null

function esc(v) {
  return v == null ? '' : String(v)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/**
 * Stage token only from server-injected window var or sessionStorage after staff helper.
 * Empty → rely on cookies when logged in.
 */
export function getStageToken() {
  try {
    if (typeof window !== 'undefined' && window.__DJTK_STAGE_TOKEN__) {
      return String(window.__DJTK_STAGE_TOKEN__).trim()
    }
    const fromSs = sessionStorage.getItem(SS_KEY)
    if (fromSs) return String(fromSs).trim()
  } catch { /* ignore */ }
  return ''
}

/** @deprecated Use getStageToken(); kept empty so old imports do not leak a secret. */
export const STAGE_TOKEN = ''

/**
 * Optional helper after staff login for booth tooling — not set automatically.
 * @param {string} token
 */
export function setStageToken(token) {
  try {
    const t = String(token || '').trim()
    if (!t) sessionStorage.removeItem(SS_KEY)
    else sessionStorage.setItem(SS_KEY, t)
  } catch { /* ignore */ }
}

function stageHeaders() {
  const t = getStageToken()
  return t ? { 'x-stage-token': t } : {}
}

function stageBody() {
  const t = getStageToken()
  return t ? { stageToken: t } : {}
}

export function stopDjtkAudio() {
  try {
    activeAudio?.pause()
  } catch { /* ignore */ }
  activeAudio = null
  const done = activeAudioDone
  activeAudioDone = null
  try { done?.(false) } catch { /* ignore */ }
  try {
    window.speechSynthesis?.cancel()
  } catch { /* ignore */ }
}

function isBrowserSpeechOk() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
}

/**
 * Play base64 wav; resolves when ended/errored/stopped.
 * @param {string} base64
 * @param {string} [mime]
 * @param {{ onStart?: () => void, onEnd?: () => void }} [hooks]
 */
export function playBase64Audio(base64, mime = 'audio/wav', hooks = {}) {
  return new Promise((resolve) => {
    stopDjtkAudio()
    if (!base64) {
      hooks.onEnd?.()
      resolve(false)
      return
    }
    const url = `data:${mime};base64,${base64}`
    const audio = new Audio(url)
    activeAudio = audio
    let settled = false
    const done = (ok) => {
      if (settled) return
      settled = true
      if (activeAudio === audio) activeAudio = null
      if (activeAudioDone === done) activeAudioDone = null
      hooks.onEnd?.()
      resolve(ok)
    }
    activeAudioDone = done
    audio.onended = () => done(true)
    audio.onerror = () => done(false)
    hooks.onStart?.()
    audio.play().catch(() => done(false))
  })
}

/**
 * Browser speechSynthesis one-shot (Chinese).
 * @param {string} text
 * @param {{ onStart?: () => void, onEnd?: () => void }} [hooks]
 */
export function speakBrowser(text, hooks = {}) {
  return new Promise((resolve) => {
    if (!isBrowserSpeechOk() || !String(text || '').trim()) {
      hooks.onEnd?.()
      resolve(false)
      return
    }
    try { window.speechSynthesis.cancel() } catch { /* ignore */ }
    const u = new SpeechSynthesisUtterance(String(text).trim())
    u.lang = 'zh-CN'
    u.rate = 1.02
    const list = window.speechSynthesis.getVoices?.() || []
    const voice = list.find((v) => /zh(-|_)CN/i.test(v.lang)) || list.find((v) => /^zh/i.test(v.lang))
    if (voice) u.voice = voice
    u.onend = () => { hooks.onEnd?.(); resolve(true) }
    u.onerror = () => { hooks.onEnd?.(); resolve(false) }
    hooks.onStart?.()
    try {
      window.speechSynthesis.speak(u)
    } catch {
      hooks.onEnd?.()
      resolve(false)
    }
  })
}

/**
 * Prefer MIMO TTS API, else browser.
 * @param {string} text
 * @param {{ onStart?: () => void, onEnd?: () => void, signal?: AbortSignal }} [opts]
 */
export async function speakWithMimoOrBrowser(text, opts = {}) {
  const say = String(text || '').trim()
  if (!say) {
    opts.onEnd?.()
    return false
  }
  try {
    const data = await post('/api/djtk/tts', {
      text: say.slice(0, 300),
      ...stageBody(),
    }, { silent: true, signal: opts.signal, headers: stageHeaders() })
    if (data?.audioBase64) {
      return playBase64Audio(data.audioBase64, data.mime || 'audio/wav', opts)
    }
  } catch (err) {
    if (err?.name === 'AbortError') {
      opts.onEnd?.()
      return false
    }
  }
  return speakBrowser(say, opts)
}

/**
 * Photo face for fab / panel / cabin. suffix kept for call-site identity.
 * @param {'fab' | 'panel' | 'cabin'} suffix
 */
function avatarHtml(suffix = 'panel') {
  return `
    <span class="djtk-face djtk-face-photo" data-djtk-face data-djtk-face-ctx="${suffix}" aria-hidden="true">
      <img class="djtk-face-img" src="/djtk-avatar-closed.png" alt="" decoding="async" />
      <i class="djtk-face-glow" aria-hidden="true"></i>
      <span class="djtk-face-wave" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
    </span>
  `
}

function chipsHtml() {
  return STARTERS.map((q) => `<button type="button" class="djtk-chip" data-djtk-chip>${esc(q)}</button>`).join('')
}

function cabinMarkup() {
  return `
    <div class="djtk-cabin-hud" role="dialog" aria-modal="true" aria-label="DJTK 全屏指挥舱">
      <div class="djtk-cabin-glow" aria-hidden="true"></div>
      <header class="djtk-cabin-top">
        <div class="djtk-cabin-brand">
          <b>DJTK · AI 指挥舱</b>
          <span>替抗蓟化 · 质控溯源 · 证据问答</span>
        </div>
        <p class="djtk-cabin-first">第一次可以点下方快捷问，或直接输入。回答只依据平台记录；不做用药处方；降级会标【降级】；海关相关须标【演示·非真实】。</p>
        <button type="button" class="djtk-cabin-exit" data-djtk-cabin-exit title="退出全屏指挥舱（Esc）">退出</button>
      </header>
      <div class="djtk-cabin-main">
        <section class="djtk-cabin-hero">
          <div class="djtk-cabin-avatar" data-djtk-avatar>${avatarHtml('cabin')}</div>
          <p class="djtk-cabin-hero-name">DJTK智控助手</p>
          <p class="djtk-cabin-hero-sub" data-djtk-cabin-speak-hint>待命</p>
        </section>
        <section class="djtk-cabin-chat">
          <div class="djtk-chips djtk-cabin-chips">${chipsHtml()}</div>
          <div class="djtk-log" data-djtk-log aria-live="polite"></div>
          <form class="djtk-form" data-djtk-form>
            <input type="text" name="q" data-djtk-input maxlength="200" placeholder="输入问题，例如：当前焦点批次风险？" autocomplete="off" />
            <button type="submit" class="djtk-send" data-djtk-send>发送</button>
            <button type="button" class="djtk-stop" data-djtk-stop hidden>停止</button>
          </form>
          <p class="djtk-status" data-djtk-status hidden></p>
        </section>
        <aside class="djtk-cabin-side">
          <article class="djtk-cabin-card">
            <h3>焦点批次摘要</h3>
            <p class="djtk-cabin-batch" data-djtk-cabin-batch>—</p>
            <p class="djtk-cabin-card-hint">以页面焦点档案与检测记录为准，助手不臆造合格结论。</p>
          </article>
          <article class="djtk-cabin-card">
            <h3>风险 / 下一步</h3>
            <nav class="djtk-cabin-links">
              <a href="#/screen">安全检测</a>
              <a href="#/eval">健康评价</a>
              <a href="#/dashboard">总览看板</a>
              <a href="#/stage">指挥舱大屏</a>
            </nav>
          </article>
        </aside>
      </div>
    </div>
  `
}

/**
 * @param {{ compact?: boolean }} [opts]
 */
export function renderDjtkHuman(opts = {}) {
  const compact = !!opts.compact
  const starters = chipsHtml()
  return `
    <aside class="djtk-human ${compact ? 'is-compact' : 'is-stage'}" data-djtk-human data-collapsed="${compact ? '0' : '1'}">
      ${compact ? '' : `
      <button type="button" class="djtk-fab" data-djtk-toggle aria-expanded="false" title="打开 DJTK 智控助手" aria-label="打开 DJTK 智控助手">
        <span class="djtk-fab-face">${avatarHtml('fab')}</span>
      </button>`}
      <div class="djtk-panel${compact ? ' is-open' : ''}" ${compact ? '' : 'hidden'} data-djtk-panel>
        <header class="djtk-hd">
          <div class="djtk-avatar" data-djtk-avatar>${avatarHtml('panel')}</div>
          <div class="djtk-hd-copy">
            <b>DJTK智控助手</b>
            <span>替抗蓟化 · 质控溯源</span>
          </div>
          <div class="djtk-hd-actions">
            <button type="button" class="djtk-cabin-open" data-djtk-cabin-open title="进入全屏 AI 指挥舱">全屏指挥舱</button>
            ${compact ? '' : '<button type="button" class="djtk-close" data-djtk-close data-djtk-toggle aria-label="收起">收起</button>'}
          </div>
        </header>
        <p class="djtk-tip">第一次可以问：从哪来、安不安全、下一步、焦点风险、氟苯尼考筛查、待复核、海关演示预警。点「全屏指挥舱」可进入大屏问答。</p>
        <div class="djtk-chips">${starters}</div>
        <div class="djtk-log" data-djtk-log aria-live="polite"></div>
        <form class="djtk-form" data-djtk-form>
          <input type="text" name="q" data-djtk-input maxlength="200" placeholder="输入问题，例如：这批鸡从哪来？" autocomplete="off" />
          <button type="submit" class="djtk-send" data-djtk-send>发送</button>
          <button type="button" class="djtk-stop" data-djtk-stop hidden>停止</button>
        </form>
        <p class="djtk-status" data-djtk-status hidden></p>
      </div>
    </aside>
  `
}

/**
 * Tear down active DJTK controller (cabin overlay, audio, listeners).
 * Call from page unbind / route leave.
 */
export function unbindDjtkHuman() {
  try {
    activeCtrl?.destroy()
  } catch { /* ignore */ }
  activeCtrl = null
}

/**
 * @param {ParentNode} root
 * @param {{ compact?: boolean, batchId?: string }} [opts]
 */
export function bindDjtkHuman(root, opts = {}) {
  unbindDjtkHuman()

  const box = /** @type {HTMLElement | null} */ (root.querySelector('[data-djtk-human]'))
  if (!box) return
  box.dataset.bound = '1'

  // Stage float lives on body (like cabin) so wall-board CSS scale cannot skew hit-testing.
  const floatOnBody = !opts.compact
  if (floatOnBody && box.parentElement !== document.body) {
    box.classList.add('is-body-float')
    document.body.appendChild(box)
  }

  /** @type {{ role: string, content: string }[]} */
  const history = []

  const cabin = document.createElement('div')
  cabin.className = 'djtk-cabin'
  cabin.hidden = true
  cabin.setAttribute('data-djtk-cabin', '')
  cabin.innerHTML = cabinMarkup()
  document.body.appendChild(cabin)

  const panelLogs = () => [...box.querySelectorAll('[data-djtk-log]')]
  const cabinLogs = () => [...cabin.querySelectorAll('[data-djtk-log]')]
  const allLogs = () => [...panelLogs(), ...cabinLogs()]

  const panelInputs = () => [...box.querySelectorAll('[data-djtk-input]')].map((el) => /** @type {HTMLInputElement} */ (el))
  const cabinInputs = () => [...cabin.querySelectorAll('[data-djtk-input]')].map((el) => /** @type {HTMLInputElement} */ (el))
  const allInputs = () => [...panelInputs(), ...cabinInputs()]

  const allSend = () => [...box.querySelectorAll('[data-djtk-send]'), ...cabin.querySelectorAll('[data-djtk-send]')]
  const allStop = () => [...box.querySelectorAll('[data-djtk-stop]'), ...cabin.querySelectorAll('[data-djtk-stop]')]
  const allChips = () => [...box.querySelectorAll('[data-djtk-chip]'), ...cabin.querySelectorAll('[data-djtk-chip]')]
  const allStatus = () => [...box.querySelectorAll('[data-djtk-status]'), ...cabin.querySelectorAll('[data-djtk-status]')]

  let asking = false
  let askSeq = 0
  /** @type {AbortController | null} */
  let askAbort = null
  let cabinOpen = false

  const resolveBatchId = () => {
    try {
      const h = location.hash || ''
      const m = h.match(/#\/(?:stage|wall)\/([^/?#]+)/)
      if (m?.[1]) return decodeURIComponent(m[1])
    } catch { /* ignore */ }
    const fromOpts = String(opts.batchId || '').trim()
    if (fromOpts) return fromOpts
    try {
      return String(chosenBatchId() || getState()?.batchId || '').trim()
    } catch {
      return ''
    }
  }

  const refreshCabinBatch = () => {
    const el = cabin.querySelector('[data-djtk-cabin-batch]')
    if (!el) return
    const id = resolveBatchId()
    el.textContent = id || '（当前页未绑定批次，问答将用平台默认焦点批）'
  }

  const setBusy = (on) => {
    asking = on
    allSend().forEach((b) => { b.disabled = on })
    allChips().forEach((c) => { c.disabled = on })
    allInputs().forEach((inp) => { inp.disabled = on })
  }

  const setThinking = (on) => {
    box.classList.toggle('is-thinking', on)
    cabin.classList.toggle('is-thinking', on)
  }

  const setSpeaking = (on) => {
    box.classList.toggle('is-speaking', on)
    cabin.classList.toggle('is-speaking', on)
    if (on) setThinking(false)
    const hint = cabin.querySelector('[data-djtk-cabin-speak-hint]')
    if (hint) hint.textContent = on ? '播报中…' : (asking ? '思考中…' : '待命')
    allStop().forEach((btn) => {
      btn.hidden = !on && !asking
      if (on) btn.hidden = false
    })
  }

  const setStatus = (msg) => {
    allStatus().forEach((status) => {
      if (!msg) {
        status.hidden = true
        status.textContent = ''
        return
      }
      status.hidden = false
      status.textContent = msg
    })
  }

  const pushBubble = (role, text) => {
    allLogs().forEach((log) => {
      const art = document.createElement('article')
      const degraded = role === 'bot' && String(text || '').startsWith('【降级')
      const demo = role === 'bot' && /【演示·非真实】/.test(String(text || ''))
      art.className = `djtk-bubble is-${role}${degraded ? ' is-degraded' : ''}${demo ? ' is-demo' : ''}`
      const title = role === 'user' ? '你' : 'DJTK智控助手'
      const badges = []
      if (degraded) badges.push('<span class="djtk-badge">降级</span>')
      if (demo) badges.push('<span class="djtk-badge is-demo">演示·非真实</span>')
      art.innerHTML = `<header>${title}${badges.join('')}</header><p></p>`
      art.querySelector('p').textContent = text
      log.appendChild(art)
      log.scrollTop = log.scrollHeight
    })
  }

  const pushTip = (msg) => {
    allLogs().forEach((log) => {
      const tip = document.createElement('p')
      tip.className = 'djtk-log-tip'
      tip.textContent = msg
      log.appendChild(tip)
      log.scrollTop = log.scrollHeight
    })
  }

  const setCollapsed = (collapsed) => {
    if (opts.compact) return
    const panel = box.querySelector('[data-djtk-panel]')
    const fab = box.querySelector('.djtk-fab')
    box.dataset.collapsed = collapsed ? '1' : '0'
    box.classList.toggle('is-collapsed', collapsed)
    if (panel) {
      panel.hidden = !!collapsed
      panel.classList.toggle('is-open', !collapsed)
      // Class wins even if some stylesheet fights [hidden]
      panel.style.display = collapsed ? 'none' : ''
    }
    if (fab) fab.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
    if (collapsed && !cabinOpen) {
      askAbort?.abort()
      askAbort = null
      stopDjtkAudio()
      setThinking(false)
      setSpeaking(false)
      setBusy(false)
      setStatus('')
    } else if (!collapsed) {
      panelInputs()[0]?.focus()
    }
  }

  const abortAsk = () => {
    askAbort?.abort()
    askAbort = null
    askSeq += 1
    stopDjtkAudio()
    setSpeaking(false)
    setBusy(false)
    setStatus('已停止')
  }

  const exitCabin = () => {
    if (!cabinOpen) return
    cabinOpen = false
    cabin.hidden = true
    document.documentElement.classList.remove('djtk-cabin-open')
    const hint = cabin.querySelector('[data-djtk-cabin-speak-hint]')
    if (hint && !asking) hint.textContent = '待命'
  }

  const enterCabin = () => {
    cabinOpen = true
    refreshCabinBatch()
    cabin.hidden = false
    document.documentElement.classList.add('djtk-cabin-open')
    // Keep floating panel usable underneath; cabin is an additional mode.
    if (!opts.compact && box.dataset.collapsed === '1') {
      // leave fab as-is; cabin is independent
    }
    cabinInputs()[0]?.focus()
  }

  const ask = async (question) => {
    const q = String(question || '').trim().slice(0, 200)
    if (!q || asking) return
    pushBubble('user', q)
    history.push({ role: 'user', content: q })
    setStatus('智控助手思考中…')
    setBusy(true)
    setThinking(true)
    setSpeaking(false)
    allStop().forEach((b) => { b.hidden = false })
    allInputs().forEach((inp) => { inp.value = '' })

    const seq = ++askSeq
    askAbort = new AbortController()
    const signal = askAbort.signal
    const batchId = resolveBatchId()

    /** @type {string} */
    let answer
    try {
      const data = await post('/api/djtk/ask', {
        question: q,
        history: history.slice(0, -1).filter((m) => m.role === 'user'),
        batchId: batchId || undefined,
        speak: false,
        ...stageBody(),
      }, { silent: true, signal, headers: stageHeaders() })
      if (seq !== askSeq) return
      answer = String(data?.answer || '').trim() || localFallback(q)
      if (data?.degraded) setStatus('【降级·未连模型】已用平台记录简答')
      else setStatus('')
    } catch (err) {
      if (seq !== askSeq || err?.name === 'AbortError') return
      setStatus('云端暂不可用，请看左侧焦点档案与判定条')
      answer = localFallback(q)
    }

    if (seq !== askSeq) return
    pushBubble('bot', answer)
    history.push({ role: 'assistant', content: answer })
    if (history.length > 12) history.splice(0, history.length - 12)

    const hooks = {
      onStart: () => { if (seq === askSeq) setSpeaking(true) },
      onEnd: () => {
        if (seq !== askSeq) return
        setThinking(false)
        setSpeaking(false)
        setBusy(false)
        allStop().forEach((b) => { b.hidden = true })
      },
    }

    try {
      await speakWithMimoOrBrowser(answer, { ...hooks, signal })
    } catch {
      if (seq === askSeq) await speakBrowser(answer, hooks)
    } finally {
      if (seq === askSeq) {
        setBusy(false)
        setThinking(false)
        setSpeaking(false)
        allStop().forEach((b) => { b.hidden = true })
        askAbort = null
      }
    }
  }

  const onHostClick = (ev, host) => {
    const t = /** @type {HTMLElement} */ (ev.target)
    const openCabin = t.closest?.('[data-djtk-cabin-open]')
    if (openCabin && host.contains(openCabin)) {
      ev.preventDefault()
      enterCabin()
      return
    }
    const exitBtn = t.closest?.('[data-djtk-cabin-exit]')
    if (exitBtn && host.contains(exitBtn)) {
      ev.preventDefault()
      exitCabin()
      return
    }
    const closeBtn = t.closest?.('.djtk-close, [data-djtk-close]')
    if (closeBtn && host.contains(closeBtn)) {
      ev.preventDefault()
      ev.stopPropagation()
      setCollapsed(true)
      return
    }
    const toggle = t.closest?.('[data-djtk-toggle]')
    if (toggle && host.contains(toggle)) {
      ev.preventDefault()
      // FAB opens; close handled above
      const wantCollapse = box.dataset.collapsed !== '1'
      setCollapsed(wantCollapse)
      return
    }
    const chip = t.closest?.('[data-djtk-chip]')
    if (chip && host.contains(chip)) {
      ev.preventDefault()
      if (asking) return
      ask(chip.textContent || '')
      return
    }
    const stop = t.closest?.('[data-djtk-stop]')
    if (stop && host.contains(stop)) {
      ev.preventDefault()
      abortAsk()
    }
  }

  const onFormSubmit = (ev) => {
    ev.preventDefault()
    if (asking) return
    const form = /** @type {HTMLFormElement} */ (ev.currentTarget)
    const inp = /** @type {HTMLInputElement | null} */ (form.querySelector('[data-djtk-input]'))
    const q = String(inp?.value || '').trim()
    if (!q) {
      pushTip('请先输入问题')
      return
    }
    ask(q)
  }

  const onKey = (ev) => {
    if (ev.key === 'Escape' && cabinOpen) {
      ev.preventDefault()
      exitCabin()
    }
  }

  const onCabinLink = (ev) => {
    const a = /** @type {HTMLElement} */ (ev.target).closest?.('a[href^="#/"]')
    if (!a || !cabin.contains(a)) return
    // Allow hash navigation; exit cabin so staff pages are visible.
    exitCabin()
  }

  box.addEventListener('click', (ev) => onHostClick(ev, box))
  cabin.addEventListener('click', (ev) => {
    onHostClick(ev, cabin)
    onCabinLink(ev)
  })
  box.querySelectorAll('[data-djtk-form]').forEach((f) => f.addEventListener('submit', onFormSubmit))
  cabin.querySelectorAll('[data-djtk-form]').forEach((f) => f.addEventListener('submit', onFormSubmit))
  window.addEventListener('keydown', onKey)

  if (!opts.compact) setCollapsed(true)

  const destroy = () => {
    askAbort?.abort()
    askAbort = null
    askSeq += 1
    stopDjtkAudio()
    window.removeEventListener('keydown', onKey)
    exitCabin()
    try {
      if (box.classList.contains('is-body-float') || box.parentElement === document.body) {
        box.remove()
      }
    } catch { /* ignore */ }
    try { cabin.remove() } catch { /* ignore */ }
    document.documentElement.classList.remove('djtk-cabin-open')
    try {
      box.dataset.bound = '0'
    } catch { /* ignore */ }
  }

  activeCtrl = { destroy, exitCabin }
}

/**
 * @param {string} q
 */
function localFallback(q) {
  const s = String(q || '')
  // 降级简答禁止默认合格/未检出/用药结论；引导看平台只读证据。
  if (/海关|演示预警|政务公开/.test(s)) {
    return '【降级·未连模型】【演示·非真实】海关演示预警是展台剧本场景，不是真实海关通报。请打开指挥舱 DJTK 演示话术或海关演示链接核对原文。'
  }
  if (/氟苯|兽药|用药|剂量|处方|能不能用|可以用|合规使用|休药/.test(s)) {
    if (/筛查|结果|检出|残留|阴性|阳性/.test(s) && !/怎么用|如何用|剂量|处方|合规使用|能不能用|可以用/.test(s)) {
      return '【降级·未连模型】本助手不做用药处方。氟苯尼考筛查请打开安全检测页或焦点档案，核对平台筛查定性/结果字段，我不会在本地臆造阴性或合格。'
    }
    return '【降级·未连模型】本助手不做用药处方，也不回答氟苯尼考能否使用。请打开检测或焦点档案查看平台记录。'
  }
  if (/风险|待复核|复核/.test(s)) {
    return '【降级·未连模型】云端暂不可用。请看焦点档案判定条与报告印章是否为待复核；下一步可点安全检测或健康评价，以页面记录为准。'
  }
  if (/哪|来|产地|基地|从/.test(s)) {
    return '【降级·未连模型】云端暂不可用。请看左侧焦点档案里的基地与批次字段，以页面显示为准。'
  }
  if (/安全|合格|残留|上桌|放心|检出/.test(s)) {
    return '【降级·未连模型】云端暂不可用，我不能在本地直接下安全结论。请看左侧焦点档案与判定条、安全检测页的筛查结果。'
  }
  if (/下一步|点哪|怎么|操作|去哪/.test(s)) {
    return '【降级·未连模型】云端暂不可用。可先点传送带上的检测或评价节点，或打开安全检测/健康评价页查看记录。'
  }
  return '【降级·未连模型】云端暂不可用。请先查看左侧焦点档案与判定条；恢复后可再问鸡从哪来、安不安全、下一步、焦点风险或海关演示预警。'
}
