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
}

/**
 * @param {'staff' | 'stage'} [tone]
 * @returns {string}
 */
export function renderMonitorAssistant(tone = 'staff') {
  const a = CUSTOMS_ALERT
  return `
    <aside class="monitor-assist ${tone === 'stage' ? 'is-stage' : 'is-staff'}" data-monitor-assist>
      <div class="ma-mark" aria-hidden="true">
        <span>警</span>
      </div>
      <div class="ma-copy">
        <p class="ma-kicker">智能监测助手 · <a class="ma-source" href="${esc(a.sourceHref)}" target="_blank" rel="noopener noreferrer">${esc(a.source)}</a></p>
        <h3>${esc(a.title)}</h3>
        <p class="ma-body">${esc(a.body)}</p>
        <p class="ma-next">${esc(a.next)}</p>
      </div>
      <a class="ma-cta" href="${a.href}" data-assistant-cta>${esc(a.cta)}</a>
    </aside>
  `
}

/**
 * @param {ParentNode} root
 * @param {{ onStart?: () => void }} [opts]
 */
export function bindMonitorAssistant(root, opts = {}) {
  const link = root.querySelector('[data-assistant-cta]')
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
