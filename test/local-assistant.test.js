import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

test('配置离线语音后，问答仍只使用本地证据且不发起外部请求', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'djtk-local-assistant-'))
  const originalDatabase = process.env.DATABASE_PATH
  const originalStageToken = process.env.DJTK_STAGE_TOKEN
  const originalVoiceFake = process.env.OFFLINE_VOICE_FAKE
  const originalOffline = process.env.OFFLINE_MODE
  const originalFetch = globalThis.fetch
  let fetchCalls = 0

  process.env.DATABASE_PATH = join(tempDir, 'test.db')
  process.env.DJTK_STAGE_TOKEN = 'local-voice-test-token'
  process.env.OFFLINE_VOICE_FAKE = '1'
  delete process.env.OFFLINE_MODE
  globalThis.fetch = async () => {
    fetchCalls += 1
    throw new Error('不应连接外部模型')
  }

  let app
  try {
    const { buildApp } = await import('../server/app.js')
    app = await buildApp()
    const statusResponse = await app.inject({ method: 'GET', url: '/api/djtk/status' })
    const status = statusResponse.json()
    assert.equal(status.mode, 'competition-offline')
    assert.equal(status.cloudModel, false)
    assert.equal(status.voiceInput, 'offline-sensevoice')
    assert.equal(status.voiceOutput, 'zipvoice-local-test')
    assert.equal(status.voiceName, '本地自然女声·Emilia')
    assert.equal(status.voiceGender, 'female')
    assert.equal(status.networkRequired, false)

    const response = await app.inject({
      method: 'POST',
      url: '/api/djtk/ask',
      headers: { 'x-stage-token': 'local-voice-test-token' },
      payload: {
        question: '请概括这个平台怎样帮助质量工程师协同工作。',
        batchId: '蓟化-2026-0812',
      },
    })
    const payload = response.json()

    assert.equal(response.statusCode, 200)
    assert.equal(fetchCalls, 0)
    assert.equal(payload.model, 'local-evidence')
    assert.equal(payload.degraded, false)
    assert.match(payload.answer, /平台|批次|证据/)
    assert.doesNotMatch(payload.answer, /降级|未连模型|云端暂不可用/)
  } finally {
    if (app) await app.close()
    globalThis.fetch = originalFetch
    if (originalDatabase == null) delete process.env.DATABASE_PATH
    else process.env.DATABASE_PATH = originalDatabase
    if (originalStageToken == null) delete process.env.DJTK_STAGE_TOKEN
    else process.env.DJTK_STAGE_TOKEN = originalStageToken
    if (originalVoiceFake == null) delete process.env.OFFLINE_VOICE_FAKE
    else process.env.OFFLINE_VOICE_FAKE = originalVoiceFake
    if (originalOffline == null) delete process.env.OFFLINE_MODE
    else process.env.OFFLINE_MODE = originalOffline
    rmSync(tempDir, { recursive: true, force: true })
  }
})
