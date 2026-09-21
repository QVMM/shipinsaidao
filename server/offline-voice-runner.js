import { Worker } from 'node:worker_threads'

import { synthesizeOfflineVoice } from './offline-voice.js'

const workerUrl = new URL('./offline-voice-worker.mjs', import.meta.url)
let activeWorker = null
let requestId = 0
const unavailableEngines = new Set()

export function workerExecArgv() {
  // Workers do not need CLI/debug/test-runner flags from the parent process.
  // Several valid parent flags are explicitly rejected by Worker.
  return []
}

function stopWorker(instance, result) {
  if (!instance) return
  if (activeWorker === instance) activeWorker = null
  for (const pending of instance.pending.values()) {
    clearTimeout(pending.timer)
    pending.resolve(result)
  }
  instance.pending.clear()
  void instance.worker.terminate()
}

function createWorker(engine) {
  if (activeWorker?.engine === engine) return activeWorker
  if (activeWorker) {
    stopWorker(activeWorker, { ok: false, status: 503, error: '本地女声引擎正在切换。' })
  }
  const instance = {
    engine,
    pending: new Map(),
    worker: new Worker(workerUrl, {
      workerData: { engine },
      env: { ...process.env, OFFLINE_VOICE_ENGINE: engine },
      execArgv: workerExecArgv(),
    }),
  }
  instance.worker.on('message', (message) => {
    const pending = instance.pending.get(message?.id)
    if (!pending) return
    instance.pending.delete(message.id)
    clearTimeout(pending.timer)
    pending.resolve(message.result)
  })
  instance.worker.on('error', (error) => {
    stopWorker(instance, {
      ok: false,
      status: 500,
      error: `本地女声线程异常：${String(error?.message || error)}`,
    })
  })
  instance.worker.on('exit', (code) => {
    if (instance.pending.size) {
      stopWorker(instance, {
        ok: false,
        status: 500,
        error: `本地女声线程已退出（${code}）。`,
      })
    }
    if (activeWorker === instance) activeWorker = null
  })
  activeWorker = instance
  return instance
}

function requestVoice(text, engine, timeoutMs) {
  const instance = createWorker(engine)
  const id = ++requestId
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      unavailableEngines.add(engine)
      stopWorker(instance, {
        ok: false,
        status: 504,
        error: `本地女声 ${engine} 生成超时，已停止该语音线程。`,
      })
    }, timeoutMs)
    instance.pending.set(id, { resolve, timer })
    instance.worker.postMessage({ id, text })
  })
}

export async function synthesizeOfflineVoiceIsolated(text, options = {}) {
  if (process.env.OFFLINE_VOICE_FAKE === '1') return synthesizeOfflineVoice(text)
  const engines = (options.engines || ['zipvoice', 'matcha']).filter((engine) => !unavailableEngines.has(engine))
  const timeoutMs = Math.max(50, Number(options.timeoutMs || process.env.OFFLINE_TTS_TIMEOUT_MS || 30_000))
  const errors = []
  for (const engine of engines) {
    const result = await requestVoice(text, engine, timeoutMs)
    if (result?.ok) return result
    unavailableEngines.add(engine)
    errors.push(result?.error || `${engine} 不可用`)
  }
  return {
    ok: false,
    status: errors.some((error) => error.includes('超时')) ? 504 : 500,
    error: errors.join('；') || '本地女声暂不可用。',
  }
}

export function warmOfflineVoiceIsolated() {
  return synthesizeOfflineVoiceIsolated('系统语音已就绪。')
}

export function shutdownOfflineVoiceRunner() {
  if (activeWorker) {
    stopWorker(activeWorker, { ok: false, status: 503, error: '本地女声服务已停止。' })
  }
}
