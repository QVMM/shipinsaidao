import test from 'node:test'
import assert from 'node:assert/strict'

import { cloneSeed } from '../src/data.js'
import { deriveStage, resultOf, stationOf } from '../src/lib/pipeline.js'
import { buildStageView, nodeMetric } from '../src/lib/stage-view.js'
import { eventsOf } from '../server/command.js'

test('证据不合格时，焦点批次不能被强制展示为上市', () => {
  const state = cloneSeed()
  state.farm.medLog.find((row) => /饲用抗生素/.test(row.item)).result = '已使用'
  state.program.pipelineStage = 'market'

  assert.equal(deriveStage(state), 'alert')
  assert.equal(buildStageView(state).scenes.market, false)
  assert.equal(nodeMetric('market', state), '待放行')
  assert.equal(eventsOf(state, deriveStage(state)).some((event) => /合格准予上市|已上市/.test(event.line)), false)
})

test('封存链断裂时进入溯源预警而不是上市队列', () => {
  const state = cloneSeed()
  state.seal = { okChain: false, okLive: true, status: '链断裂' }

  assert.equal(deriveStage(state), 'alert')
  assert.equal(stationOf(state), 'tracing')
  assert.equal(resultOf(state, 'alert'), '证据封存待核验')
  assert.equal(buildStageView(state).verdict.headline, '证据封存待核验')
})
