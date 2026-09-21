import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { render as renderCustoms } from '../src/pages/customs.js'
import { cloneSeed } from '../src/data.js'
import { renderDjtkHuman } from '../src/lib/djtk-human.js'
import { NAV } from '../src/lib/journey.js'

const forbidden = /演示|非真实|\bDemo\b/i

function visibleText(html) {
  return String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function assertProductionCopy(label, html) {
  const text = visibleText(html)
  assert.equal(forbidden.test(text), false, `${label} 仍含非正式产品文案：${text.match(forbidden)?.[0] || ''}`)
}

test('数据大屏不出现演示性质文案', () => {
  const source = readFileSync(new URL('../src/pages/stage.js', import.meta.url), 'utf8')
  assert.equal(forbidden.test(source), false, '数据大屏源码仍含演示性质文案或标识')
})

test('AI 助手与全屏研判舱不出现演示性质文案', () => {
  assertProductionCopy('嵌入式助手', renderDjtkHuman({ embedded: true }))
  assertProductionCopy('工作人员助手', renderDjtkHuman({ compact: true }))
})

test('风险情报页使用离线快照并避免虚构真实地点', () => {
  assertProductionCopy('法规风险页', renderCustoms())
  assert.equal(/10\s*万吨|依法退市|郑州市|上海市|北京市/.test(visibleText(renderCustoms())), false)
  assert.match(visibleText(renderCustoms()), /某海关中心/)
  assert.match(visibleText(renderCustoms()), /海关中心政务公开数据平台/)
  assert.match(visibleText(renderCustoms()), /在线更新.*本地保留|本地保留.*在线更新/)
  assert.match(renderCustoms(), /href="#\/stage"/)
  assert.match(renderCustoms(), /href="https:\/\/online\.customs\.gov\.cn\/"/)
  assert.match(renderCustoms(), /target="_blank"/)
  assert.match(renderCustoms(), /rel="noopener noreferrer"/)
})

test('海关风险页用四步核验链路呈现当前批次证据闭环', () => {
  const html = renderCustoms(cloneSeed())
  const text = visibleText(html)
  assert.match(text, /4\/4 已核验/)
  for (const label of ['养殖记录', '安全检测', '健康评价', '报告与追溯']) {
    assert.match(text, new RegExp(label))
  }
  assert.equal((html.match(/class="customs-evidence-step is-/g) || []).length, 4)
  assert.match(html, /饲用抗生素未使用/)
  assert.match(html, /氟苯尼考未检出/)
  assert.match(html, /炎症指标低于对照/)
  assert.match(html, /THJH-20260812-001/)
  assert.match(html, /TR-8F2C-0812/)
  assert.equal(html.includes('djtk-cabin-links'), false)
})

test('大屏助手明确显示海关公开数据来源与实验前风险预警', () => {
  const html = renderDjtkHuman({ embedded: true })
  const text = visibleText(html)
  assert.match(text, /海关中心政务公开数据平台/)
  assert.match(text, /实验前风险预警/)
  assert.match(text, /某海关中心拦截一批出口鸡肉/)
  assert.match(html, /href="https:\/\/online\.customs\.gov\.cn\/"/)
  assert.match(html, /target="_blank"/)
  assert.match(html, /rel="noopener noreferrer"/)
  assert.match(html, /data-customs-assess/)
})

test('三段比赛话术均有独立快捷入口且总数保持四个', () => {
  const html = renderDjtkHuman({ embedded: true })
  const labels = [...html.matchAll(/data-djtk-chip[^>]*>([^<]+)<\/button>/g)].map((match) => match[1])
  assert.deepEqual(labels, ['出口风险排查', '样品结果判定', '安全使命收束', '上市判定依据'])
  assert.match(html, /data-djtk-ask="质检结果已出，请DJTK智控助手结合实时数据进行样品结果判定。"/)
  assert.match(html, /data-djtk-ask="大蓟替抗 高品质鸡肉解决方案 技能展示完成"/)
})

test('产品导航不出现演示性质入口', () => {
  const labels = NAV.flatMap((item) => [item.label, ...(item.children || []).map((child) => child.label)]).join(' ')
  assert.equal(forbidden.test(labels), false)
})
