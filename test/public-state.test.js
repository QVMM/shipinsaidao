import test from 'node:test'
import assert from 'node:assert/strict'

import { publicStateFromApi } from '../src/store.js'

test('公开追溯只使用接口返回值，不拿演示种子补空字段', () => {
  const state = publicStateFromApi({
    batchId: 'TEST-001',
    productName: '测试批次',
    farm: { name: '测试基地' },
    screen: {},
    report: { generated: false },
    trace: { generated: false },
  })

  assert.equal(state.batchId, 'TEST-001')
  assert.equal(state.farm.name, '测试基地')
  assert.equal(state.farm.additive, '')
  assert.equal(state.screen.qualitative, '')
  assert.equal(state.eval.IL6, '')
  assert.equal(state.eval.moisture, '')
  assert.equal(state.eval.tenderness, '')
  assert.equal(state.eval.pH, '')
  assert.equal(state.eval.waterHolding, '')
  for (const field of ['protein', 'fat', 'minerals', 'vitamins', 'aminoAcids', 'fattyAcids', 'peptides']) {
    assert.equal(state.eval[field], '')
  }
  assert.equal(state.report.no, '')
  assert.equal(state.trace.verifyId, '')
})
