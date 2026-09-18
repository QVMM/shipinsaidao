import test from 'node:test'
import assert from 'node:assert/strict'

import { NAV } from '../src/lib/journey.js'
import { render as renderRegulatoryRisk } from '../src/pages/customs.js'

test('法规风险入口指向本地离线页面且不伪造外部来源', () => {
  const product = NAV.find((item) => item.id === 'product')
  const customs = product.children.find((item) => item.id === 'customs')

  assert.equal(customs.href, '#/customs')
  assert.notEqual(customs.external, true)
  assert.equal(/href=["']https?:\/\//i.test(renderRegulatoryRisk()), false)
  assert.match(renderRegulatoryRisk(), /未接入实时监管数据/)
})
