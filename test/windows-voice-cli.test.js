import assert from 'node:assert/strict'
import test from 'node:test'

import {
  asrCliArgs,
  extractCliTranscript,
  ttsCliArgs,
} from '../server/windows-voice-cli.js'

const modelPaths = {
  asrModel: 'C:\\models\\sensevoice\\model.int8.onnx',
  asrTokens: 'C:\\models\\sensevoice\\tokens.txt',
  zipEncoder: 'C:\\models\\zipvoice\\encoder.int8.onnx',
  zipDecoder: 'C:\\models\\zipvoice\\decoder.int8.onnx',
  zipDataDir: 'C:\\models\\zipvoice\\espeak-ng-data',
  zipLexicon: 'C:\\models\\zipvoice\\lexicon.txt',
  zipTokens: 'C:\\models\\zipvoice\\tokens.txt',
  zipVocoder: 'C:\\models\\vocos_24khz.onnx',
  zipReference: 'C:\\models\\zipvoice\\test_wavs\\news-female.wav',
}

test('Windows ARM64 CLI TTS preserves Chinese text as one argv item', () => {
  const args = ttsCliArgs(modelPaths, '系统语音已就绪。', 'C:\\temp\\voice.wav')
  assert.equal(args.at(-1), '系统语音已就绪。')
  assert.ok(args.includes('--num-threads=4'))
  assert.ok(args.includes('--num-steps=4'))
  assert.ok(args.some((arg) => arg.startsWith('--reference-text=')))
  assert.ok(args.includes('--output-filename=C:\\temp\\voice.wav'))
})

test('Windows ARM64 CLI ASR uses SenseVoice and returns normalized JSON transcript', () => {
  const args = asrCliArgs(modelPaths, 'C:\\temp\\input.wav')
  assert.ok(args.includes('--sense-voice-language=zh'))
  assert.equal(args.at(-1), 'C:\\temp\\input.wav')

  const output = [
    'Started',
    '{"lang":"<|zh|>","emotion":"<|NEUTRAL|>","text":"这批鸡安全吗？"}',
    'Done!',
  ].join('\r\n')
  assert.equal(extractCliTranscript(output), '这批鸡安全吗？')
})

test('Windows ARM64 CLI transcript parser does not mistake diagnostic output for speech', () => {
  assert.equal(extractCliTranscript('Creating recognizer...\nDone!'), '')
})
