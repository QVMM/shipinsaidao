/** 演示话术 TTS：优先 MIMO /api/djtk/tts，失败则浏览器 SpeechSynthesis。 */

import { STAGE_TOKEN, speakWithMimoOrBrowser, stopDjtkAudio } from './djtk-human.js'

let speaking = false

export function stopDemoSpeech() {
  speaking = false
  try {
    window.speechSynthesis?.cancel()
  } catch {
    /* ignore */
  }
  try {
    stopDjtkAudio()
  } catch {
    /* ignore */
  }
}

export function isDemoSpeechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
}

/**
 * @returns {SpeechSynthesisVoice | null}
 */
function pickZhVoice() {
  const list = window.speechSynthesis?.getVoices?.() || []
  const prefer = [
    (v) => /zh(-|_)CN/i.test(v.lang) && /female|女|Xiaoxiao|Xiaoyi|Yaoyao|Huihui|Tingting/i.test(v.name),
    (v) => /zh(-|_)CN/i.test(v.lang),
    (v) => /^zh/i.test(v.lang),
    (v) => /Chinese|中文|普通话/i.test(v.name),
  ]
  for (const fn of prefer) {
    const hit = list.find(fn)
    if (hit) return hit
  }
  return list[0] || null
}

/**
 * @param {string} text
 * @param {{ rate?: number, pitch?: number }} [opts]
 * @returns {Promise<void>}
 */
function speakOneBrowser(text, opts = {}) {
  return new Promise((resolve) => {
    if (!isDemoSpeechSupported() || !text?.trim()) {
      resolve()
      return
    }
    const u = new SpeechSynthesisUtterance(String(text).trim())
    u.lang = 'zh-CN'
    u.rate = opts.rate ?? 1.02
    u.pitch = opts.pitch ?? 1
    const voice = pickZhVoice()
    if (voice) u.voice = voice
    u.onend = () => resolve()
    u.onerror = () => resolve()
    try {
      window.speechSynthesis.speak(u)
    } catch {
      resolve()
    }
  })
}

/**
 * One line: MIMO TTS first, browser fallback.
 * @param {string} text
 */
async function speakOne(text) {
  if (!speaking || !text?.trim()) return
  await speakWithMimoOrBrowser(String(text).trim(), {
    stageToken: STAGE_TOKEN,
    onStart() { /* keep speaking flag */ },
    onEnd() { /* per-line */ },
  })
}

/**
 * 按顺序播报：4号 → DJTK → 团队金句（若有）。旁白 note 不播。
 * 优先 /api/djtk/tts，失败回退浏览器 TTS。
 * @param {{ engineer: { who: string, say: string }, assistant: { who: string, say: string }, team?: string[] }} script
 * @param {{ onStart?: () => void, onEnd?: () => void }} [hooks]
 */
export async function speakDemoAct(script, hooks = {}) {
  stopDemoSpeech()
  // Chrome：voices 可能异步就绪（浏览器兜底时用）
  if (isDemoSpeechSupported()) {
    await new Promise((r) => {
      const ready = window.speechSynthesis.getVoices()
      if (ready?.length) {
        r(undefined)
        return
      }
      const done = () => {
        window.speechSynthesis.removeEventListener('voiceschanged', done)
        r(undefined)
      }
      window.speechSynthesis.addEventListener('voiceschanged', done)
      setTimeout(done, 400)
    })
  }

  speaking = true
  hooks.onStart?.()
  const lines = [
    `${script.engineer.who}。${script.engineer.say}`,
    `${script.assistant.who}。${script.assistant.say}`,
  ]
  if (script.team?.length) {
    lines.push(script.team.join(''))
  }
  for (const line of lines) {
    if (!speaking) break
    try {
      await speakOne(line)
    } catch {
      if (!speaking) break
      await speakOneBrowser(line)
    }
  }
  const ok = speaking
  speaking = false
  hooks.onEnd?.()
  return ok
}

export function isDemoSpeaking() {
  return speaking || Boolean(window.speechSynthesis?.speaking)
}
