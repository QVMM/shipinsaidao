/** 智能监测助手：演示对接海关中心政务公开，不下真接口。 */

export const CUSTOMS_URL = 'http://stats.customs.gov.cn/'

export const CUSTOMS_ALERT = {
  source: '海关中心政务公开（演示）',
  sourceHref: CUSTOMS_URL,
  title: '出口鸡肉兽药残留预警',
  body: '某海关中心拦截一批出口鸡肉，兽药残留氟苯尼考超标，请对我基地鸡肉进行风险排查。',
  next: '下一步：打开安全检测，看本批次氟苯尼考是否检出。',
  cta: '开始风险排查',
  href: '#/screen',
  openCustoms: '打开海关政务公开',
}

/**
 * @param {'staff' | 'stage'} [tone]
 * @returns {string}
 */
export function renderMonitorAssistant(tone = 'staff') {
  const a = CUSTOMS_ALERT
  if (tone === 'stage') {
    // 大屏默认收起，放右上角空位，避免挡标题；展开后可点外链
    return `
    <aside class="monitor-assist is-stage is-collapsed" data-monitor-assist data-collapsed="1">
      <button type="button" class="ma-chip" data-assist-toggle aria-expanded="false" title="展开智能监测助手">
        <i class="ma-chip-dot" aria-hidden="true"></i>
        <span class="ma-chip-label">预警</span>
        <span class="ma-chip-text">海关氟苯尼考超标 · 点开排查</span>
        <span class="ma-chip-hint">展开</span>
      </button>
      <div class="ma-panel" hidden>
        <div class="ma-panel-hd">
          <p class="ma-kicker">智能监测助手 · <a class="ma-source" href="${esc(a.sourceHref)}" target="_blank" rel="noopener noreferrer">${esc(a.source)}</a></p>
          <button type="button" class="ma-collapse" data-assist-toggle aria-label="收起助手">收起</button>
        </div>
        <div class="ma-panel-body">
          <div class="ma-mark" aria-hidden="true"><span>警</span></div>
          <div class="ma-copy">
            <h3>${esc(a.title)}</h3>
            <p class="ma-body">${esc(a.body)}</p>
            <p class="ma-next">${esc(a.next)}</p>
          </div>
        </div>
        <div class="ma-actions">
          <a class="ma-link-out" href="${esc(a.sourceHref)}" target="_blank" rel="noopener noreferrer">${esc(a.openCustoms)}</a>
          <a class="ma-cta" href="${a.href}" data-assistant-cta>${esc(a.cta)}</a>
        </div>
      </div>
    </aside>
  `
  }
  return `
    <aside class="monitor-assist is-staff" data-monitor-assist>
      <div class="ma-mark" aria-hidden="true">
        <span>警</span>
      </div>
      <div class="ma-copy">
        <p class="ma-kicker">智能监测助手 · <a class="ma-source" href="${esc(a.sourceHref)}" target="_blank" rel="noopener noreferrer">${esc(a.source)}</a></p>
        <h3>${esc(a.title)}</h3>
        <p class="ma-body">${esc(a.body)}</p>
        <p class="ma-next">${esc(a.next)}</p>
      </div>
      <div class="ma-actions is-staff-actions">
        <a class="ma-link-out is-staff-link" href="${esc(a.sourceHref)}" target="_blank" rel="noopener noreferrer">${esc(a.openCustoms)}</a>
        <a class="ma-cta" href="${a.href}" data-assistant-cta>${esc(a.cta)}</a>
      </div>
    </aside>
  `
}

/**
 * @param {ParentNode} root
 * @param {{ onStart?: () => void }} [opts]
 */
export function bindMonitorAssistant(root, opts = {}) {
  const box = root.querySelector('[data-monitor-assist]')
  if (!box) return

  const setCollapsed = (collapsed) => {
    const panel = box.querySelector('.ma-panel')
    const chip = box.querySelector('.ma-chip')
    box.classList.toggle('is-collapsed', collapsed)
    box.dataset.collapsed = collapsed ? '1' : '0'
    if (panel) panel.hidden = collapsed
    if (chip) chip.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
  }

  box.querySelectorAll('[data-assist-toggle]').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.preventDefault()
      setCollapsed(box.dataset.collapsed !== '1')
    })
  })

  const link = box.querySelector('[data-assistant-cta]')
  if (!link) return
  link.addEventListener('click', (ev) => {
    opts.onStart?.()
    if (link.getAttribute('href') === '#/screen') {
      ev.preventDefault()
      location.hash = '#/screen'
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
