import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cloneSeed } from '../src/data.js'
import { renderQualityBlock } from '../src/pages/eval.js'

const qualityFields = [
  'moisture', 'tenderness', 'pH', 'waterHolding',
  'protein', 'fat', 'minerals', 'vitamins', 'aminoAcids', 'fattyAcids', 'peptides',
]

test('焦点批次包含肉质核心与营养品质指标', () => {
  const state = cloneSeed()
  for (const field of qualityFields) assert.notEqual(String(state.eval[field] ?? '').trim(), '')

  const html = renderQualityBlock(state.eval)
  for (const label of ['水分', '嫩度', 'pH 值', '保水性', '蛋白质', '脂肪', '矿物质', '维生素', '氨基酸', '脂肪酸', '多肽']) {
    assert.match(html, new RegExp(label.replace(/[（）]/g, '\\$&')))
  }
  assert.match(html, /%/)
  assert.match(html, /N/)
})

test('肉质与营养品质指标均提供可持久化的编辑字段', () => {
  const html = renderQualityBlock(cloneSeed().eval, { editing: true })
  for (const field of qualityFields) {
    assert.match(html, new RegExp(`data-field="eval\\.${field}"`))
  }
})

test('肉质与营养品质指标可以写入数据库并完整读回', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tihua-quality-'))
  process.env.DATABASE_PATH = join(dir, 'quality.db')
  const { DEFAULT_BATCH_ID, ensureSeeded, getBatch, patchBatch } = await import('../server/db.js')
  ensureSeeded()
  const values = {
    moisture: 74.1, tenderness: 23.9, pH: 5.81, waterHolding: 80.3,
    protein: '22.6', fat: '2.5', minerals: '1.0', vitamins: 'B6 0.55 mg/100g',
    aminoAcids: '必需氨基酸 9.0 g/100g', fattyAcids: '不饱和脂肪酸 68.0%', peptides: '活性肽 1.9 g/100g',
  }
  patchBatch(DEFAULT_BATCH_ID, { eval: values }, { id: 1, displayName: '质量评价测试员' })
  const saved = getBatch(DEFAULT_BATCH_ID).eval
  for (const [field, value] of Object.entries(values)) assert.equal(saved[field], value)
})
