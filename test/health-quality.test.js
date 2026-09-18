import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cloneSeed } from '../src/data.js'
import { renderQualityBlock } from '../src/pages/eval.js'

test('焦点批次包含水分、嫩度、pH 和保水性四项肉质指标', () => {
  const state = cloneSeed()
  assert.equal(Number.isFinite(Number(state.eval.moisture)), true)
  assert.equal(Number.isFinite(Number(state.eval.tenderness)), true)
  assert.equal(Number.isFinite(Number(state.eval.pH)), true)
  assert.equal(Number.isFinite(Number(state.eval.waterHolding)), true)

  const html = renderQualityBlock(state.eval)
  for (const label of ['水分', '嫩度', 'pH 值', '保水性']) assert.match(html, new RegExp(label))
  assert.match(html, /%/)
  assert.match(html, /N/)
})

test('四项肉质指标均提供可持久化的编辑字段', () => {
  const html = renderQualityBlock(cloneSeed().eval, { editing: true })
  for (const field of ['moisture', 'tenderness', 'pH', 'waterHolding']) {
    assert.match(html, new RegExp(`data-field="eval\\.${field}"`))
  }
})

test('四项肉质指标可以写入数据库并完整读回', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tihua-quality-'))
  process.env.DATABASE_PATH = join(dir, 'quality.db')
  const { DEFAULT_BATCH_ID, ensureSeeded, getBatch, patchBatch } = await import('../server/db.js')
  ensureSeeded()
  const values = { moisture: 74.1, tenderness: 23.9, pH: 5.81, waterHolding: 80.3 }
  patchBatch(DEFAULT_BATCH_ID, { eval: values }, { id: 1, displayName: '质量评价测试员' })
  const saved = getBatch(DEFAULT_BATCH_ID).eval
  for (const [field, value] of Object.entries(values)) assert.equal(saved[field], value)
})
