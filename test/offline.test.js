import test from 'node:test'
import assert from 'node:assert/strict'

import { mimoConfigured } from '../server/mimo.js'
import { NAV } from '../src/lib/journey.js'
import { render as renderRegulatoryRisk } from '../src/pages/customs.js'

test('离线模式即使配置了云端密钥也不会尝试调用 MIMO', () => {
  const beforeOffline = process.env.OFFLINE_MODE
  const beforeKey = process.env.MIMO_API_KEY
  process.env.OFFLINE_MODE = '1'
  process.env.MIMO_API_KEY = 'test-key'
  try {
    assert.equal(mimoConfigured(), false)
  } finally {
    if (beforeOffline == null) delete process.env.OFFLINE_MODE
    else process.env.OFFLINE_MODE = beforeOffline
    if (beforeKey == null) delete process.env.MIMO_API_KEY
    else process.env.MIMO_API_KEY = beforeKey
  }
})

test('法规风险入口指向本地离线页面且不伪造外部来源', () => {
  const product = NAV.find((item) => item.id === 'product')
  const customs = product.children.find((item) => item.id === 'customs')

  assert.equal(customs.href, '#/customs')
  assert.notEqual(customs.external, true)
  assert.equal(/href=["']https?:\/\//i.test(renderRegulatoryRisk()), false)
  assert.match(renderRegulatoryRisk(), /未接入实时监管数据/)
})
