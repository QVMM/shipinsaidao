import assert from 'node:assert/strict'
import test from 'node:test'

import { floatToPcm16, resampleMono } from '../src/lib/offline-audio.js'

test('麦克风采样可以降采样为 16kHz 单声道 PCM16', () => {
  const source = Float32Array.from({ length: 4800 }, (_, index) => Math.sin(index / 12) * 0.5)
  const downsampled = resampleMono(source, 48000, 16000)
  assert.ok(downsampled.length >= 1599 && downsampled.length <= 1601)
  const pcm = floatToPcm16(downsampled)
  assert.equal(pcm.byteLength, downsampled.length * 2)
  const view = new DataView(pcm)
  assert.ok(Math.abs(view.getInt16(2, true)) > 0)
})

test('同采样率时保持样本长度且不会复用可变输入', () => {
  const source = new Float32Array([0, 0.25, -0.25])
  const output = resampleMono(source, 16000, 16000)
  assert.deepEqual([...output], [...source])
  assert.notEqual(output, source)
})
