import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'tihua-issuance-'))
process.env.DATABASE_PATH = join(dir, 'test.db')

const {
  createBatch,
  ensureSeeded,
  generateReport,
  DEFAULT_BATCH_ID,
  getBatch,
  getPublicTrace,
  patchBatch,
} = await import('../server/db.js')

const user = { id: 1, username: 'test', displayName: '测试审核员' }

ensureSeeded()

test('空白新批次不能生成报告', () => {
  const batch = createBatch(user)

  assert.throws(
    () => generateReport(batch.batchId, user),
    (err) => err?.code === 'issuance_blocked' && Array.isArray(err.reasons) && err.reasons.length > 0,
  )
  assert.equal(getBatch(batch.batchId).report.generated, false)
})

test('未出追溯码的批次不对公众开放', () => {
  const batch = createBatch(user)
  assert.equal(getPublicTrace(batch.batchId), null)
})

test('已出证批次的证据被修改后自动撤销报告和追溯码', () => {
  const before = getBatch(DEFAULT_BATCH_ID)
  assert.equal(before.report.generated, true)
  assert.equal(before.trace.generated, true)
  const medLog = structuredClone(before.farm.medLog)
  medLog.find((row) => /饲用抗生素/.test(row.item)).result = '已使用'

  const after = patchBatch(DEFAULT_BATCH_ID, { farm: { medLog } }, user)

  assert.equal(after.report.generated, false)
  assert.equal(after.trace.generated, false)
  assert.equal(after.review.reviewed, false)
  assert.equal(getPublicTrace(DEFAULT_BATCH_ID), null)
})
