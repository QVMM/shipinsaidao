/**
 * DJTK 数字人：指挥舱浮动面板，问答 + MIMO 语音（失败则浏览器 TTS）。
 * Auth: staff session cookie preferred; optional x-stage-token only if injected
 * (window.__DJTK_STAGE_TOKEN__ or sessionStorage djtk_stage_token) — never hardcoded.
 */

import { post } from '../api.js'

const STARTERS = [
  '这批鸡从哪来？',
  '安不安全？能上桌吗？',
  '下一步我该点哪里？',
]

const SS_KEY = 'djtk_stage_token'

let activeAudio = null
/** @type {null | ((ok: boolean) => void)} */
let activeAudioDone = null

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
 * Unique gradient ids for fab vs panel (duplicate SVG on page).
 * @param {'fab' | 'panel'} suffix
 */
function avatarSvg(suffix = 'panel') {
  const id = `djtkGlow-${suffix}`
  return `
    <svg class="djtk-face" viewBox="0 0 96 96" aria-hidden="true">
      <defs>
        <radialGradient id="${id}" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stop-color="#7ff5ea"/>
          <stop offset="70%" stop-color="#1a8f88"/>
          <stop offset="100%" stop-color="#0a2a2c"/>
        </radialGradient>
      </defs>
      <circle class="djtk-halo" cx="48" cy="48" r="44" fill="url(#${id})" opacity="0.55"/>
      <ellipse cx="48" cy="52" rx="28" ry="32" fill="#0d2f34" stroke="#27e0d0" stroke-width="2"/>
      <ellipse cx="48" cy="38" rx="22" ry="18" fill="#123a40" stroke="#3aefe0" stroke-width="1.4"/>
      <circle class="djtk-eye" cx="38" cy="38" r="3.2" fill="#e8fff8"/>
      <circle class="djtk-eye" cx="58" cy="38" r="3.2" fill="#e8fff8"/>
      <path class="djtk-mouth" d="M40 58 Q48 62 56 58" fill="none" stroke="#7ff5ea" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M30 28 Q48 18 66 28" fill="none" stroke="#e4c56a" stroke-width="1.4" opacity="0.7"/>
    </svg>
  `
}

/**
 * @param {{ compact?: boolean }} [opts]
 */
export function renderDjtkHuman(opts = {}) {
  const compact = !!opts.compact
  const starters = STARTERS.map((q) => `<button type="button" class="djtk-chip" data-djtk-chip>${esc(q)}</button>`).join('')
  return `
    <aside class="djtk-human ${compact ? 'is-compact' : 'is-stage'}" data-djtk-human data-collapsed="${compact ? '0' : '1'}">
      ${compact ? '' : `
      <button type="button" class="djtk-fab" data-djtk-toggle aria-expanded="false" title="打开 DJTK 智控助手">
        <span class="djtk-fab-face">${avatarSvg('fab')}</span>
        <span class="djtk-fab-label">DJTK智控助手</span>
        <span class="djtk-fab-hint">问我</span>
      </button>`}
      <div class="djtk-panel" ${compact ? '' : 'hidden'} data-djtk-panel>
        <header class="djtk-hd">
          <div class="djtk-avatar" data-djtk-avatar>${avatarSvg('panel')}</div>
          <div class="djtk-hd-copy">
            <b>DJTK智控助手</b>
            <span>替抗蓟化 · 质控溯源</span>
          </div>
          ${compact ? '' : '<button type="button" class="djtk-close" data-djtk-toggle aria-label="收起">收起</button>'}
        </header>
        <p class="djtk-tip">第一次可以问：鸡从哪来、安不安全、下一步点哪里。</p>
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
 * @param {ParentNode} root
 * @param {{ compact?: boolean, batchId?: string }} [opts]
 */
export function bindDjtkHuman(root, opts = {}) {
  const box = /** @type {HTMLElement | null} */ (root.querySelector('[data-djtk-human]'))
  if (!box || box.dataset.bound === '1') return
  box.dataset.bound = '1'

  /** @type {{ role: string, content: string }[]} */
  const history = []
  const log = box.querySelector('[data-djtk-log]')
  const status = box.querySelector('[data-djtk-status]')
  const input = /** @type {HTMLInputElement | null} */ (box.querySelector('[data-djtk-input]'))
  const form = box.querySelector('[data-djtk-form]')
  const stopBtn = box.querySelector('[data-djtk-stop]')
  const sendBtn = box.querySelector('[data-djtk-send]')
  const chips = () => [...box.querySelectorAll('[data-djtk-chip]')]

  let asking = false
  let askSeq = 0
  /** @type {AbortController | null} */
  let askAbort = null

  const setBusy = (on) => {
    asking = on
    if (sendBtn) sendBtn.disabled = on
    chips().forEach((c) => { c.disabled = on })
    if (input) input.disabled = on
  }

  const setSpeaking = (on) => {
    box.classList.toggle('is-speaking', on)
    if (stopBtn) stopBtn.hidden = !on && !asking
    if (on && stopBtn) stopBtn.hidden = false
  }

  const setStatus = (msg) => {
    if (!status) return
    if (!msg) {
      status.hidden = true
      status.textContent = ''
      return
    }
    status.hidden = false
    status.textContent = msg
  }

  const pushBubble = (role, text) => {
    if (!log) return
    const art = document.createElement('article')
    const degraded = role === 'bot' && String(text || '').startsWith('【降级')
    art.className = `djtk-bubble is-${role}${degraded ? ' is-degraded' : ''}`
    const title = role === 'user' ? '你' : 'DJTK智控助手'
    art.innerHTML = `<header>${title}${degraded ? '<span class="djtk-badge">降级</span>' : ''}</header><p></p>`
    art.querySelector('p').textContent = text
    log.appendChild(art)
    log.scrollTop = log.scrollHeight
  }

  const pushTip = (msg) => {
    if (!log) return
    const tip = document.createElement('p')
    tip.className = 'djtk-log-tip'
    tip.textContent = msg
    log.appendChild(tip)
    log.scrollTop = log.scrollHeight
  }

  const setCollapsed = (collapsed) => {
    if (opts.compact) return
    const panel = box.querySelector('[data-djtk-panel]')
    const fab = box.querySelector('[data-djtk-toggle].djtk-fab, .djtk-fab')
    box.dataset.collapsed = collapsed ? '1' : '0'
    box.classList.toggle('is-collapsed', collapsed)
    if (panel) panel.hidden = collapsed
    if (fab) fab.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
    if (collapsed) {
      askAbort?.abort()
      askAbort = null
      stopDjtkAudio()
      setSpeaking(false)
      setBusy(false)
      setStatus('')
    } else {
      input?.focus()
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

  const ask = async (question) => {
    const q = String(question || '').trim().slice(0, 200)
    if (!q || asking) return
    pushBubble('user', q)
    history.push({ role: 'user', content: q })
    setStatus('智控助手思考中…')
    setBusy(true)
    setSpeaking(true)
    if (stopBtn) stopBtn.hidden = false
    if (input) input.value = ''

    const seq = ++askSeq
    askAbort = new AbortController()
    const signal = askAbort.signal

    let answer = ''
    try {
      const data = await post('/api/djtk/ask', {
        question: q,
        history: history.slice(0, -1).filter((m) => m.role === 'user'),
        batchId: opts.batchId || undefined,
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
        setSpeaking(false)
        setBusy(false)
        if (stopBtn) stopBtn.hidden = true
      },
    }

    try {
      await speakWithMimoOrBrowser(answer, { ...hooks, signal })
    } catch {
      if (seq === askSeq) await speakBrowser(answer, hooks)
    } finally {
      if (seq === askSeq) {
        setBusy(false)
        setSpeaking(false)
        if (stopBtn) stopBtn.hidden = true
        askAbort = null
      }
    }
  }

  box.addEventListener('click', (ev) => {
    const t = /** @type {HTMLElement} */ (ev.target)
    const toggle = t.closest?.('[data-djtk-toggle]')
    if (toggle && box.contains(toggle)) {
      ev.preventDefault()
      setCollapsed(box.dataset.collapsed !== '1')
      return
    }
    const chip = t.closest?.('[data-djtk-chip]')
    if (chip && box.contains(chip)) {
      ev.preventDefault()
      if (asking) return
      ask(chip.textContent || '')
      return
    }
    const stop = t.closest?.('[data-djtk-stop]')
    if (stop && box.contains(stop)) {
      ev.preventDefault()
      abortAsk()
    }
  })

  form?.addEventListener('submit', (ev) => {
    ev.preventDefault()
    if (asking) return
    const q = String(input?.value || '').trim()
    if (!q) {
      pushTip('请先输入问题')
      return
    }
    ask(q)
  })

  if (!opts.compact) setCollapsed(true)
}

/**
 * @param {string} q
 */
function localFallback(q) {
  const s = String(q || '')
  // 降级简答禁止默认合格/未检出/用药结论；引导看平台只读证据。
  if (/氟苯|兽药|用药|剂量|处方|能不能用|可以用|合规使用|休药/.test(s)) {
    return '【降级·未连模型】本助手不做用药处方，也不回答氟苯尼考能否使用。请打开检测或焦点档案查看平台记录。'
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
  return '【降级·未连模型】云端暂不可用。请先查看左侧焦点档案与判定条；恢复后可再问鸡从哪来、安不安全、下一步点哪里。'
}
