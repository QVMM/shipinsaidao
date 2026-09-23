import test from 'node:test'
import assert from 'node:assert/strict'

import { buildFastAnswer, sanitizeDjtkAnswer } from '../server/local-assistant.js'

const blockedEvidence = {
  batchId: 'TEST-FAIL',
  verdict: { pass: false, headline: '尚未达到出证条件', reasons: ['安全筛查尚未完成'] },
  screen: { qualitative: '', result: '' },
  report: { generated: false, no: '' },
}

const passedEvidence = {
  batchId: 'TEST-PASS',
  verdict: { pass: true, headline: '合格准予上市', reasons: [] },
  screen: { qualitative: '阴性', result: '未检出' },
  report: { generated: true, no: 'THJH-TEST-001' },
}

test('当前批次研判必须服从证据状态', () => {
  const reply = buildFastAnswer('请汇总当前焦点批次的风险、判定依据与下一步。', blockedEvidence)
  assert.equal(/全部合格|准予上市/.test(reply.answer), false)
  assert.match(reply.answer, /批次|焦点|风险|证据/)
})

test('AI 在判定未通过时不得输出合格上市结论', () => {
  const answer = sanitizeDjtkAnswer('本批次合格准予上市。', blockedEvidence)
  assert.equal(/合格准予上市/.test(answer), false)
  assert.match(answer, /证据|未达到/)
})

test('监管问答说明离线快照与批次证据边界', () => {
  const reply = buildFastAnswer('当前海关和监管数据状态？', blockedEvidence)
  assert.match(reply.answer, /海关中心政务公开数据平台/)
  assert.match(reply.answer, /在线更新.*本地保留|本地保留.*在线更新/)
  assert.match(reply.answer, /当前批次是否上市/)
  assert.equal(/通报称|预警显示|依法退市/.test(reply.answer), false)
})

test('实验前风险排查入口返回需求中的风险判断', () => {
  const reply = buildFastAnswer(
    '请结合海关中心政务公开数据平台，对近期我国出口鸡肉安全进行风险排查。',
    passedEvidence,
  )
  assert.match(reply.answer, /近一个月出口鸡肉安全信息/)
  assert.match(reply.answer, /某海关中心/)
  assert.match(reply.answer, /氟苯尼考兽药残留超标/)
})

test('指定开场任务返回需求文档中的风险排查话术', () => {
  const reply = buildFastAnswer(
    '我是某出口鸡肉企业的质量工程师，我联动自主开发的大蓟替抗智控平台，对近期我国出口鸡肉安全进行风险排查。请DJTK智控助手结合大数据平台进行安全风险排查。',
    passedEvidence,
  )
  assert.match(reply.answer, /近一个月出口鸡肉安全信息/)
  assert.match(reply.answer, /约 10 万吨订单缺口/)
})

test('指定结果判定话术只有证据通过时才允许说全部合格', () => {
  const question = '质检结果已出，请DJTK智控助手结合实时数据进行样品结果判定。'
  const passed = buildFastAnswer(question, passedEvidence)
  assert.equal(passed.answer, '已完成结果审核，并对标高品质鸡肉三维评价体系做出判定，大蓟替抗鸡肉抽检样品全部合格。')

  const blocked = buildFastAnswer(question, blockedEvidence)
  assert.equal(/全部合格/.test(blocked.answer), false)
  assert.match(blocked.answer, /尚未达到|未通过|待复核/)
})

test('指定收束口令返回正式安全承诺话术', () => {
  const reply = buildFastAnswer('大蓟替抗 高品质鸡肉解决方案 技能展示完成', passedEvidence)
  assert.equal(reply.answer, '屏幕之外可能是素未谋面的陌生人，也可能是我们的家人；感谢替抗蓟划团队，以技能筑牢安全防线，护航中国高品质鸡肉走向世界餐桌。')
})

test('快捷按钮、键盘和语音口语变体命中同一比赛话术', () => {
  const cases = [
    {
      canonical: '请结合海关中心政务公开数据平台，对近期我国出口鸡肉安全进行风险排查。',
      variants: [
        '出口风险排查',
        '请帮我排查近期出口鸡肉的安全风险',
        '结合海关公开数据，做出口鸡肉风险排查',
      ],
    },
    {
      canonical: '质检结果已出，请DJTK智控助手结合实时数据进行样品结果判定。',
      variants: [
        '样品结果判定',
        '质检结果出来了，请结合实时数据判断样品结果',
      ],
    },
    {
      canonical: '大蓟替抗 高品质鸡肉解决方案 技能展示完成',
      variants: [
        '安全使命收束',
        '大蓟替抗高品质鸡肉解决方案技能展示完毕',
      ],
    },
    {
      canonical: '请说明当前焦点批次能否上市，以及判定依据。',
      variants: [
        '上市判定依据',
        '这批鸡能不能上市，依据是什么',
      ],
    },
  ]

  for (const item of cases) {
    const expected = buildFastAnswer(item.canonical, passedEvidence)?.answer
    assert.ok(expected)
    for (const variant of item.variants) {
      assert.equal(buildFastAnswer(variant, passedEvidence)?.answer, expected, variant)
    }
  }
})
