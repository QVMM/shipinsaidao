import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { render as renderCustoms } from '../src/pages/customs.js'
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

test('法规风险页不伪装成演示或虚构通报', () => {
  assertProductionCopy('法规风险页', renderCustoms())
  assert.equal(/10\s*万吨|依法退市/.test(visibleText(renderCustoms())), false)
})

test('产品导航不出现演示性质入口', () => {
  const labels = NAV.flatMap((item) => [item.label, ...(item.children || []).map((child) => child.label)]).join(' ')
  assert.equal(forbidden.test(labels), false)
})
