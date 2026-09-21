import assert from 'node:assert/strict'
import test from 'node:test'

import { chooseMicInputMode } from '../src/lib/djtk-human.js'

test('浏览器没有 SpeechRecognition 时仍使用录音上传识别，不隐藏语音入口', () => {
  assert.equal(chooseMicInputMode({ recognitionAvailable: false, recorderAvailable: true, serverAsrReady: true }), 'recorder')
  assert.equal(chooseMicInputMode({ recognitionAvailable: false, recorderAvailable: true, serverAsrReady: null }), 'recorder')
})

test('云端识别未配置时优先使用浏览器识别作为联网版备用', () => {
  assert.equal(chooseMicInputMode({ recognitionAvailable: true, recorderAvailable: true, serverAsrReady: false }), 'browser')
  assert.equal(chooseMicInputMode({ recognitionAvailable: true, recorderAvailable: false, serverAsrReady: false }), 'browser')
})

test('只有两种输入能力都不存在时才禁用语音入口', () => {
  assert.equal(chooseMicInputMode({ recognitionAvailable: false, recorderAvailable: false, serverAsrReady: false }), 'none')
})
