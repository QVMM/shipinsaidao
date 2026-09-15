/**
 * DJTK 数字人：指挥舱浮动面板，问答 + MIMO 语音（失败则浏览器 TTS）。
 */

import { post } from '../api.js'

export const STAGE_TOKEN = 'tihua-djtk-stage'

const STARTERS = [
  '这批鸡从哪来？',
  '安不安全？能上桌吗？',
  '下一步我该点哪里？',
]

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
 * @param {{ onStart?: () => void, onEnd?: () => void, stageToken?: string }} [opts]
 */
export async function speakWithMimoOrBrowser(text, opts = {}) {
  const say = String(text || '').trim()
  if (!say) {
    opts.onEnd?.()
    return false
  }
  try {
    const data = await post('/api/djtk/tts', {
      text: say,
      stageToken: opts.stageToken || STAGE_TOKEN,
    }, { silent: true })
    if (data?.audioBase64) {
      return playBase64Audio(data.audioBase64, data.mime || 'audio/wav', opts)
    }
  } catch {
    /* fall through */
  }
  return speakBrowser(say, opts)
}

function avatarSvg() {
  return `
    <svg class="djtk-face" viewBox="0 0 96 96" aria-hidden="true">
      <defs>
        <radialGradient id="djtkGlow" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stop-color="#7ff5ea"/>
          <stop offset="70%" stop-color="#1a8f88"/>
          <stop offset="100%" stop-color="#0a2a2c"/>
        </radialGradient>
      </defs>
      <circle class="djtk-halo" cx="48" cy="48" r="44" fill="url(#djtkGlow)" opacity="0.55"/>
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
        <span class="djtk-fab-face">${avatarSvg()}</span>
        <span class="djtk-fab-label">DJTK智控助手</span>
        <span class="djtk-fab-hint">问我</span>
      </button>`}
      <div class="djtk-panel" ${compact ? '' : 'hidden'} data-djtk-panel>
        <header class="djtk-hd">
          <div class="djtk-avatar" data-djtk-avatar>${avatarSvg()}</div>
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
 * @param {{ compact?: boolean }} [opts]
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

  const setSpeaking = (on) => {
    box.classList.toggle('is-speaking', on)
    if (stopBtn) stopBtn.hidden = !on
    if (sendBtn) sendBtn.disabled = on
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
    art.className = `djtk-bubble is-${role}`
    art.innerHTML = `<header>${role === 'user' ? '你' : 'DJTK智控助手'}</header><p></p>`
    art.querySelector('p').textContent = text
    log.appendChild(art)
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
      stopDjtkAudio()
      setSpeaking(false)
    } else {
      input?.focus()
    }
  }

  const ask = async (question) => {
    const q = String(question || '').trim()
    if (!q) return
    pushBubble('user', q)
    history.push({ role: 'user', content: q })
    setStatus('智控助手思考中…')
    setSpeaking(true)
    if (input) input.value = ''

    const result = await (async () => {
      try {
        const data = await post('/api/djtk/ask', {
          question: q,
          history: history.slice(0, -1),
          stageToken: STAGE_TOKEN,
        }, { silent: true })
        if (data?.ttsFallback) setStatus('文字已出，语音走浏览器朗读。')
        else setStatus('')
        return {
          answer: String(data?.answer || '').trim() || localFallback(q),
          audioBase64: data?.audioBase64 || null,
          mime: data?.mime || 'audio/wav',
        }
      } catch {
        setStatus('云端助手暂不可用，已用本地简答 + 浏览器朗读。')
        return { answer: localFallback(q), audioBase64: null, mime: 'audio/wav' }
      }
    })()

    pushBubble('bot', result.answer)
    history.push({ role: 'assistant', content: result.answer })
    if (history.length > 12) history.splice(0, history.length - 12)

    const hooks = {
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
    }
    if (result.audioBase64) {
      await playBase64Audio(result.audioBase64, result.mime, hooks)
    } else {
      await speakBrowser(result.answer, hooks)
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
      ask(chip.textContent || '')
      return
    }
    const stop = t.closest?.('[data-djtk-stop]')
    if (stop && box.contains(stop)) {
      ev.preventDefault()
      stopDjtkAudio()
      setSpeaking(false)
    }
  })

  form?.addEventListener('submit', (ev) => {
    ev.preventDefault()
    ask(input?.value || '')
  })

  if (!opts.compact) setCollapsed(true)
}

/**
 * @param {string} q
 */
function localFallback(q) {
  const s = q.toLowerCase()
  if (/哪|来|产地|基地|从/.test(s)) {
    return '这批鸡来自某某基地，批次代号蓟化-2026-0812。点左侧焦点档案可看鸡舍与日粮。'
  }
  if (/安全|合格|残留|上桌|放心|检出/.test(s)) {
    return '当前焦点批次安全筛查未检出目标兽药残留，评价合格，可以进入出证与溯源。'
  }
  if (/下一步|点哪|怎么|操作|去哪/.test(s)) {
    return '下一步请点中间传送带上的检测或评价节点，或展开上方 DJTK 演示话术，按「开始风险排查」走。'
  }
  return '我是 DJTK智控助手。可问鸡从哪来、安不安全、下一步点哪里。云端暂不可用时用这条本地简答。'
}
