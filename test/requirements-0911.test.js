import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { cloneSeed } from '../src/data.js'
import { renderInkStamp } from '../src/components/ink-stamp.js'
import { clipHouseEnvSeries } from '../src/lib/house-env.js'
import { NAV } from '../src/lib/journey.js'
import { renderQualityBlock } from '../src/pages/eval.js'

test('0911 需求：产品端只展开安全检测和健康评价', () => {
  const product = NAV.find((item) => item.id === 'product')
  assert.deepEqual(product.children.map((item) => item.label), ['安全检测', '健康评价'])
})

test('0911 需求：健康评价完整展示肉质与营养品质指标', () => {
  const html = renderQualityBlock(cloneSeed().eval)
  for (const label of ['水分', '嫩度', 'pH 值', '保水性', '蛋白质', '脂肪', '矿物质', '维生素', '氨基酸', '脂肪酸', '多肽']) {
    assert.match(html, new RegExp(label))
  }
})

test('0911 需求：鸡舍曲线只返回当前时间及以前的实测点', () => {
  const series = [{ at: '11:30', temp: 24 }, { at: '12:00', temp: 25 }, { at: '12:30', temp: 26 }]
  assert.deepEqual(clipHouseEnvSeries(series, { at: '12:00' }).map((item) => item.at), ['11:30', '12:00'])
})

test('0911 需求：合格印章使用带纹理的正式印章组件', () => {
  const html = renderInkStamp({ state: 'ok' })
  assert.match(html, /ink-stamp/)
  assert.match(html, /stamp-qualified\.png|feTurbulence/)
})

test('比赛新版大屏不显示部署口号与无需求依据的指标分析入口', () => {
  const source = readFileSync(new URL('../src/pages/stage.js', import.meta.url), 'utf8')
  assert.equal(source.includes('本地部署 · 离线运行正常'), false)
  assert.equal(source.includes('data-insights'), false)
  assert.equal(source.includes('>指标分析</button>'), false)
})
