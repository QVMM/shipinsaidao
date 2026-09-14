/** DJTK智控助手：演示话术三段（开头风险 → 中间判定 → 升华收束）。 */

export const CUSTOMS_URL = 'http://stats.customs.gov.cn/'

/** @typedef {'open' | 'mid' | 'end'} DemoAct */

export const DEMO_ACTS = /** @type {const} */ (['open', 'mid', 'end'])

export const DEMO_SCRIPT = {
  open: {
    id: 'open',
    step: '开头',
    chip: '风险排查 · 订单缺口',
    mark: '险',
    tone: 'warn',
    engineer: {
      who: '4号 · 质量工程师',
      say: '我是某出口鸡肉企业的质量工程师，我联动自主开发的大蓟替抗智控平台，对近期我国出口鸡肉安全进行风险排查。请DJTK智控助手结合大数据平台进行安全风险排查。',
    },
    assistant: {
      who: 'DJTK智控助手',
      say: '对近一个月出口鸡肉安全信息搜集分析，发现某海关中心查验多批次出口鸡肉氟苯尼考兽药残留超标，相关产品依法退市，造成约 10 万吨订单缺口。',
      note: '确定真实产业场景，引出市场缺口任务，直观展现系统的全域数据研判能力。',
    },
    customs: true,
    cta: '开始风险排查',
    href: '#/screen',
    nextLabel: '下一段 · 结果判定',
  },
  mid: {
    id: 'mid',
    step: '中间',
    chip: '结果判定 · 全部合格',
    mark: '判',
    tone: 'ok',
    engineer: {
      who: '4号 · 质量工程师',
      say: '质检结果已出，请DJTK智控助手结合实时数据进行样品结果判定。',
    },
    assistant: {
      who: 'DJTK智控助手',
      say: '已完成结果审核，并对标高品质鸡肉三维评价体系做出判定，大蓟替抗鸡肉抽检样品全部合格。',
      note: '三维：安全残留 · 健康炎症 · 品质指标，与指挥舱证据墙一致。',
    },
    customs: false,
    cta: '查看健康评价',
    href: '#/eval',
    nextLabel: '下一段 · 升华收束',
  },
  end: {
    id: 'end',
    step: '升华',
    chip: '技能展示完成',
    mark: '谢',
    tone: 'warm',
    engineer: {
      who: '4号 · 质量工程师',
      say: '大蓟替抗 高品质鸡肉解决方案 技能展示完成。',
    },
    assistant: {
      who: 'DJTK智控助手',
      say: '屏幕之外可能是素未谋面的陌生人，也可能是我们的家人；感谢替抗蓟化团队，以技能筑牢安全防线，护航中国高品质鸡肉走向世界餐桌。',
      note: '',
    },
    team: [
      '给孩子一块鸡排，只留香，不留忧；',
      '给父母一碗鸡汤，只暖心，不担心；',
      '“产地中国”，成为世界放心。',
    ],
    customs: false,
    cta: '回到焦点批次',
    href: '#/dashboard',
    nextLabel: '回到开头',
  },
}

/** 兼容旧引用 */
export const CUSTOMS_ALERT = {
  source: '海关中心政务公开（演示）',
  sourceHref: CUSTOMS_URL,
  title: '出口鸡肉兽药残留预警',
  body: DEMO_SCRIPT.open.assistant.say,
  next: DEMO_SCRIPT.open.assistant.note,
  cta: DEMO_SCRIPT.open.cta,
  href: DEMO_SCRIPT.open.href,
  openCustoms: '打开海关政务公开',
}

/**
 * @param {'staff' | 'stage'} [tone]
 * @param {DemoAct} [act]
 * @returns {string}
 */
export function renderMonitorAssistant(tone = 'staff', act = 'open') {
  const s = DEMO_SCRIPT[act] || DEMO_SCRIPT.open
  if (tone === 'stage') {
    return `
    <aside class="monitor-assist is-stage is-collapsed is-${esc(s.tone)}" data-monitor-assist data-collapsed="1" data-demo-act="${esc(s.id)}">
      <button type="button" class="ma-chip" data-assist-toggle aria-expanded="false" title="展开 DJTK 智控助手">
        <i class="ma-chip-dot" aria-hidden="true"></i>
        <span class="ma-chip-label">DJTK</span>
        <span class="ma-chip-text">${esc(s.chip)}</span>
        <span class="ma-chip-hint">展开</span>
      </button>
      <div class="ma-panel" hidden data-demo-panel>
        ${renderDemoPanel(s, true)}
      </div>
    </aside>
  `
  }
  return `
    <aside class="monitor-assist is-staff is-${esc(s.tone)}" data-monitor-assist data-demo-act="${esc(s.id)}" data-demo-panel>
      ${renderDemoPanel(s, false)}
    </aside>
  `
}

/**
 * @param {typeof DEMO_SCRIPT[DemoAct]} s
 * @param {boolean} withCollapse
 */
function renderDemoPanel(s, withCollapse) {
  const team = (s.team || [])
    .map((line) => `<li>${esc(line)}</li>`)
    .join('')
  return `
    <div class="ma-panel-hd">
      <p class="ma-kicker">
        <b>DJTK智控助手</b>
        <span class="ma-step">${esc(s.step)}</span>
        ${s.customs ? `· <a class="ma-source" href="${esc(CUSTOMS_URL)}" target="_blank" rel="noopener noreferrer">海关中心政务公开（演示）</a>` : ''}
      </p>
      ${withCollapse ? '<button type="button" class="ma-collapse" data-assist-toggle aria-label="收起助手">收起</button>' : ''}
    </div>
    <div class="ma-dialog" data-demo-dialog>
      <article class="ma-bubble is-user">
        <header>${esc(s.engineer.who)}</header>
        <p>${esc(s.engineer.say)}</p>
      </article>
      <article class="ma-bubble is-bot">
        <header>
          <span class="ma-mark" aria-hidden="true"><span>${esc(s.mark)}</span></span>
          ${esc(s.assistant.who)}
        </header>
        <p>${esc(s.assistant.say)}</p>
        ${s.assistant.note ? `<p class="ma-note">${esc(s.assistant.note)}</p>` : ''}
        ${team ? `<ul class="ma-team">${team}</ul>` : ''}
      </article>
    </div>
    <div class="ma-actions ${withCollapse ? '' : 'is-staff-actions'}">
      ${s.customs ? `<a class="ma-link-out${withCollapse ? '' : ' is-staff-link'}" href="${esc(CUSTOMS_URL)}" target="_blank" rel="noopener noreferrer">打开海关政务公开</a>` : ''}
      <button type="button" class="ma-prev" data-demo-prev>上一段</button>
      <button type="button" class="ma-next-act" data-demo-next>${esc(s.nextLabel)}</button>
      <a class="ma-cta" href="${esc(s.href)}" data-assistant-cta>${esc(s.cta)}</a>
    </div>
  `
}

/**
 * @param {ParentNode} root
 * @param {{ onStart?: () => void, onAct?: (act: DemoAct) => void }} [opts]
 */
export function bindMonitorAssistant(root, opts = {}) {
  const box = /** @type {HTMLElement | null} */ (root.querySelector('[data-monitor-assist]'))
  if (!box || box.dataset.bound === '1') return
  box.dataset.bound = '1'

  /** @type {DemoAct} */
  let act = /** @type {DemoAct} */ (box.dataset.demoAct || 'open')
  const isStage = box.classList.contains('is-stage')

  const setCollapsed = (collapsed) => {
    const panel = box.querySelector('.ma-panel')
    const chip = box.querySelector('.ma-chip')
    box.classList.toggle('is-collapsed', collapsed)
    box.dataset.collapsed = collapsed ? '1' : '0'
    if (panel) panel.hidden = collapsed
    if (chip) chip.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
  }

  const paint = (next) => {
    act = next
    const s = DEMO_SCRIPT[act]
    box.dataset.demoAct = act
    box.classList.remove('is-warn', 'is-ok', 'is-warm')
    box.classList.add(`is-${s.tone}`)

    const chipText = box.querySelector('.ma-chip-text')
    if (chipText) chipText.textContent = s.chip

    if (isStage) {
      const panel = box.querySelector('[data-demo-panel]')
      if (panel) panel.innerHTML = renderDemoPanel(s, true)
    } else {
      box.innerHTML = renderDemoPanel(s, false)
    }
    opts.onAct?.(act)
  }

  box.addEventListener('click', (ev) => {
    const t = /** @type {HTMLElement} */ (ev.target)
    const toggle = t.closest?.('[data-assist-toggle]')
    if (toggle && box.contains(toggle)) {
      ev.preventDefault()
      setCollapsed(box.dataset.collapsed !== '1')
      return
    }
    const next = t.closest?.('[data-demo-next]')
    if (next && box.contains(next)) {
      ev.preventDefault()
      const i = DEMO_ACTS.indexOf(act)
      paint(DEMO_ACTS[(i + 1) % DEMO_ACTS.length])
      if (isStage) setCollapsed(false)
      return
    }
    const prev = t.closest?.('[data-demo-prev]')
    if (prev && box.contains(prev)) {
      ev.preventDefault()
      const i = DEMO_ACTS.indexOf(act)
      paint(DEMO_ACTS[(i - 1 + DEMO_ACTS.length) % DEMO_ACTS.length])
      if (isStage) setCollapsed(false)
      return
    }
    const link = t.closest?.('[data-assistant-cta]')
    if (link && box.contains(link)) {
      opts.onStart?.()
      const href = link.getAttribute('href') || ''
      if (href.startsWith('#/')) {
        ev.preventDefault()
        location.hash = href
      }
    }
  })
}

function esc(v) {
  return v == null ? '' : String(v)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
