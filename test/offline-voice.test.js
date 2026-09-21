import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  encodeWaveBuffer,
  getOfflineVoiceStatus,
  normalizeTranscript,
  synthesizeOfflineVoice,
  ttsEngineCandidates,
  transcribePcm16,
  warmOfflineVoice,
} from '../server/offline-voice.js'

test('PCM 可以编码为浏览器可播放的标准单声道 WAV', () => {
  const wav = encodeWaveBuffer(new Float32Array([0, 0.5, -0.5, 0]), 16000)
  assert.equal(wav.subarray(0, 4).toString('ascii'), 'RIFF')
  assert.equal(wav.subarray(8, 12).toString('ascii'), 'WAVE')
  assert.equal(wav.readUInt16LE(22), 1)
  assert.equal(wav.readUInt32LE(24), 16000)
  assert.equal(wav.readUInt16LE(34), 16)
})

test('离线识别会修正常见的养殖领域近音词', () => {
  assert.equal(normalizeTranscript('<|zh|>这P机安全吗？'), '这批鸡安全吗？')
  assert.equal(normalizeTranscript('夫本尼考未检出'), '氟苯尼考未检出')
  assert.equal(normalizeTranscript('替抗句话项目'), '替抗计划项目')
})

test('模型缺失时自检明确指出 ASR 与 TTS 尚未安装', () => {
  const modelDir = mkdtempSync(join(tmpdir(), 'djtk-no-models-'))
  const previous = process.env.OFFLINE_MODEL_DIR
  process.env.OFFLINE_MODEL_DIR = modelDir
  try {
    const status = getOfflineVoiceStatus()
    assert.equal(status.ready, false)
    assert.equal(status.asrReady, false)
    assert.equal(status.ttsReady, false)
    assert.match(status.message, /模型/)
  } finally {
    if (previous == null) delete process.env.OFFLINE_MODEL_DIR
    else process.env.OFFLINE_MODEL_DIR = previous
    rmSync(modelDir, { recursive: true, force: true })
  }
})

test('自然女声失败时按顺序自动切换到本地备用女声', () => {
  assert.deepEqual(
    ttsEngineCandidates({ naturalVoiceReady: true, fallbackVoiceReady: true, preferMatcha: false }),
    ['zipvoice', 'matcha'],
  )
  assert.deepEqual(
    ttsEngineCandidates({ naturalVoiceReady: true, fallbackVoiceReady: true, preferMatcha: true }),
    ['matcha', 'zipvoice'],
  )
})

test('离线语音测试模式无需网络即可完成识别和女声合成', async () => {
  const previous = {
    fake: process.env.OFFLINE_VOICE_FAKE,
    text: process.env.OFFLINE_VOICE_FAKE_TEXT,
  }
  process.env.OFFLINE_VOICE_FAKE = '1'
  process.env.OFFLINE_VOICE_FAKE_TEXT = '这批鸡安全吗？'
  try {
    const pcm = Buffer.alloc(3200)
    const recognized = await transcribePcm16(pcm, 16000)
    assert.equal(recognized.ok, true)
    assert.equal(recognized.text, '这批鸡安全吗？')

    const voice = await synthesizeOfflineVoice('本批次证据已核验。')
    assert.equal(voice.ok, true)
    assert.equal(voice.voice, '本地自然女声·Emilia')
    assert.equal(voice.voiceGender, 'female')
    assert.equal(voice.mime, 'audio/wav')
    assert.ok(voice.audioBase64.length > 40)

    const warmed = await warmOfflineVoice()
    assert.equal(warmed.ok, true)
    assert.equal(warmed.voiceGender, 'female')
  } finally {
    if (previous.fake == null) delete process.env.OFFLINE_VOICE_FAKE
    else process.env.OFFLINE_VOICE_FAKE = previous.fake
    if (previous.text == null) delete process.env.OFFLINE_VOICE_FAKE_TEXT
    else process.env.OFFLINE_VOICE_FAKE_TEXT = previous.text
  }
})
