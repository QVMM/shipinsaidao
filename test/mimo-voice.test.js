import assert from 'node:assert/strict'
import test from 'node:test'

import { mimoVoiceConfigured, synthesizeMimoVoice } from '../server/mimo-voice.js'

test('联网且配置密钥时使用 MiMo 女声合成', async () => {
  const previousKey = process.env.MIMO_API_KEY
  const previousUrl = process.env.MIMO_BASE_URL
  const originalFetch = globalThis.fetch
  const requests = []
  process.env.MIMO_API_KEY = 'voice-test-key'
  process.env.MIMO_BASE_URL = 'https://voice.test/v1'
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), body: JSON.parse(String(options?.body || '{}')) })
    return new Response(JSON.stringify({
      choices: [{ message: { audio: { data: 'UklGRg==' } } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }

  try {
    assert.equal(mimoVoiceConfigured(), true)
    const voice = await synthesizeMimoVoice('本批次平台证据已核验。')
    assert.equal(voice.ok, true)
    assert.equal(voice.voice, '茉莉')
    assert.equal(voice.audioBase64, 'UklGRg==')
    assert.equal(requests[0].url, 'https://voice.test/v1/chat/completions')
    assert.equal(requests[0].body.model, 'mimo-v2.5-tts')
  } finally {
    globalThis.fetch = originalFetch
    if (previousKey == null) delete process.env.MIMO_API_KEY
    else process.env.MIMO_API_KEY = previousKey
    if (previousUrl == null) delete process.env.MIMO_BASE_URL
    else process.env.MIMO_BASE_URL = previousUrl
  }
})

test('未配置密钥时明确交给浏览器声音降级', async () => {
  const previousKey = process.env.MIMO_API_KEY
  const previousProxy = process.env.MIMO_PROXY_URL
  delete process.env.MIMO_API_KEY
  process.env.MIMO_PROXY_URL = 'off'
  try {
    assert.equal(mimoVoiceConfigured(), false)
    const result = await synthesizeMimoVoice('离线播报。')
    assert.equal(result.ok, false)
    assert.equal(result.fallback, 'browser')
  } finally {
    if (previousKey == null) delete process.env.MIMO_API_KEY
    else process.env.MIMO_API_KEY = previousKey
    if (previousProxy == null) delete process.env.MIMO_PROXY_URL
    else process.env.MIMO_PROXY_URL = previousProxy
  }
})

test('Windows 本地包联网时通过线上后端使用 MiMo，不要求用户配置密钥', async () => {
  const previousKey = process.env.MIMO_API_KEY
  const previousProxy = process.env.MIMO_PROXY_URL
  const originalFetch = globalThis.fetch
  const requests = []
  delete process.env.MIMO_API_KEY
  process.env.MIMO_PROXY_URL = 'https://mimo-proxy.test'
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), cookie: options.headers?.Cookie || '' })
    if (String(url).endsWith('/api/djtk/stage-session')) {
      return new Response('{"ok":true}', {
        status: 200,
        headers: { 'set-cookie': 'djtk_stage=signed-stage-cookie; Path=/; HttpOnly' },
      })
    }
    return new Response(JSON.stringify({
      ok: true,
      audioBase64: 'UklGRg==',
      mime: 'audio/wav',
      voice: '茉莉',
      voiceGender: 'female',
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }

  try {
    assert.equal(mimoVoiceConfigured(), true)
    const result = await synthesizeMimoVoice('本批次平台证据已核验。')
    assert.equal(result.ok, true)
    assert.equal(result.voice, '茉莉')
    assert.equal(result.audioBase64, 'UklGRg==')
    assert.deepEqual(requests.map((item) => item.url), [
      'https://mimo-proxy.test/api/djtk/stage-session',
      'https://mimo-proxy.test/api/djtk/tts',
    ])
    assert.match(requests[1].cookie, /^djtk_stage=/)
  } finally {
    globalThis.fetch = originalFetch
    if (previousKey == null) delete process.env.MIMO_API_KEY
    else process.env.MIMO_API_KEY = previousKey
    if (previousProxy == null) delete process.env.MIMO_PROXY_URL
    else process.env.MIMO_PROXY_URL = previousProxy
  }
})
