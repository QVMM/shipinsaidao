/**
 * DJTK 数字人：指挥舱浮动面板 + 全屏 AI 指挥舱，问答 + MIMO 语音（失败则浏览器 TTS）。
 * Auth: staff session cookie preferred; anonymous booth uses httpOnly djtk_stage
 * cookie from POST /api/djtk/stage-session (no secret in client JS).
 * Optional legacy x-stage-token only if injected (window.__DJTK_STAGE_TOKEN__ or
 * sessionStorage) — never hardcoded.
 *
 * Mic / STT: uses browser SpeechRecognition only (webkitSpeechRecognition).
 * Audio is NOT uploaded to our server or third-party APIs beyond the browser's
 * built-in speech engine.
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
const MOUTH_RMS_THRESHOLD = 0.018

let activeAudio = null
/** @type {null | ((ok: boolean) => void)} */
let activeAudioDone = null
/** @type {AudioContext | null} */
let sharedAudioCtx = null
/** @type {WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>} */
const mediaSources = typeof WeakMap !== 'undefined' ? new WeakMap() : null
/** @type {number | null} */
let mouthRaf = null
/** @type {ReturnType<typeof setInterval> | null} */
let mouthTimer = null

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
 * Empty → rely on cookies (staff or booth djtk_stage).
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

/** Silent booth cookie mint — no secret in response body. */
export async function ensureStageSession() {
  try {
    await post('/api/djtk/stage-session', {}, { silent: true })
    return true
  } catch {
    return false
  }
}

function getAudioCtx() {
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new AC()
  }
  return sharedAudioCtx
}

function clearMouthClasses() {
  document.querySelectorAll('.djtk-human, .djtk-cabin').forEach((el) => {
    el.classList.remove('is-mouth-open')
  })
}

function setMouthOpen(open) {
  document.querySelectorAll('.djtk-human, .djtk-cabin').forEach((el) => {
    el.classList.toggle('is-mouth-open', !!open)
  })
}

function stopMouthAnim() {
  if (mouthRaf != null) {
    cancelAnimationFrame(mouthRaf)
    mouthRaf = null
  }
  if (mouthTimer != null) {
    clearInterval(mouthTimer)
    mouthTimer = null
  }
  clearMouthClasses()
}

/**
 * RAF loop: toggle is-mouth-open from analyser RMS while MIMO wav plays.
 * @param {AnalyserNode} analyser
 * @param {() => boolean} stillActive
 */
function startAnalyserMouth(analyser, stillActive) {
  stopMouthAnim()
  const data = new Uint8Array(analyser.fftSize)
  const tick = () => {
    if (!stillActive()) {
      clearMouthClasses()
      mouthRaf = null
      return
    }
    analyser.getByteTimeDomainData(data)
    let sum = 0
    for (let i = 0; i < data.length; i += 1) {
      const v = (data[i] - 128) / 128
      sum += v * v
    }
    const rms = Math.sqrt(sum / data.length)
    setMouthOpen(rms > MOUTH_RMS_THRESHOLD)
    mouthRaf = requestAnimationFrame(tick)
  }
  mouthRaf = requestAnimationFrame(tick)
}

/** Gentle timed mouth for browser TTS (no analyser). ~0.35s toggle. */
function startTimedMouth(stillActive) {
  stopMouthAnim()
  let open = false
  mouthTimer = setInterval(() => {
    if (!stillActive()) {
      stopMouthAnim()
      return
    }
    open = !open
    setMouthOpen(open)
  }, 350)
}

export function stopDjtkAudio() {
  stopMouthAnim()
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

function speechRecognitionCtor() {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

/**
 * Play base64 wav with optional AnalyserNode mouth sync.
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
    let speaking = false
    const stillActive = () => !settled && activeAudio === audio

    const done = (ok) => {
      if (settled) return
      settled = true
      speaking = false
      stopMouthAnim()
      if (activeAudio === audio) activeAudio = null
      if (activeAudioDone === done) activeAudioDone = null
      hooks.onEnd?.()
      resolve(ok)
    }
    activeAudioDone = done
    audio.onended = () => done(true)
    audio.onerror = () => done(false)

    /** Connect MediaElementSource before play (required once graph is used). */
    const prepareGraph = async () => {
      try {
        const ctx = getAudioCtx()
        if (!ctx) return null
        if (ctx.state === 'suspended') {
          try { await ctx.resume() } catch { /* ignore */ }
        }
        if (!stillActive()) return null
        let source
        if (mediaSources?.has(audio)) {
          source = mediaSources.get(audio)
        } else {
          source = ctx.createMediaElementSource(audio)
          mediaSources?.set(audio, source)
        }
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.55
        source.connect(analyser)
        analyser.connect(ctx.destination)
        return analyser
      } catch {
        return null
      }
    }

    prepareGraph().then((analyser) => {
      if (!stillActive()) return
      hooks.onStart?.()
      speaking = true
      if (analyser) startAnalyserMouth(analyser, () => stillActive() && speaking)
      else startTimedMouth(() => stillActive() && speaking)
      audio.play().catch(() => done(false))
    })
  })
}

/**
 * Browser speechSynthesis one-shot (Chinese) + timed mouth.
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
    stopMouthAnim()
    const u = new SpeechSynthesisUtterance(String(text).trim())
    u.lang = 'zh-CN'
    u.rate = 1.02
    const list = window.speechSynthesis.getVoices?.() || []
    const voice = list.find((v) => /zh(-|_)CN/i.test(v.lang)) || list.find((v) => /^zh/i.test(v.lang))
    if (voice) u.voice = voice
    let active = true
    const finish = (ok) => {
      active = false
      stopMouthAnim()
      hooks.onEnd?.()
      resolve(ok)
    }
    u.onend = () => finish(true)
    u.onerror = () => finish(false)
    hooks.onStart?.()
    startTimedMouth(() => active)
    try {
      window.speechSynthesis.speak(u)
    } catch {
      finish(false)
    }
  })
}

/**
 * Prefer MIMO TTS API, else browser.
 * @param {string} text
 * @param {{ onStart?: () => void, onEnd?: () => void, signal?: AbortSignal, onFallback?: () => void }} [opts]
 * @returns {Promise<{ ok: boolean, via: 'mimo' | 'browser' | 'none' }>}
 */
export async function speakWithMimoOrBrowser(text, opts = {}) {
  const say = String(text || '').trim()
  if (!say) {
    opts.onEnd?.()
    return { ok: false, via: 'none' }
  }
  try {
    const data = await post('/api/djtk/tts', {
      text: say.slice(0, 300),
      ...stageBody(),
    }, { silent: true, signal: opts.signal, headers: stageHeaders() })
    if (data?.audioBase64) {
      const ok = await playBase64Audio(data.audioBase64, data.mime || 'audio/wav', opts)
      return { ok, via: 'mimo' }
    }
  } catch (err) {
    if (err?.name === 'AbortError') {
      opts.onEnd?.()
      return { ok: false, via: 'none' }
    }
  }
  opts.onFallback?.()
  const ok = await speakBrowser(say, opts)
  return { ok, via: ok ? 'browser' : 'none' }
}

/**
 * Photo face: closed base + mouth-masked open overlay.
 * @param {'fab' | 'panel' | 'cabin'} suffix
 */
function avatarHtml(suffix = 'panel') {
  return `
    <span class="djtk-face djtk-face-photo" data-djtk-face data-djtk-face-ctx="${suffix}" aria-hidden="true">
      <img class="djtk-face-img is-closed" src="/djtk-avatar-closed.png" alt="" decoding="async" />
      <img class="djtk-face-img is-open" src="/djtk-avatar-open.png" alt="" decoding="async" />
      <i class="djtk-face-glow" aria-hidden="true"></i>
      <span class="djtk-face-wave" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
    </span>
  `
}

function chipsHtml() {
  return STARTERS.map((q) => `<button type="button" class="djtk-chip" data-djtk-chip>${esc(q)}</button>`).join('')
}

function formActionsHtml() {
  return `
    <input type="text" name="q" data-djtk-input maxlength="200" placeholder="输入问题，例如：这批鸡从哪来？" autocomplete="off" />
    <button type="button" class="djtk-mic" data-djtk-mic title="语音输入" aria-label="语音输入" aria-pressed="false">🎤</button>
    <button type="submit" class="djtk-send" data-djtk-send>发送</button>
    <button type="button" class="djtk-stop" data-djtk-stop hidden>停止</button>
  `
}

function cabinFormActionsHtml() {
  return `
    <input type="text" name="q" data-djtk-input maxlength="200" placeholder="输入问题，例如：当前焦点批次风险？" autocomplete="off" />
    <button type="button" class="djtk-mic" data-djtk-mic title="语音输入" aria-label="语音输入" aria-pressed="false">🎤</button>
    <button type="submit" class="djtk-send" data-djtk-send>发送</button>
    <button type="button" class="djtk-stop" data-djtk-stop hidden>停止</button>
  `
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
            ${cabinFormActionsHtml()}
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
          ${formActionsHtml()}
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
  const allMics = () => [...box.querySelectorAll('[data-djtk-mic]'), ...cabin.querySelectorAll('[data-djtk-mic]')]

  let asking = false
  let askSeq = 0
  /** @type {AbortController | null} */
  let askAbort = null
  let cabinOpen = false
  /** @type {SpeechRecognition | null} */
  let recognition = null
  let listening = false
  let mimoStatusTimer = 0

  // Resume AudioContext on first user gesture (autoplay policies).
  const unlockAudio = () => {
    try {
      const ctx = getAudioCtx()
      if (ctx?.state === 'suspended') ctx.resume()
    } catch { /* ignore */ }
  }
  box.addEventListener('pointerdown', unlockAudio, { once: true })
  cabin.addEventListener('pointerdown', unlockAudio, { once: true })

  // Anonymous booth: mint httpOnly djtk_stage cookie (silent).
  ensureStageSession()

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

  const setMicUi = (on) => {
    listening = on
    allMics().forEach((btn) => {
      btn.classList.toggle('is-listening', on)
      btn.setAttribute('aria-pressed', on ? 'true' : 'false')
      btn.title = on ? '停止语音输入' : (btn.dataset.micOk === '0' ? '当前浏览器不支持语音输入' : '语音输入')
    })
  }

  const stopMic = () => {
    try { recognition?.stop() } catch { /* ignore */ }
    try { recognition?.abort() } catch { /* ignore */ }
    setMicUi(false)
  }

  const setBusy = (on) => {
    asking = on
    allSend().forEach((b) => { b.disabled = on })
    allChips().forEach((c) => { c.disabled = on })
    allInputs().forEach((inp) => { inp.disabled = on })
    allMics().forEach((b) => {
      if (b.dataset.micOk === '0') return
      b.disabled = on
    })
    if (on) stopMic()
  }

  const setThinking = (on) => {
    box.classList.toggle('is-thinking', on)
    cabin.classList.toggle('is-thinking', on)
  }

  const setSpeaking = (on) => {
    box.classList.toggle('is-speaking', on)
    cabin.classList.toggle('is-speaking', on)
    if (on) setThinking(false)
    else clearMouthClasses()
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

  const flashStatus = (msg, ms = 2200) => {
    setStatus(msg)
    if (mimoStatusTimer) clearTimeout(mimoStatusTimer)
    mimoStatusTimer = window.setTimeout(() => {
      setStatus('')
      mimoStatusTimer = 0
    }, ms)
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
      panel.style.display = collapsed ? 'none' : ''
    }
    if (fab) fab.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
    if (collapsed && !cabinOpen) {
      askAbort?.abort()
      askAbort = null
      stopMic()
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
    stopMic()
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
    cabinInputs()[0]?.focus()
  }

  const ask = async (question) => {
    const q = String(question || '').trim().slice(0, 200)
    if (!q || asking) return
    stopMic()
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

    // Refresh booth cookie before ask (covers expiry / first open).
    await ensureStageSession()

    /** @type {string} */
    let answer
    /** @type {boolean} */
    let authFail = false
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
      if (data?.degraded) {
        setStatus('【降级·未连模型】已用平台记录简答')
      } else {
        flashStatus('MIMO 已回答', 1800)
      }
    } catch (err) {
      if (seq !== askSeq || err?.name === 'AbortError') return
      if (err?.status === 401) {
        authFail = true
        setStatus('请重新登录工作人员账号')
        answer = '请先登录工作人员账号后再提问。展台大屏若仍无会话，请刷新页面重试。'
      } else {
        setStatus('云端暂不可用，请看左侧焦点档案与判定条')
        answer = localFallback(q)
      }
    }

    if (seq !== askSeq) return
    pushBubble('bot', answer)
    history.push({ role: 'assistant', content: answer })
    if (history.length > 12) history.splice(0, history.length - 12)

    if (authFail) {
      setBusy(false)
      setThinking(false)
      setSpeaking(false)
      allStop().forEach((b) => { b.hidden = true })
      askAbort = null
      return
    }

    let browserFallbackNoted = false
    const hooks = {
      onStart: () => { if (seq === askSeq) setSpeaking(true) },
      onEnd: () => {
        if (seq !== askSeq) return
        setThinking(false)
        setSpeaking(false)
        setBusy(false)
        allStop().forEach((b) => { b.hidden = true })
      },
      onFallback: () => {
        if (seq === askSeq && !browserFallbackNoted) {
          browserFallbackNoted = true
          setStatus('已用浏览器朗读（MIMO 语音暂不可用）')
        }
      },
    }

    try {
      await speakWithMimoOrBrowser(answer, { ...hooks, signal })
    } catch {
      if (seq === askSeq) {
        hooks.onFallback?.()
        await speakBrowser(answer, hooks)
      }
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

  const startMic = () => {
    const Ctor = speechRecognitionCtor()
    if (!Ctor) return
    stopMic()
    unlockAudio()
    const rec = new Ctor()
    recognition = rec
    rec.lang = 'zh-CN'
    rec.interimResults = true
    rec.continuous = false
    rec.onstart = () => setMicUi(true)
    rec.onend = () => setMicUi(false)
    rec.onerror = () => setMicUi(false)
    rec.onresult = (ev) => {
      let finalText = ''
      let interim = ''
      for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
        const r = ev.results[i]
        const t = String(r?.[0]?.transcript || '').trim()
        if (!t) continue
        if (r.isFinal) finalText += t
        else interim += t
      }
      const fill = finalText || interim
      if (fill) {
        allInputs().forEach((inp) => { inp.value = fill })
      }
      if (finalText) {
        stopMic()
        if (!asking) ask(finalText)
      }
    }
    try {
      rec.start()
      setMicUi(true)
    } catch {
      setMicUi(false)
    }
  }

  const toggleMic = () => {
    if (asking) return
    if (listening) {
      stopMic()
      return
    }
    startMic()
  }

  // Mic support probe
  {
    const ok = !!speechRecognitionCtor()
    allMics().forEach((btn) => {
      if (!ok) {
        btn.disabled = true
        btn.dataset.micOk = '0'
        btn.title = '当前浏览器不支持语音输入'
      } else {
        btn.dataset.micOk = '1'
      }
    })
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
    const micBtn = t.closest?.('[data-djtk-mic]')
    if (micBtn && host.contains(micBtn)) {
      ev.preventDefault()
      if (micBtn.dataset.micOk === '0') return
      toggleMic()
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
    stopMic()
    recognition = null
    if (mimoStatusTimer) clearTimeout(mimoStatusTimer)
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
