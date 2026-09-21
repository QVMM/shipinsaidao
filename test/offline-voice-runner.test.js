import assert from 'node:assert/strict'
import test from 'node:test'

import { synthesizeOfflineVoiceIsolated, workerExecArgv } from '../server/offline-voice-runner.js'

test('本地女声线程不继承只允许主入口使用的 input-type 参数', () => {
  assert.deepEqual(
    workerExecArgv(['--trace-warnings', '--input-type=module']),
    [],
  )
})

test('本地女声工作线程超时不会阻塞 Web 主进程', async () => {
  const previous = process.env.OFFLINE_VOICE_WORKER_TEST_MODE
  process.env.OFFLINE_VOICE_WORKER_TEST_MODE = 'hang'
  try {
    const started = Date.now()
    const result = await synthesizeOfflineVoiceIsolated('超时保护测试。', {
      engines: ['zipvoice'],
      timeoutMs: 60,
    })
    assert.equal(result.ok, false)
    assert.equal(result.status, 504)
    assert.match(result.error, /超时/)
    assert.ok(Date.now() - started < 1500)
  } finally {
    if (previous == null) delete process.env.OFFLINE_VOICE_WORKER_TEST_MODE
    else process.env.OFFLINE_VOICE_WORKER_TEST_MODE = previous
  }
})
