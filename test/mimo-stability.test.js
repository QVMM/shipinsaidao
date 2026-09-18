import test from 'node:test'
import assert from 'node:assert/strict'

import { mimoChat } from '../server/mimo.js'

const evidence = {
  batchId: 'TEST-MIMO',
  verdict: { pass: false, reasons: ['报告尚未生成'] },
  screen: { qualitative: '阴性', result: '未检出' },
  report: { generated: false, no: '' },
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function withMimoMock(mockFetch, run) {
  const beforeFetch = globalThis.fetch
  const beforeKey = process.env.MIMO_API_KEY
  const beforeOffline = process.env.OFFLINE_MODE
  globalThis.fetch = mockFetch
  process.env.MIMO_API_KEY = 'test-mimo-key'
  delete process.env.OFFLINE_MODE
  try {
    await run()
  } finally {
    globalThis.fetch = beforeFetch
    if (beforeKey == null) delete process.env.MIMO_API_KEY
    else process.env.MIMO_API_KEY = beforeKey
    if (beforeOffline == null) delete process.env.OFFLINE_MODE
    else process.env.OFFLINE_MODE = beforeOffline
  }
}

test('MIMO 文本问答显式关闭深度思考并使用 completion token 参数', async () => {
  let requestBody
  await withMimoMock(async (_url, options) => {
    requestBody = JSON.parse(options.body)
    return jsonResponse({ choices: [{ message: { content: '平台记录显示该批次仍需完成报告环节。' } }] })
  }, async () => {
    const result = await mimoChat({ question: '概括这个产品的价值。', evidence })
    assert.equal(result.ok, true)
  })

  assert.deepEqual(requestBody.thinking, { type: 'disabled' })
  assert.equal(requestBody.max_completion_tokens > 0, true)
  assert.equal('max_tokens' in requestBody, false)
})

test('MIMO 瞬时 503 后自动重试一次并返回有效回答', async () => {
  let calls = 0
  await withMimoMock(async () => {
    calls += 1
    if (calls === 1) return jsonResponse({ error: { message: 'temporarily unavailable' } }, 503)
    return jsonResponse({ choices: [{ message: { content: '本批次回答只依据平台证据。' } }] })
  }, async () => {
    const result = await mimoChat({ question: '概括这个产品的价值。', evidence })
    assert.equal(result.ok, true)
    assert.equal(result.answer, '本批次回答只依据平台证据。')
  })
  assert.equal(calls, 2)
})

test('MIMO 首次返回空内容时自动重试而不是立即降级', async () => {
  let calls = 0
  await withMimoMock(async () => {
    calls += 1
    if (calls === 1) return jsonResponse({ choices: [{ message: { content: '' } }] })
    return jsonResponse({ choices: [{ message: { content: '已恢复有效回答。' } }] })
  }, async () => {
    const result = await mimoChat({ question: '概括这个产品的价值。', evidence })
    assert.equal(result.ok, true)
    assert.equal(result.answer, '已恢复有效回答。')
  })
  assert.equal(calls, 2)
})
