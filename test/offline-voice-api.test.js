import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

test('比赛离线模式保留本地识别，并让语音输出降级到浏览器声音', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'djtk-offline-api-'))
  const keys = ['DATABASE_PATH', 'DJTK_STAGE_TOKEN', 'OFFLINE_MODE', 'OFFLINE_VOICE_FAKE', 'OFFLINE_VOICE_FAKE_TEXT', 'MIMO_API_KEY']
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
  const originalFetch = globalThis.fetch
  let fetchCalls = 0

  process.env.DATABASE_PATH = join(tempDir, 'test.db')
  process.env.DJTK_STAGE_TOKEN = 'offline-voice-test-token'
  process.env.OFFLINE_MODE = '1'
  process.env.OFFLINE_VOICE_FAKE = '1'
  process.env.OFFLINE_VOICE_FAKE_TEXT = '这批鸡能上市吗？'
  delete process.env.MIMO_API_KEY
  globalThis.fetch = async () => {
    fetchCalls += 1
    throw new Error('比赛离线模式不允许外部请求')
  }

  let app
  try {
    const { buildApp } = await import('../server/app.js')
    app = await buildApp()
    const headers = { 'x-stage-token': 'offline-voice-test-token' }

    const status = (await app.inject({ method: 'GET', url: '/api/djtk/status' })).json()
    assert.equal(status.voiceInput, 'offline-sensevoice')
    assert.equal(status.voiceOutput, 'browser-speech-synthesis')
    assert.equal(status.voiceGender, 'female-preferred')
    assert.equal(status.networkRequired, false)

    const transcribe = await app.inject({
      method: 'POST',
      url: '/api/djtk/transcribe',
      headers: { ...headers, 'content-type': 'application/octet-stream', 'x-sample-rate': '16000' },
      payload: Buffer.alloc(3200),
    })
    assert.equal(transcribe.statusCode, 200)
    assert.equal(transcribe.json().text, '这批鸡能上市吗？')

    const ask = await app.inject({
      method: 'POST',
      url: '/api/djtk/ask',
      headers,
      payload: { question: transcribe.json().text, batchId: '蓟化-2026-0812' },
    })
    assert.equal(ask.statusCode, 200)
    assert.match(ask.json().answer, /上市|证据|批次/)

    const tts = await app.inject({
      method: 'POST',
      url: '/api/djtk/tts',
      headers,
      payload: { text: ask.json().answer.slice(0, 80) },
    })
    assert.equal(tts.statusCode, 503)
    assert.equal(tts.json().fallback, true)
    assert.equal(fetchCalls, 0)
  } finally {
    if (app) await app.close()
    globalThis.fetch = originalFetch
    for (const key of keys) {
      if (previous[key] == null) delete process.env[key]
      else process.env[key] = previous[key]
    }
    rmSync(tempDir, { recursive: true, force: true })
  }
})
