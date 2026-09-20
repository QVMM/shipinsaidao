import { getOfflineVoiceStatus } from '../server/offline-voice.js'

const status = getOfflineVoiceStatus()
process.stdout.write(`${JSON.stringify({
  ok: status.ready,
  asr: status.asrReady,
  tts: status.ttsReady,
  vad: status.vadReady,
  native: status.nativeReady,
  voice: status.voice,
  modelDir: status.modelDir,
  message: status.message,
}, null, 2)}\n`)

if (!status.ready) process.exitCode = 1
