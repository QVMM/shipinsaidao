import test from 'node:test'
import assert from 'node:assert/strict'

import { cloneSeed } from '../src/data.js'
import {
  computeVerdict,
  hplcStatus,
  inflamStatus,
  noFeedAntibiotic,
  screenStatus,
} from '../src/lib/verdict.js'

test('完整且一致的演示证据可以通过判定', () => {
  const state = cloneSeed()
  assert.equal(computeVerdict(state).pass, true)
})

test('明确使用饲用抗生素时不得通过判定', () => {
  const state = cloneSeed()
  state.farm.medLog.find((row) => /饲用抗生素/.test(row.item)).result = '已使用'

  assert.equal(noFeedAntibiotic(state), false)
  assert.equal(computeVerdict(state).pass, false)
})

test('缺少饲用抗生素记录时不得默认视为未使用', () => {
  const state = cloneSeed()
  state.farm.medLog = state.farm.medLog.filter((row) => !/饲用抗生素/.test(row.item))

  assert.equal(noFeedAntibiotic(state), false)
  assert.equal(computeVerdict(state).pass, false)
})

test('筛查定性和结果矛盾时必须失败', () => {
  const state = cloneSeed()
  state.screen.samples = []
  state.screen.qualitative = '阳性'
  state.screen.result = '未检出'

  assert.equal(screenStatus(state), 'fail')
  assert.equal(computeVerdict(state).pass, false)
})

test('只有小于号、没有可靠数值或未检出结论时不能通过 HPLC', () => {
  const state = cloneSeed()
  state.screen.valueText = '<待补录'
  state.screen.valueNum = ''

  assert.equal(hplcStatus(state), 'fail')
})

test('四项炎症指标未全部录入时保持待评价', () => {
  const state = cloneSeed()
  state.eval.CRP = ''

  assert.equal(inflamStatus(state), 'pending')
  assert.equal(computeVerdict(state).pass, false)
})

test('证据封存链断裂时不得显示为合格放行', () => {
  const state = cloneSeed()
  state.seal = { okChain: false, okLive: true, status: '链断裂' }

  assert.equal(computeVerdict(state).pass, false)
})
