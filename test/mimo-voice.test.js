import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

test('联网时 MiMo 负责语音识别和女声合成，但不参与批次判定', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'djtk-mimo-voice-'))
  const previous = {
    database: process.env.DATABASE_PATH,
    stageToken: process.env.DJTK_STAGE_TOKEN,
    apiKey: process.env.MIMO_API_KEY,
    baseUrl: process.env.MIMO_BASE_URL,
  }
  const originalFetch = globalThis.fetch
  const requests = []

  process.env.DATABASE_PATH = join(tempDir, 'test.db')
  process.env.DJTK_STAGE_TOKEN = 'hybrid-voice-test-token'
  process.env.MIMO_API_KEY = 'hybrid-voice-key'
  process.env.MIMO_BASE_URL = 'https://voice.test/v1'
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(String(options?.body || '{}'))
    requests.push({ url: String(url), body })
    if (body.model === 'mimo-v2.5-asr') {
      return new Response(JSON.stringify({ choices: [{ message: { content: '请说明当前批次风险。' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({ choices: [{ message: { audio: { data: 'UklGRg==' } } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  let app
  try {
    const { buildApp } = await import('../server/app.js')
    app = await buildApp()
    const headers = { 'x-stage-token': 'hybrid-voice-test-token' }

    const status = (await app.inject({ method: 'GET', url: '/api/djtk/status' })).json()
    assert.equal(status.mode, 'hybrid-voice')
    assert.equal(status.asrReady, true)
    assert.equal(status.ttsReady, true)
    assert.equal(status.voiceInput, 'mimo-asr-with-browser-fallback')
    assert.equal(status.voiceOutput, 'mimo-tts-with-system-fallback')

    const ask = await app.inject({
      method: 'POST',
      url: '/api/djtk/ask',
      headers,
      payload: { question: '请概括平台能力。', batchId: '蓟划-2026-0812' },
    })
    assert.equal(ask.statusCode, 200)
    assert.equal(ask.json().model, 'local-evidence')
    assert.equal(requests.length, 0)

    const transcribe = await app.inject({
      method: 'POST',
      url: '/api/djtk/transcribe',
      headers: { ...headers, 'content-type': 'application/octet-stream', 'x-sample-rate': '16000' },
      payload: Buffer.alloc(3200, 1),
    })
    assert.equal(transcribe.statusCode, 200)
    assert.equal(transcribe.json().text, '请说明当前批次风险。')

    const voice = await app.inject({
      method: 'POST',
      url: '/api/djtk/tts',
      headers,
      payload: { text: '本批次平台证据已核验。' },
    })
    assert.equal(voice.statusCode, 200)
    assert.equal(voice.json().voice, '茉莉')
    assert.equal(voice.json().voiceGender, 'female')
    assert.equal(voice.json().audioBase64, 'UklGRg==')
    assert.equal(requests.length, 2)
    assert.equal(requests[0].body.model, 'mimo-v2.5-asr')
    assert.equal(requests[0].body.messages[0].content[0].type, 'input_audio')
    assert.equal(requests[1].body.model, 'mimo-v2.5-tts')
    assert.equal(requests[1].body.audio.voice, '茉莉')
  } finally {
    if (app) await app.close()
    globalThis.fetch = originalFetch
    for (const [key, value] of Object.entries({
      DATABASE_PATH: previous.database,
      DJTK_STAGE_TOKEN: previous.stageToken,
      MIMO_API_KEY: previous.apiKey,
      MIMO_BASE_URL: previous.baseUrl,
    })) {
      if (value == null) delete process.env[key]
      else process.env[key] = value
    }
    rmSync(tempDir, { recursive: true, force: true })
  }
})
