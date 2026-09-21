import test from 'node:test'
import assert from 'node:assert/strict'

import { NAV } from '../src/lib/journey.js'
import { render as renderRegulatoryRisk } from '../src/pages/customs.js'

test('产品端只包含安全检测与健康评价，风险情报独立导航', () => {
  const product = NAV.find((item) => item.id === 'product')
  const customs = NAV.find((item) => item.id === 'customs')

  assert.deepEqual(product.children.map((item) => item.id), ['screen', 'eval'])
  assert.equal(customs.href, '#/customs')
  assert.notEqual(customs.external, true)
  assert.equal(/href=["']https?:\/\//i.test(renderRegulatoryRisk()), false)
  assert.match(renderRegulatoryRisk(), /监管公开信息离线快照/)
})
