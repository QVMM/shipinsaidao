import assert from 'node:assert/strict'
import test from 'node:test'

import { speakPreview } from '../src/lib/djtk-human.js'

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
