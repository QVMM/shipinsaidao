import test from 'node:test'
import assert from 'node:assert/strict'

import { NAV } from '../src/lib/journey.js'
import { render as renderRegulatoryRisk } from '../src/pages/customs.js'

test('产品端只包含安全检测与健康评价，海关公开数据独立导航', () => {
  const product = NAV.find((item) => item.id === 'product')
  const customs = NAV.find((item) => item.id === 'customs')

  assert.deepEqual(product.children.map((item) => item.id), ['screen', 'eval'])
  assert.equal(customs.href, '#/customs')
  assert.notEqual(customs.external, true)
  assert.match(renderRegulatoryRisk(), /href="https:\/\/online\.customs\.gov\.cn\/"/)
  assert.match(renderRegulatoryRisk(), /网络不可用时继续使用最近一次本地核验记录/)
  assert.match(renderRegulatoryRisk(), /海关中心政务公开数据平台/)
  assert.match(renderRegulatoryRisk(), /本地保留/)
})
