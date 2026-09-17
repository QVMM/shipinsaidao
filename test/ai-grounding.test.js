import test from 'node:test'
import assert from 'node:assert/strict'

import { buildFastAnswer, sanitizeDjtkAnswer } from '../server/mimo.js'

const blockedEvidence = {
  batchId: 'TEST-FAIL',
  verdict: { pass: false, headline: '尚未达到出证条件', reasons: ['安全筛查尚未完成'] },
  screen: { qualitative: '', result: '' },
  report: { generated: false, no: '' },
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

test('未接入实时外部监管数据时必须如实说明', () => {
  const reply = buildFastAnswer('当前海关和监管数据状态？', blockedEvidence)
  assert.match(reply.answer, /未接入实时外部监管数据/)
  assert.equal(/通报称|预警显示|依法退市/.test(reply.answer), false)
})
