/**
 * DJTK 数字人：指挥舱浮动面板 + 全屏研判舱，本地证据问答 + 设备系统语音。
 * Auth: staff session cookie preferred; anonymous booth uses httpOnly djtk_stage
 * cookie from POST /api/djtk/stage-session (no secret in client JS).
 * Optional legacy x-stage-token only if injected (window.__DJTK_STAGE_TOKEN__ or
 * sessionStorage) — never hardcoded.
 *
 * Online: MiMo ASR/TTS when configured, with browser speech fallback.
 * Windows competition package: the same UI targets bundled local ASR/TTS.
 */

import { post } from '../api.js'
import { chosenBatchId, getState } from '../store.js'
import { offlineMicSupported, startOfflineRecorder } from './offline-audio.js'

/**
 * All assistant surfaces share four non-overlapping, high-frequency actions.
 * Longer competition scripts remain available through voice/text input without
 * permanently crowding the interface.
 */
const QUICK_ACTIONS = [
  { label: '研判当前批次', ask: '请汇总当前焦点批次的风险、判定依据与下一步。', primary: true },
  { label: '上市判定依据', ask: '请说明当前焦点批次能否上市，以及判定依据。' },
  { label: '氟苯尼考结果', ask: '请说明当前焦点批次的氟苯尼考筛查结果及对应证据。' },
  { label: '待复核与下一步', ask: '请列出当前焦点批次的待复核项，并说明下一步应处理什么。' },
]

const SS_KEY = 'djtk_stage_token'
const MOUTH_RMS_OPEN_THRESHOLD = 0.021
const MOUTH_RMS_CLOSE_THRESHOLD = 0.012
const CLOSING_SPEECH = '屏幕之外可能是素未谋面的陌生人，也可能是我们的家人；感谢替抗蓟化团队，以技能筑牢安全防线，护航中国高品质鸡肉走向世界餐桌。'
const CLOSING_SPEECH_START = '屏幕之外可能是素未谋面的陌生人'
const CLOSING_SPEECH_END = '护航中国高品质鸡肉走向世界餐桌'

let activeAudio = null
/** @type {null | ((ok: boolean) => void)} */
let activeAudioDone = null
/** @type {AudioContext | null} */
let sharedAudioCtx = null
/** @type {WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>} */
const mediaSources = typeof WeakMap !== 'undefined' ? new WeakMap() : null
/** @type {number | null} */
let mouthRaf = null
/** @type {ReturnType<typeof setTimeout> | null} */
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

/** Booth cookie already minted this page lifetime — skip repeat network. */
let stageSessionOk = false

/** Silent booth cookie mint — no secret in response body. @param {boolean} [force] */
export async function ensureStageSession(force = false) {
  if (stageSessionOk && !force) return true
  try {
    await post('/api/djtk/stage-session', {}, { silent: true })
    stageSessionOk = true
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
    clearTimeout(mouthTimer)
    mouthTimer = null
  }
  clearMouthClasses()
}

/**
 * RAF loop: toggle is-mouth-open from analyser RMS while audio plays.
 * @param {AnalyserNode} analyser
 * @param {() => boolean} stillActive
 */
function startAnalyserMouth(analyser, stillActive) {
  stopMouthAnim()
  const data = new Uint8Array(analyser.fftSize)
  let smoothedRms = 0
  let open = false
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
    smoothedRms = smoothedRms * 0.72 + rms * 0.28
    if (!open && smoothedRms > MOUTH_RMS_OPEN_THRESHOLD) open = true
    if (open && smoothedRms < MOUTH_RMS_CLOSE_THRESHOLD) open = false
    setMouthOpen(open)
    mouthRaf = requestAnimationFrame(tick)
  }
  mouthRaf = requestAnimationFrame(tick)
}

/** Gentle syllabic mouth rhythm for browser TTS (no analyser). */
function startTimedMouth(stillActive) {
  stopMouthAnim()
  const phases = [
    { open: true, duration: 120 },
    { open: false, duration: 72 },
    { open: true, duration: 156 },
    { open: false, duration: 104 },
    { open: true, duration: 92 },
    { open: false, duration: 208 },
  ]
  let phase = 0
  const tick = () => {
    if (!stillActive()) {
      stopMouthAnim()
      return
    }
    const current = phases[phase]
    setMouthOpen(current.open)
    phase = (phase + 1) % phases.length
    mouthTimer = setTimeout(tick, current.duration)
  }
  tick()
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

const FEMALE_CHINESE_VOICE = /(?:female|woman|girl|xiaoxiao|xiaoyi|xiaohan|xiaomeng|xiaomo|xiaoqiu|xiaorui|xiaoshuang|xiaoxuan|xiaoyan|xiaoyou|xiaozhen|yunxia|huihui|yaoyao|hanhan|ting[- ]?ting|mei[- ]?jia|sin[- ]?ji|晓晓|晓伊|晓涵|晓梦|晓墨|晓秋|晓睿|晓双|晓萱|晓颜|晓悠|晓甄|云霞|慧慧|瑶瑶|涵涵|婷婷|美佳|善怡|女声)/i
const GOOGLE_CHINESE_VOICE = /google.*(?:普通话|中文|mandarin|chinese)/i

/** Never silently fall back to a Chinese male system voice. */
export function selectFemaleChineseVoice(voices = []) {
  const chinese = Array.from(voices).filter((voice) => /^zh(?:[-_]|$)/i.test(String(voice?.lang || '')))
  return chinese.find((voice) => FEMALE_CHINESE_VOICE.test(String(voice?.name || '')))
    || chinese.find((voice) => GOOGLE_CHINESE_VOICE.test(String(voice?.name || '')))
    || null
}

function speechRecognitionCtor() {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

export function chooseMicInputMode({ recognitionAvailable, recorderAvailable, serverAsrReady }) {
  if (recorderAvailable && serverAsrReady !== false) return 'recorder'
  if (recognitionAvailable) return 'browser'
  if (recorderAvailable) return 'recorder'
  return 'none'
}

async function transcribeRecordedPcm(pcm, sampleRate, signal) {
  const response = await fetch('/api/djtk/transcribe', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/octet-stream',
      'x-sample-rate': String(sampleRate || 16000),
      ...stageHeaders(),
    },
    body: pcm,
    signal,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload?.message || '语音识别未完成，请再试一次。')
    error.status = response.status
    throw error
  }
  return payload
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
      const beginSpeaking = () => {
        if (speaking || !stillActive()) return
        speaking = true
        hooks.onStart?.()
        if (analyser) startAnalyserMouth(analyser, () => stillActive() && speaking)
        else startTimedMouth(() => stillActive() && speaking)
      }
      audio.onplaying = beginSpeaking
      audio.play().then(beginSpeaking).catch(() => done(false))
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
    u.rate = 1.18
    u.pitch = 1.04
    const list = window.speechSynthesis.getVoices?.() || []
    const voice = selectFemaleChineseVoice(list)
    if (!voice) {
      hooks.onEnd?.()
      resolve(false)
      return
    }
    u.voice = voice
    let active = true
    let startTimer = 0
    const finish = (ok) => {
      active = false
      if (startTimer) clearTimeout(startTimer)
      stopMouthAnim()
      hooks.onEnd?.()
      resolve(ok)
    }
    let started = false
    const beginSpeaking = () => {
      if (started || !active) return
      started = true
      if (startTimer) clearTimeout(startTimer)
      hooks.onStart?.()
      startTimedMouth(() => active)
    }
    u.onstart = beginSpeaking
    u.onend = () => finish(true)
    u.onerror = () => finish(false)
    try {
      window.speechSynthesis.speak(u)
      startTimer = window.setTimeout(beginSpeaking, 180)
    } catch {
      finish(false)
    }
  })
}

/**
 * Cut long answers for TTS latency: first ~120 Chinese chars, prefer sentence end 。！？
 * Full text still shown in the bubble.
 * @param {string} text
 * @param {number} [maxChars]
 */
export function speakPreview(text, maxChars = 120) {
  const raw = String(text || '').trim()
  const assistantMarked = raw.match(/DJTK\s*智能助手\s*[:：]\s*([\s\S]*)/i)
  const s = (assistantMarked ? assistantMarked[1] : raw)
    .replace(/(?:^|\n)\s*4\s*号\s*[:：][^\n]*(?:\n|$)/g, '\n')
    .trim()
  const closingStart = s.indexOf(CLOSING_SPEECH_START)
  const closingEnd = closingStart >= 0 ? s.indexOf(CLOSING_SPEECH_END, closingStart) : -1
  if (closingStart >= 0 && closingEnd >= closingStart) return CLOSING_SPEECH
  if (s.length <= maxChars) return s
  const head = s.slice(0, maxChars)
  const m = head.match(/^[\s\S]*[。！？]/)
  return (m && m[0].trim()) ? m[0].trim() : head
}

/**
 * Prefer MiMo female TTS online, then fall back to a Chinese female device
 * voice. The Windows package replaces the endpoint with its local voice engine.
 * @param {string} text
 * @param {{ onStart?: () => void, onEnd?: () => void, signal?: AbortSignal, onFallback?: () => void }} [opts]
 * @returns {Promise<{ ok: boolean, via: 'mimo' | 'browser' | 'none' }>}
 */
export async function speakWithPreferredVoice(text, opts = {}) {
  const full = String(text || '').trim()
  const say = speakPreview(full, 120)
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
  } catch (error) {
    if (error?.name === 'AbortError') {
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
      <img class="djtk-face-img is-open" src="/djtk-avatar-speak-v2.png" alt="" decoding="async" />
      <i class="djtk-face-glow" aria-hidden="true"></i>
      <span class="djtk-face-wave" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
    </span>
  `
}

function quickChipsHtml() {
  return QUICK_ACTIONS.map((item) => {
    const primaryQuery = item.primary ? ' data-primary-query' : ''
    const primaryClass = item.primary ? ' is-primary' : ''
    return `<button type="button" class="djtk-chip${primaryClass}" data-djtk-chip${primaryQuery} data-djtk-ask="${esc(item.ask)}">${esc(item.label)}</button>`
  }).join('')
}

function formActionsHtml() {
  return `
    <input type="text" name="q" data-djtk-input maxlength="200" placeholder="输入问题，例如：这批鸡从哪来？" autocomplete="off" />
    <button type="button" class="djtk-mic" data-djtk-mic title="语音输入" aria-label="语音输入" aria-pressed="false">语音</button>
    <button type="submit" class="djtk-send" data-djtk-send>发送</button>
    <button type="button" class="djtk-stop" data-djtk-stop hidden>停止</button>
  `
}

function cabinFormActionsHtml() {
  return `
    <input type="text" name="q" data-djtk-input maxlength="200" placeholder="输入问题，例如：当前焦点批次风险？" autocomplete="off" />
    <button type="button" class="djtk-mic" data-djtk-mic title="语音输入" aria-label="语音输入" aria-pressed="false">语音</button>
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
          <b>DJTK · 食品安全研判舱</b>
          <span>从养殖记录到检测结论，全程有据可查</span>
        </div>
        <p class="djtk-cabin-first"><span>批次来源</span><span>安全检测</span><span>健康评价</span>回答基于当前批次记录，不做用药处方。</p>
        <div class="djtk-cabin-top-actions">
          <button type="button" class="djtk-clear" data-djtk-clear>新建会话</button>
          <button type="button" class="djtk-cabin-exit" data-djtk-cabin-exit title="退出全屏指挥舱（Esc）">退出</button>
        </div>
      </header>
      <div class="djtk-cabin-main">
        <section class="djtk-cabin-hero">
          <div class="djtk-cabin-avatar" data-djtk-avatar>${avatarHtml('cabin')}</div>
          <p class="djtk-cabin-hero-name">DJTK 智控助手</p>
          <p class="djtk-cabin-hero-sub" data-djtk-cabin-speak-hint>当前批次已载入</p>
        </section>
        <section class="djtk-cabin-chat">
          <div class="djtk-cabin-chip-block">
            <p class="djtk-cabin-sec-label">常用研判</p>
            <div class="djtk-chips djtk-cabin-chips">${quickChipsHtml()}</div>
          </div>
          <div class="djtk-cabin-log-wrap">
            <div class="djtk-log" data-djtk-log aria-live="polite">
              <p class="djtk-cabin-empty" data-djtk-empty><strong>开始批次研判</strong><span>选择上方问题，或直接询问来源、安全状态与上市依据。</span><small>回答只引用平台内可核验记录</small></p>
            </div>
            <form class="djtk-form djtk-cabin-form" data-djtk-form>
              ${cabinFormActionsHtml()}
            </form>
            <p class="djtk-status" data-djtk-status hidden></p>
          </div>
        </section>
        <aside class="djtk-cabin-side">
          <article class="djtk-cabin-card">
            <h3>焦点批次摘要</h3>
            <p class="djtk-cabin-batch" data-djtk-cabin-batch>—</p>
            <p class="djtk-cabin-card-hint">以页面焦点档案与检测记录为准，<br>助手不臆造合格结论。</p>
          </article>
          <article class="djtk-cabin-card">
            <h3>风险 / 下一步</h3>
            <nav class="djtk-cabin-links">
              <a href="#/screen" class="djtk-cabin-link-card"><span class="djtk-cabin-link-title">安全检测</span><span class="djtk-cabin-link-go">打开 →</span></a>
              <a href="#/eval" class="djtk-cabin-link-card"><span class="djtk-cabin-link-title">健康评价</span><span class="djtk-cabin-link-go">打开 →</span></a>
              <a href="#/dashboard" class="djtk-cabin-link-card"><span class="djtk-cabin-link-title">总览看板</span><span class="djtk-cabin-link-go">打开 →</span></a>
              <a href="#/stage" class="djtk-cabin-link-card"><span class="djtk-cabin-link-title">指挥舱大屏</span><span class="djtk-cabin-link-go">打开 →</span></a>
            </nav>
          </article>
        </aside>
      </div>
    </div>
  `
}

/**
 * @param {{ compact?: boolean, embedded?: boolean }} [opts]
 */
export function renderDjtkHuman(opts = {}) {
  const compact = !!opts.compact
  const embedded = !!opts.embedded
  const starters = quickChipsHtml()
  return `
    <aside class="djtk-human ${compact ? 'is-compact' : 'is-stage'}${embedded ? ' is-embedded' : ''}" data-djtk-human data-collapsed="${compact || embedded ? '0' : '1'}">
      ${compact || embedded ? '' : `
      <button type="button" class="djtk-fab" data-djtk-toggle aria-expanded="false" title="打开 DJTK 智控助手" aria-label="打开 DJTK 智控助手">
        <span class="djtk-fab-face">${avatarHtml('fab')}</span>
      </button>`}
      <div class="djtk-panel${compact || embedded ? ' is-open' : ''}" ${compact || embedded ? '' : 'hidden'} data-djtk-panel>
        <header class="djtk-hd">
          <div class="djtk-avatar" data-djtk-avatar>${avatarHtml('panel')}</div>
          <div class="djtk-hd-copy">
            <b>DJTK智控助手</b>
            <span>${embedded ? '您的食品安全 AI 搭档' : '替抗蓟化 · 质控溯源'}</span>
            ${embedded ? '<em class="djtk-stage-state" data-djtk-stage-state>待命 · 当前批次已载入</em>' : ''}
          </div>
          <div class="djtk-hd-actions">
            <button type="button" class="djtk-clear" data-djtk-clear>新建会话</button>
            <button type="button" class="djtk-cabin-open" data-djtk-cabin-open title="进入全屏 AI 研判舱">全屏研判</button>
            ${compact || embedded ? '' : '<button type="button" class="djtk-close" data-djtk-close data-djtk-toggle aria-label="收起">收起</button>'}
          </div>
        </header>
        ${embedded ? '' : `<p class="djtk-tip">${compact
    ? '围绕当前批次提问：来源、安全、健康、风险与下一步。回答仅引用本地平台记录，可进入全屏研判。'
    : '从来源、安全、健康、风险和下一步开始提问；回答只引用平台证据，不做用药处方。'}</p>`}
        ${embedded ? `
          <div class="djtk-proof-list" aria-label="本次结论的主要依据">
            <a href="#/screen" aria-label="氟苯尼考检测报告，检测记录未检出" title="检测记录 · 未检出"><b>氟苯尼考报告</b></a>
            <a href="#/farm" aria-label="养殖过程记录，基地-A07全周期" title="基地-A07 · 全周期"><b>养殖记录</b></a>
            <a href="#/report" aria-label="产品合规证明，权威报告可核验" title="权威报告 · 可核验"><b>合规证明</b></a>
          </div>
        ` : ''}
        <div class="djtk-chips">${starters}</div>
        <div class="djtk-log" data-djtk-log aria-live="polite">
          ${embedded
    ? '<p class="djtk-embedded-empty" data-djtk-empty>可以直接问我：这批鸡从哪来、安不安全、能不能上市。</p>'
    : compact
      ? '<p class="djtk-compact-empty" data-djtk-empty><strong>等待研判问题</strong><span>选择左侧快捷问题，或在下方输入。</span></p>'
      : ''}
        </div>
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
 * @param {{ compact?: boolean, embedded?: boolean, batchId?: string }} [opts]
 */
export function bindDjtkHuman(root, opts = {}) {
  unbindDjtkHuman()

  const box = /** @type {HTMLElement | null} */ (root.querySelector('[data-djtk-human]'))
  if (!box) return
  box.dataset.bound = '1'

  // Stage float lives on body (like cabin) so wall-board CSS scale cannot skew hit-testing.
  const floatOnBody = !opts.compact && !opts.embedded
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
  let micSession = null
  let micFinishing = false
  let serverAsrReady = null
  let listening = false

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
  fetch('/api/djtk/status', { credentials: 'same-origin' })
    .then((response) => response.ok ? response.json() : null)
    .then((status) => { serverAsrReady = typeof status?.asrReady === 'boolean' ? status.asrReady : null })
    .catch(() => { serverAsrReady = null })

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
    box.classList.toggle('is-listening', on)
    cabin.classList.toggle('is-listening', on)
    allMics().forEach((btn) => {
      btn.classList.toggle('is-listening', on)
      btn.setAttribute('aria-pressed', on ? 'true' : 'false')
      btn.title = on ? '停止语音输入' : (btn.dataset.micOk === '0' ? '当前浏览器不支持语音输入' : '语音输入')
    })
    if (on) setEmbeddedState('聆听中 · 请说出问题')
    else if (!asking) setEmbeddedState('待命 · 当前批次已载入')
  }

  const setEmbeddedState = (text) => {
    box.querySelectorAll('[data-djtk-stage-state]').forEach((el) => { el.textContent = text })
  }

  const stopMic = () => {
    try { recognition?.stop() } catch { /* ignore */ }
    try { recognition?.abort() } catch { /* ignore */ }
    recognition = null
    const current = micSession
    micSession = null
    try { current?.cancel?.() } catch { /* ignore */ }
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
    const hint = cabin.querySelector('[data-djtk-cabin-speak-hint]')
    if (hint && !cabin.classList.contains('is-speaking')) {
      hint.textContent = on ? '等待中…' : (asking ? '等待中…' : '待命')
    }
    if (on) setEmbeddedState('等待中…')
    else if (!asking && !listening) setEmbeddedState('待命 · 当前批次已载入')
  }

  const setSpeaking = (on) => {
    box.classList.toggle('is-speaking', on)
    cabin.classList.toggle('is-speaking', on)
    if (on) setThinking(false)
    else clearMouthClasses()
    const hint = cabin.querySelector('[data-djtk-cabin-speak-hint]')
    if (hint) hint.textContent = on ? '回答中…' : (asking ? '等待中…' : '待命')
    setEmbeddedState(on ? '正在回答' : (asking ? '等待中…' : '待命 · 当前批次已载入'))
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

  const clearEmptyState = (log) => {
    log.querySelectorAll('[data-djtk-empty]').forEach((el) => el.remove())
  }

  const pushBubble = (role, text) => {
    allLogs().forEach((log) => {
      clearEmptyState(log)
      const art = document.createElement('article')
      const degraded = role === 'bot' && String(text || '').startsWith('【降级')
      art.className = `djtk-bubble is-${role}${degraded ? ' is-degraded' : ''}`
      const title = role === 'user' ? '你' : 'DJTK智控助手'
      const badges = []
      if (degraded) badges.push('<span class="djtk-badge">降级</span>')
      art.innerHTML = `<header>${title}${badges.join('')}</header><p></p>`
      art.querySelector('p').textContent = text
      log.appendChild(art)
      log.scrollTop = log.scrollHeight
    })
  }

  const pushTip = (msg) => {
    allLogs().forEach((log) => {
      clearEmptyState(log)
      const tip = document.createElement('p')
      tip.className = 'djtk-log-tip'
      tip.textContent = msg
      log.appendChild(tip)
      log.scrollTop = log.scrollHeight
    })
  }

  const setProgress = (msg) => {
    allLogs().forEach((log) => {
      clearEmptyState(log)
      let art = log.querySelector('[data-djtk-progress]')
      if (!art) {
        art = document.createElement('article')
        art.className = 'djtk-bubble is-bot is-progress'
        art.setAttribute('data-djtk-progress', '')
        art.setAttribute('role', 'status')
        art.innerHTML = '<header>DJTK智控助手<span class="djtk-thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span></header><p></p>'
        log.appendChild(art)
      }
      art.querySelector('p').textContent = msg
      log.scrollTop = log.scrollHeight
    })
  }

  const clearProgress = () => {
    allLogs().forEach((log) => {
      log.querySelectorAll('[data-djtk-progress]').forEach((el) => el.remove())
    })
  }

  const setCollapsed = (collapsed) => {
    if (opts.compact || opts.embedded) return
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
      clearProgress()
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
    clearProgress()
    setBusy(false)
    setThinking(false)
    setSpeaking(false)
    setStatus('已停止')
  }

  const resetConversation = () => {
    abortAsk()
    history.length = 0
    allInputs().forEach((input) => { input.value = '' })
    panelLogs().forEach((log) => {
      log.innerHTML = opts.embedded
        ? '<p class="djtk-embedded-empty" data-djtk-empty>可以直接问我：这批鸡从哪来、安不安全、能不能上市。<span>答案只引用当前批次证据。</span></p>'
        : opts.compact
          ? '<p class="djtk-compact-empty" data-djtk-empty><strong>等待研判问题</strong><span>选择左侧快捷问题，或在下方输入。</span></p>'
          : ''
    })
    cabinLogs().forEach((log) => {
      log.innerHTML = '<p class="djtk-cabin-empty" data-djtk-empty><strong>开始批次研判</strong><span>选择上方问题，或直接询问来源、安全状态与上市依据。</span><small>回答只引用平台内可核验记录</small></p>'
    })
    setStatus('')
    setEmbeddedState('待命 · 当前批次已载入')
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
    setStatus('等待中…')
    setProgress('等待中…')
    setBusy(true)
    setThinking(true)
    setSpeaking(false)
    allStop().forEach((b) => { b.hidden = false })
    allInputs().forEach((inp) => { inp.value = '' })

    const seq = ++askSeq
    askAbort = new AbortController()
    const signal = askAbort.signal
    const batchId = resolveBatchId()

    // Booth cookie: skip network once stageSessionOk (mount already called once).
    if (!stageSessionOk) await ensureStageSession()

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
      setStatus('等待中…')
      setProgress('等待中…')
    } catch (err) {
      if (seq !== askSeq || err?.name === 'AbortError') return
      if (err?.status === 401) {
        authFail = true
        setStatus('请重新登录工作人员账号')
        answer = '请先登录工作人员账号后再提问。展台大屏若仍无会话，请刷新页面重试。'
      } else {
        setStatus('当前请求未完成，请看左侧焦点档案与判定条')
        answer = localFallback(q)
      }
    }

    if (seq !== askSeq) return
    let answerShown = false
    const revealAnswer = () => {
      if (answerShown || seq !== askSeq) return
      answerShown = true
      clearProgress()
      pushBubble('bot', answer)
      history.push({ role: 'assistant', content: answer })
      if (history.length > 12) history.splice(0, history.length - 12)
    }

    if (authFail) {
      revealAnswer()
      setThinking(false)
      setBusy(false)
      setSpeaking(false)
      allStop().forEach((b) => { b.hidden = true })
      askAbort = null
      return
    }

    setStatus('等待中…')
    setProgress('等待中…')

    const hooks = {
      onStart: () => {
        if (seq !== askSeq) return
        revealAnswer()
        setStatus('正在回答…')
        setSpeaking(true)
      },
      onEnd: () => {
        if (seq !== askSeq) return
        setThinking(false)
        setSpeaking(false)
        setBusy(false)
        allStop().forEach((b) => { b.hidden = true })
      },
      onFallback: () => {
        if (seq !== askSeq) return
        setStatus('等待中…')
        setProgress('等待中…')
      },
    }

    try {
      const spoken = await speakWithPreferredVoice(answer, { ...hooks, signal })
      if (!spoken.ok && seq === askSeq) {
        revealAnswer()
        setStatus('当前设备语音不可用，已显示文字回答')
      }
    } catch {
      if (seq === askSeq) {
        revealAnswer()
        setStatus('当前设备语音不可用，已显示文字回答')
      }
    } finally {
      if (seq === askSeq) {
        revealAnswer()
        setBusy(false)
        setThinking(false)
        setSpeaking(false)
        allStop().forEach((b) => { b.hidden = true })
        askAbort = null
      }
    }
  }

  const startBrowserMic = () => {
    const Ctor = speechRecognitionCtor()
    if (!Ctor) return
    stopMic()
    unlockAudio()
    const rec = new Ctor()
    recognition = rec
    rec.lang = 'zh-CN'
    // Newer Chromium builds can keep recognition on-device when the language
    // pack is installed; older engines safely ignore this property.
    rec.processLocally = true
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

  const finishRecordedMic = async () => {
    if (!micSession || micFinishing) return
    micFinishing = true
    const current = micSession
    micSession = null
    setMicUi(false)
    setStatus('识别中…')
    try {
      const recording = await current.stop()
      if (!recording.heardSpeech || recording.durationMs < 250) {
        setStatus('没有听清，请靠近麦克风再说一遍')
        return
      }
      const data = await transcribeRecordedPcm(recording.pcm, current.sampleRate)
      const finalText = String(data?.text || '').trim()
      if (!finalText) {
        setStatus('没有听清，请重新说一遍')
        return
      }
      allInputs().forEach((input) => { input.value = finalText })
      setStatus('识别完成')
      if (!asking) await ask(finalText)
    } catch (error) {
      setStatus(error?.message || '语音识别未完成，请再试一次')
    } finally {
      micFinishing = false
    }
  }

  const startRecordedMic = async () => {
    stopMic()
    unlockAudio()
    stopDjtkAudio()
    setStatus('正在启用麦克风…')
    try {
      micSession = await startOfflineRecorder({ onAutoStop: () => finishRecordedMic() })
      setMicUi(true)
      setStatus('聆听中，说完后会自动识别')
    } catch (error) {
      setMicUi(false)
      setStatus(error?.message || '麦克风不可用，请检查系统权限')
    }
  }

  const startMic = () => {
    const mode = chooseMicInputMode({
      recognitionAvailable: !!speechRecognitionCtor(),
      recorderAvailable: offlineMicSupported(),
      serverAsrReady,
    })
    if (mode === 'recorder') startRecordedMic()
    else if (mode === 'browser') startBrowserMic()
  }

  const toggleMic = () => {
    if (asking) return
    if (listening) {
      if (micSession) finishRecordedMic()
      else stopMic()
      return
    }
    startMic()
  }

  // Mic support probe
  {
    const ok = chooseMicInputMode({
      recognitionAvailable: !!speechRecognitionCtor(),
      recorderAvailable: offlineMicSupported(),
      serverAsrReady,
    }) !== 'none'
    allMics().forEach((btn) => {
      if (!ok) {
        btn.disabled = true
        btn.dataset.micOk = '0'
        btn.title = '当前设备无法读取麦克风'
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
    const clearBtn = t.closest?.('[data-djtk-clear]')
    if (clearBtn && host.contains(clearBtn)) {
      ev.preventDefault()
      resetConversation()
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
      const askText = chip.getAttribute('data-djtk-ask') || chip.textContent || ''
      ask(askText)
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
  if (/海关|监管|法规|政务公开/.test(s)) {
    return '风险情报库保存了监管公开信息离线快照，用于确定排查重点。当前批次结论以养殖、检测、评价、报告与追溯记录为准。'
  }
  if (/氟苯|兽药|用药|剂量|处方|能不能用|可以用|合规使用|休药/.test(s)) {
    if (/筛查|结果|检出|残留|阴性|阳性/.test(s) && !/怎么用|如何用|剂量|处方|合规使用|能不能用|可以用/.test(s)) {
      return '本助手不做用药处方。氟苯尼考筛查请打开安全检测页或焦点档案，核对筛查定性与结果字段。'
    }
    return '本助手不做用药处方，也不回答氟苯尼考能否使用。请打开安全检测或焦点档案查看记录。'
  }
  if (/风险|待复核|复核/.test(s)) {
    return '请查看焦点档案判定条与报告印章是否为待复核；下一步可打开安全检测或健康评价核对记录。'
  }
  if (/哪|来|产地|基地|从/.test(s)) {
    return '请查看左侧焦点档案中的基地与批次字段。'
  }
  if (/安全|合格|残留|上桌|放心|检出/.test(s)) {
    return '安全结论需要对应批次证据。请查看焦点档案、判定条和安全检测页的筛查结果。'
  }
  if (/下一步|点哪|怎么|操作|去哪/.test(s)) {
    return '可先选择传送带上的检测或评价节点，或打开安全检测、健康评价页查看记录。'
  }
  return '请先查看焦点档案与判定条，也可以继续询问批次来源、安全状态、下一步或待复核项。'
}
