import assert from 'node:assert/strict'
import test from 'node:test'

import { selectFemaleChineseVoice, speakPreview, speakWithPreferredVoice } from '../src/lib/djtk-human.js'

const requiredClosing = '屏幕之外可能是素未谋面的陌生人，也可能是我们的家人；感谢替抗蓟化团队，以技能筑牢安全防线，护航中国高品质鸡肉走向世界餐桌。'

test('收束播报只保留指定的安全承诺段落', () => {
  const extra = '给孩子一块鸡排，只留香，不留忧；给父母一碗鸡汤，只暖心，不担心；“产地中国”，成为世界放心。'
  assert.equal(speakPreview(`${requiredClosing}${extra}`, 240), requiredClosing)
})

test('普通回答仍优先在完整句子处截断', () => {
  assert.equal(speakPreview('第一句说明依据。第二句补充详情，需要更多字符。', 10), '第一句说明依据。')
})

test('4 号现场人员台词不进入助手播报', () => {
  const operator = '4 号：质检结果已出，请DJTK智控助手结合实时数据进行样品结果判定。'
  const assistant = 'DJTK智能助手：已完成结果审核，并对标高品质鸡肉三维评价体系做出判定，大蓟替抗鸡肉抽检样品全部合格。'
  assert.equal(
    speakPreview(`${operator}\n${assistant}`, 240),
    '已完成结果审核，并对标高品质鸡肉三维评价体系做出判定，大蓟替抗鸡肉抽检样品全部合格。',
  )
})

test('浏览器播报优先中文女声，没有女声时仍使用电脑自带中文声音', () => {
  const voices = [
    { name: 'Microsoft Yunxi Online', lang: 'zh-CN' },
    { name: 'Microsoft Xiaoxiao Online', lang: 'zh-CN' },
    { name: 'Samantha', lang: 'en-US' },
  ]
  assert.equal(selectFemaleChineseVoice(voices)?.name, 'Microsoft Xiaoxiao Online')
  assert.equal(selectFemaleChineseVoice([voices[0]])?.name, 'Microsoft Yunxi Online')
})

test('MiMo 不可用时自动使用浏览器自带声音', async () => {
  const originalFetch = globalThis.fetch
  const originalWindow = globalThis.window
  const originalUtterance = globalThis.SpeechSynthesisUtterance
  const originalDocument = globalThis.document
  let fetchCalls = 0
  let spoken = ''
  let spokenRate = 0
  let spokenPitch = 0
  globalThis.fetch = async () => {
    fetchCalls += 1
    throw new Error('MiMo unavailable')
  }
  globalThis.SpeechSynthesisUtterance = class {
    constructor(text) { this.text = text }
  }
  globalThis.window = {
    setTimeout,
    SpeechSynthesisUtterance: globalThis.SpeechSynthesisUtterance,
    speechSynthesis: {
      cancel() {},
      getVoices() { return [{ name: 'Microsoft Xiaoxiao Online', lang: 'zh-CN' }] },
      speak(utterance) {
        spoken = utterance.text
        spokenRate = utterance.rate
        spokenPitch = utterance.pitch
        utterance.onstart?.()
        utterance.onend?.()
      },
    },
  }
  globalThis.document = { querySelectorAll: () => [] }

  try {
    const result = await speakWithPreferredVoice('浏览器播报测试。')
    assert.equal(fetchCalls, 1)
    assert.equal(result.via, 'browser')
    assert.equal(spoken, '浏览器播报测试。')
    assert.equal(spokenRate, 0.92)
    assert.equal(spokenPitch, 1)
  } finally {
    globalThis.fetch = originalFetch
    globalThis.window = originalWindow
    globalThis.SpeechSynthesisUtterance = originalUtterance
    globalThis.document = originalDocument
  }
})
