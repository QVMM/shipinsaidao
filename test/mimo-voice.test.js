import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

test('MiMo 只合成最终语音，不参与本地证据问答', async () => {
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
  process.env.DJTK_STAGE_TOKEN = 'voice-only-test-token'
  process.env.MIMO_API_KEY = 'voice-only-key'
  process.env.MIMO_BASE_URL = 'https://voice.test/v1'
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), body: JSON.parse(String(options?.body || '{}')) })
    return new Response(JSON.stringify({
      choices: [{ message: { audio: { data: 'UklGRg==' } } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }

  let app
  try {
    const { buildApp } = await import('../server/app.js')
    app = await buildApp()
    const headers = { 'x-stage-token': 'voice-only-test-token' }

    const ask = await app.inject({
      method: 'POST',
      url: '/api/djtk/ask',
      headers,
      payload: { question: '请概括平台能力。', batchId: '蓟化-2026-0812' },
    })
    assert.equal(ask.statusCode, 200)
    assert.equal(ask.json().model, 'local-evidence')
    assert.equal(requests.length, 0)

    const voice = await app.inject({
      method: 'POST',
      url: '/api/djtk/tts',
      headers,
      payload: { text: '本批次平台证据已核验。' },
    })
    assert.equal(voice.statusCode, 200)
    assert.equal(voice.json().voice, '茉莉')
    assert.equal(voice.json().audioBase64, 'UklGRg==')
    assert.equal(requests.length, 1)
    assert.equal(requests[0].url, 'https://voice.test/v1/chat/completions')
    assert.equal(requests[0].body.model, 'mimo-v2.5-tts')
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
