import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/* global document, getComputedStyle */

const forbiddenCopy = /演示|非真实|\bDemo\b/i

async function login(page) {
  await page.goto('/#/dashboard')
  if (await page.getByLabel('用户名').isVisible().catch(() => false)) {
    await page.getByLabel('用户名').fill('guanli')
    await page.getByLabel('密码').fill('Demo#2026')
    await page.getByRole('button', { name: '进入' }).click()
    await expect(page).toHaveURL(/#\/batches/)
  } else {
    await page.goto('/#/dashboard')
  }
  await expect(page.locator('.app-shell')).toBeVisible()
  if (page.url().includes('#/batches')) {
    await page.getByRole('button', { name: '打开', exact: true }).first().click()
    await expect(page).toHaveURL(/#\/dashboard/)
  }
}

function collectPageErrors(page) {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  return errors
}

test('数据大屏符合正式产品文案与稳定布局约束', async ({ page }) => {
  const errors = collectPageErrors(page)
  await page.goto('/#/stage')
  await expect(page.locator('.wall')).toBeVisible()

  const bodyText = await page.locator('body').innerText()
  expect(bodyText).not.toMatch(forbiddenCopy)
  await expect(page.locator('.djtk-human.is-embedded')).toHaveCount(1)
  await expect(page.locator('.monitor-assist')).toHaveCount(0)

  const queue = page.locator('[data-queue]')
  const before = await queue.evaluate((node) => getComputedStyle(node).transform)
  await page.waitForTimeout(2300)
  const after = await queue.evaluate((node) => getComputedStyle(node).transform)
  expect(after).toBe(before)

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  expect(errors).toEqual([])
})

test('新版与经典可视化共用同一焦点批次并可互相切换', async ({ page }) => {
  await page.goto('/#/stage')
  await expect(page.locator('.wall')).toBeVisible()
  await expect(page.locator('.wall')).not.toHaveClass(/is-legacy/)
  await expect(page.getByRole('link', { name: '经典可视化' })).toBeVisible()
  const currentBatch = await page.locator('[data-callout]').innerText()
  expect(currentBatch).toContain('蓟化-2026-0812')

  await page.getByRole('link', { name: '经典可视化' }).click()
  await expect(page).toHaveURL(/view=classic.*#\/stage/)
  await expect(page.locator('.wall')).toHaveClass(/is-legacy/)
  await expect(page.getByRole('link', { name: '新版指挥舱' })).toBeVisible()
  await expect(page.locator('.djtk-human.is-stage:not(.is-embedded)')).toHaveCount(1)
  await expect(page.locator('.stage-evidence-grid')).toHaveCount(0)
  await expect(page.locator('[data-callout]')).toContainText('蓟化-2026-0812')

  const bodyText = await page.locator('body').innerText()
  expect(bodyText).not.toMatch(forbiddenCopy)
})

test('经典可视化焦点判定区紧凑呈现且不留下大块空白', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 829 })
  await page.goto('/?view=classic#/stage')
  await expect(page.locator('.wall.is-legacy')).toBeVisible()

  const callout = await page.locator('.conveyor-box .callout').boundingBox()
  const verdict = await page.locator('.conveyor-box .co-verdict').boundingBox()
  expect(callout).not.toBeNull()
  expect(verdict).not.toBeNull()
  expect(callout.height).toBeLessThanOrEqual(130)
  expect(verdict.height).toBeLessThanOrEqual(90)
})

test('短宽屏完整展示底部证据卡片', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 829 })
  await page.goto('/#/stage')
  await expect(page.locator('.wall')).toBeVisible()

  const cards = page.locator('.stage-evidence-grid > .dv-box')
  await expect(cards).toHaveCount(3)

  const layout = await cards.evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect()
    return {
      bottom: rect.bottom,
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight,
    }
  }))

  for (const card of layout) {
    expect(card.bottom).toBeLessThanOrEqual(821)
    expect(card.scrollHeight - card.clientHeight).toBeLessThanOrEqual(1)
  }

  const regions = await page.evaluate(() => {
    const measure = (selector) => {
      const node = document.querySelector(selector)
      const rect = node.getBoundingClientRect()
      return {
        height: rect.height,
        overflow: node.scrollHeight - node.clientHeight,
      }
    }
    return {
      hero: measure('.conveyor-box'),
      path: measure('.path-box'),
      evidence: measure('.stage-evidence-grid'),
      spot: measure('.spot-box'),
      house: measure('.env-strip'),
    }
  })

  expect(regions.hero.height).toBeGreaterThanOrEqual(250)
  expect(regions.hero.height).toBeLessThanOrEqual(285)
  expect(regions.path.height).toBeGreaterThanOrEqual(190)
  expect(regions.evidence.height).toBeGreaterThanOrEqual(225)
  expect(regions.evidence.height).toBeLessThanOrEqual(250)
  expect(regions.spot.overflow).toBeLessThanOrEqual(1)
  expect(regions.house.overflow).toBeLessThanOrEqual(1)

  const assistantLayout = await page.evaluate(() => {
    const panel = document.querySelector('.djtk-human.is-embedded .djtk-panel')
    const form = document.querySelector('.djtk-human.is-embedded .djtk-form')
    const status = document.querySelector('.djtk-human.is-embedded .djtk-status')
    status.hidden = false
    status.textContent = '本地语音播报中…'
    const panelRect = panel.getBoundingClientRect()
    const formRect = form.getBoundingClientRect()
    const statusRect = status.getBoundingClientRect()
    return {
      panelBottom: panelRect.bottom,
      panelOverflow: panel.scrollHeight - panel.clientHeight,
      formTop: formRect.top,
      formBottom: formRect.bottom,
      statusBottom: statusRect.bottom,
    }
  })

  expect(assistantLayout.panelBottom).toBeLessThanOrEqual(821)
  expect(assistantLayout.panelOverflow, JSON.stringify(assistantLayout)).toBeLessThanOrEqual(1)
  expect(assistantLayout.formTop).toBeGreaterThan(0)
  expect(assistantLayout.formBottom).toBeLessThanOrEqual(821)
  expect(assistantLayout.statusBottom).toBeLessThanOrEqual(821)

  const processLayout = await page.evaluate(() => {
    const measure = (selector) => {
      const node = document.querySelector(selector)
      const rect = node.getBoundingClientRect()
      return {
        top: rect.top,
        bottom: rect.bottom,
        overflow: node.scrollHeight - node.clientHeight,
      }
    }
    return {
      dock: measure('.lab-dock'),
      bay: measure('.lab-bay'),
      call: measure('.lab-call'),
      assay: measure('.lab-assay'),
      conditions: measure('.lab-conds'),
    }
  })

  expect(processLayout.dock.overflow).toBeLessThanOrEqual(1)
  expect(processLayout.bay.overflow).toBeLessThanOrEqual(1)
  expect(processLayout.call.bottom).toBeLessThanOrEqual(processLayout.assay.top + 1)
  expect(processLayout.conditions.bottom).toBeLessThanOrEqual(processLayout.dock.bottom + 1)
})

test('AI 研判使用真实批次证据并可清空会话', async ({ page }) => {
  let ttsRequests = 0
  page.on('request', (request) => {
    if (request.url().includes('/api/djtk/tts')) ttsRequests += 1
  })
  await page.goto('/#/stage')
  await page.locator('[data-assess]').click()
  await expect(page.locator('.djtk-human.is-embedded .djtk-bubble.is-bot')).toBeVisible()
  const answer = await page.locator('.djtk-human.is-embedded .djtk-bubble.is-bot').last().innerText()
  expect(answer).not.toMatch(forbiddenCopy)
  expect(answer).toMatch(/批次|检测|筛查|报告|证据/)
  await page.waitForTimeout(100)
  expect(ttsRequests).toBe(0)

  await page.getByRole('button', { name: '新建会话' }).click()
  await expect(page.locator('.djtk-human.is-embedded .djtk-bubble')).toHaveCount(0)
  await expect(page.locator('.djtk-embedded-empty')).toBeVisible()
})

test('现场话术由助手按角色输出且不朗读 4 号台词', async ({ page }) => {
  await page.goto('/#/stage')
  await page.getByRole('button', { name: '全屏研判' }).click()
  const cabin = page.getByRole('dialog', { name: 'DJTK 全屏指挥舱' })
  await cabin.getByRole('button', { name: '样品结果判定' }).click()
  const answer = cabin.locator('.djtk-bubble.is-bot').last()
  await expect(answer).toContainText(/高品质鸡肉三维评价体系|尚未达到出证条件/)
  await expect(answer).not.toContainText('4 号')
})

test('健康评价展示水分、嫩度、pH 与保水性实测指标', async ({ page }) => {
  await login(page)
  await page.goto('/#/eval')
  const quality = page.locator('[data-evidence-view] .health-quality')
  await expect(quality).toBeVisible()
  for (const label of ['水分', '嫩度', 'pH 值', '保水性']) {
    await expect(quality.getByText(label, { exact: true })).toBeVisible()
  }
  await expect(quality).toContainText('73.8')
  await expect(quality).toContainText('24.6')
  await expect(quality).toContainText('5.78')
  await expect(quality).toContainText('79.2')
})

test('AI 助手说话口型只在嘴唇区域柔和切换', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/#/stage')
  const assistant = page.locator('.djtk-human.is-embedded')
  const speakingFrame = assistant.locator('.djtk-face-img.is-open')

  await expect(speakingFrame).toHaveAttribute('src', '/djtk-avatar-speak-v2.png')
  const closedFrame = assistant.locator('.djtk-face-img.is-closed')

  await assistant.evaluate((node) => {
    node.classList.add('is-speaking', 'is-mouth-open')
  })
  await page.waitForTimeout(250)

  const style = await speakingFrame.evaluate((node) => {
    const computed = getComputedStyle(node)
    return {
      mask: computed.maskImage || computed.webkitMaskImage,
      opacity: Number(computed.opacity),
      transitionDuration: computed.transitionDuration,
    }
  })
  expect(style.mask).toContain('radial-gradient')
  expect(style.opacity).toBeGreaterThanOrEqual(0.85)
  expect(style.opacity).toBeLessThanOrEqual(0.95)
  expect(style.transitionDuration).toBe('0.11s')

  await assistant.evaluate((node) => {
    node.classList.remove('is-mouth-open')
  })
  await page.waitForTimeout(250)
  expect(Number(await speakingFrame.evaluate((node) => getComputedStyle(node).opacity))).toBe(0)
  expect(await closedFrame.evaluate((node) => getComputedStyle(node).transform)).toBe('none')
})

test('全屏研判舱可打开、关闭且不包含虚构叙事', async ({ page }) => {
  await page.goto('/#/stage')
  await page.getByRole('button', { name: '全屏研判' }).click()
  const cabin = page.locator('.djtk-cabin')
  await expect(cabin).toBeVisible()
  expect(await cabin.innerText()).not.toMatch(forbiddenCopy)
  await page.getByRole('button', { name: '退出' }).click()
  await expect(cabin).toBeHidden()
})

test('工作人员页面只有一套 AI 助手并清除非正式文案', async ({ page }) => {
  await login(page)
  for (const route of ['dashboard', 'farm', 'screen', 'eval', 'customs', 'report', 'qr', 'consumer']) {
    await page.goto(`/#/${route}`)
    await expect(page.locator('#page')).toBeVisible()
    expect(await page.locator('body').innerText()).not.toMatch(forbiddenCopy)
  }
  await page.goto('/#/eval')
  await expect(page.locator('.monitor-assist')).toHaveCount(0)
  await expect(page.locator('.djtk-human.is-compact')).toHaveCount(1)
})

test('关键页面没有 critical 级可访问性问题', async ({ page }) => {
  await login(page)
  for (const route of ['dashboard', 'eval']) {
    await page.goto(`/#/${route}`)
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    const critical = result.violations.filter((item) => item.impact === 'critical')
    expect(critical, `${route}: ${critical.map((item) => item.id).join(', ')}`).toEqual([])
  }
})

test('@visual 指挥舱视觉基线', async ({ page }) => {
  await page.goto('/#/stage')
  await expect(page.locator('.wall')).toBeVisible()
  await expect(page).toHaveScreenshot('stage.png', {
    animations: 'disabled',
    caret: 'hide',
    mask: [page.locator('[data-clock]'), page.locator('[data-cam-ts]')],
    maskColor: '#06231f',
    maxDiffPixelRatio: 0.015,
  })
})

test('@visual 经典可视化视觉基线', async ({ page }) => {
  await page.goto('/?view=classic#/stage')
  await expect(page.locator('.wall.is-legacy')).toBeVisible()
  await expect(page).toHaveScreenshot('stage-classic.png', {
    animations: 'disabled',
    caret: 'hide',
    mask: [page.locator('[data-clock]'), page.locator('[data-cam-ts]')],
    maskColor: '#07141a',
    maxDiffPixelRatio: 0.015,
  })
})

test('@visual 健康评价视觉基线', async ({ page }) => {
  await login(page)
  await page.goto('/#/eval')
  await expect(page.locator('.djtk-human.is-compact')).toBeVisible()
  await expect(page).toHaveScreenshot('eval.png', {
    animations: 'disabled',
    caret: 'hide',
    maxDiffPixelRatio: 0.015,
  })
})
