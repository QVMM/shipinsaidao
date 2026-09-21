export function resampleMono(input, inputRate, outputRate = 16000) {
  const source = input instanceof Float32Array ? input : Float32Array.from(input || [])
  if (!source.length) return new Float32Array()
  if (inputRate === outputRate) return source.slice()
  const ratio = inputRate / outputRate
  const length = Math.max(1, Math.round(source.length / ratio))
  const output = new Float32Array(length)
  for (let i = 0; i < length; i += 1) {
    const position = i * ratio
    const left = Math.floor(position)
    const right = Math.min(source.length - 1, left + 1)
    const mix = position - left
    output[i] = source[left] * (1 - mix) + source[right] * mix
  }
  return output
}

export function floatToPcm16(samples) {
  const source = samples instanceof Float32Array ? samples : Float32Array.from(samples || [])
  const buffer = new ArrayBuffer(source.length * 2)
  const view = new DataView(buffer)
  for (let i = 0; i < source.length; i += 1) {
    const value = Math.max(-1, Math.min(1, Number(source[i]) || 0))
    view.setInt16(i * 2, value < 0 ? Math.round(value * 32768) : Math.round(value * 32767), true)
  }
  return buffer
}

export function offlineMicSupported() {
  if (typeof window !== 'undefined' && typeof window.__DJTK_OFFLINE_RECORDER__ === 'function') return true
  return typeof navigator !== 'undefined'
    && Boolean(navigator.mediaDevices?.getUserMedia)
    && typeof window !== 'undefined'
    && Boolean(window.AudioContext || window.webkitAudioContext)
}

function flatten(chunks, total) {
  const output = new Float32Array(total)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.length
  }
  return output
}

export async function startOfflineRecorder(options = {}) {
  if (!offlineMicSupported()) throw new Error('当前设备无法读取麦克风。')
  if (typeof window !== 'undefined' && typeof window.__DJTK_OFFLINE_RECORDER__ === 'function') {
    return window.__DJTK_OFFLINE_RECORDER__(options)
  }
  const media = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: false,
  })
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext
  const context = new AudioContextCtor()
  const source = context.createMediaStreamSource(media)
  const processor = context.createScriptProcessor(4096, 1, 1)
  const sink = context.createGain()
  sink.gain.value = 0
  const chunks = []
  let total = 0
  let closed = false
  let heardSpeech = false
  let autoStopSent = false
  let lastVoiceAt = performance.now()
  const startedAt = performance.now()
  const threshold = Number(options.threshold || 0.018)
  const silenceMs = Number(options.silenceMs || 900)

  processor.onaudioprocess = (event) => {
    if (closed) return
    const copy = event.inputBuffer.getChannelData(0).slice()
    chunks.push(copy)
    total += copy.length
    let energy = 0
    for (let i = 0; i < copy.length; i += 1) energy += copy[i] * copy[i]
    const rms = Math.sqrt(energy / Math.max(1, copy.length))
    options.onLevel?.(Math.min(1, rms / 0.16))
    const now = performance.now()
    if (rms >= threshold) {
      heardSpeech = true
      lastVoiceAt = now
    } else if (heardSpeech && !autoStopSent && now - lastVoiceAt >= silenceMs && now - startedAt >= 700) {
      autoStopSent = true
      options.onAutoStop?.()
    }
  }

  source.connect(processor)
  processor.connect(sink)
  sink.connect(context.destination)
  const maxTimer = window.setTimeout(() => {
    if (!closed && !autoStopSent) {
      autoStopSent = true
      options.onAutoStop?.()
    }
  }, Number(options.maxDurationMs || 12_000))

  const cleanup = async () => {
    if (closed) return
    closed = true
    window.clearTimeout(maxTimer)
    processor.onaudioprocess = null
    try { source.disconnect() } catch { /* ignore */ }
    try { processor.disconnect() } catch { /* ignore */ }
    try { sink.disconnect() } catch { /* ignore */ }
    media.getTracks().forEach((track) => track.stop())
    try { await context.close() } catch { /* ignore */ }
  }

  return {
    sampleRate: 16000,
    async stop() {
      await cleanup()
      const samples = resampleMono(flatten(chunks, total), context.sampleRate, 16000)
      return { pcm: floatToPcm16(samples), durationMs: samples.length / 16, heardSpeech }
    },
    async cancel() { await cleanup() },
  }
}
