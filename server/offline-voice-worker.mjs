import { parentPort, workerData } from 'node:worker_threads'

if (!parentPort) throw new Error('offline voice worker requires a parent port')

if (workerData?.engine) process.env.OFFLINE_VOICE_ENGINE = String(workerData.engine)

const { synthesizeOfflineVoice } = await import('./offline-voice.js')

parentPort.on('message', async (message) => {
  if (!message || typeof message.id !== 'number') return
  if (process.env.OFFLINE_VOICE_WORKER_TEST_MODE === 'hang') return
  try {
    const result = await synthesizeOfflineVoice(message.text)
    parentPort.postMessage({ id: message.id, result })
  } catch (error) {
    parentPort.postMessage({
      id: message.id,
      result: {
        ok: false,
        status: 500,
        error: `本地女声工作线程失败：${String(error?.message || error)}`,
      },
    })
  }
})
