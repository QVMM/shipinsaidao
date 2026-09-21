import { renderNextBar } from '../components/journey-ui.js'
import { inflamStatus, noFeedAntibiotic, screenStatus } from '../lib/verdict.js'

export const meta = { id: 'customs', title: '海关中心政务公开数据平台' }

export function render(state = {}) {
  const farmOk = noFeedAntibiotic(state)
  const screening = screenStatus(state)
  const evaluation = inflamStatus(state)
  const reportOk = !!(state.report?.generated && state.report?.no)
  const traceOk = !!(state.trace?.generated && state.trace?.verifyId)
  const proofOk = reportOk && traceOk
  const evidenceSteps = [
    {
      href: '#/farm',
      title: '养殖记录',
      detail: farmOk ? '饲用抗生素未使用' : '用药记录待复核',
      state: farmOk ? '已核验' : '待复核',
      tone: farmOk ? 'ok' : 'hold',
    },
    {
      href: '#/screen',
      title: '安全检测',
      detail: screening === 'clear' ? '氟苯尼考未检出' : (screening === 'fail' ? '检测结果异常，需复核' : '检测结果待录入'),
      state: screening === 'clear' ? '已通过' : (screening === 'fail' ? '异常' : '待检测'),
      tone: screening === 'clear' ? 'ok' : (screening === 'fail' ? 'bad' : 'hold'),
    },
    {
      href: '#/eval',
      title: '健康评价',
      detail: evaluation === 'clear' ? '炎症指标低于对照' : (evaluation === 'fail' ? '炎症指标未达标' : '健康指标待录入'),
      state: evaluation === 'clear' ? '已通过' : (evaluation === 'fail' ? '异常' : '待评价'),
      tone: evaluation === 'clear' ? 'ok' : (evaluation === 'fail' ? 'bad' : 'hold'),
    },
    {
      href: proofOk ? '#/qr' : '#/report',
      title: '报告与追溯',
      detail: proofOk
        ? `${state.report.no} · ${state.trace.verifyId}`
        : (reportOk ? `${state.report.no} · 追溯码待生成` : '检测报告与追溯码待生成'),
      state: proofOk ? '已出证' : (reportOk ? '待出码' : '待出证'),
      tone: proofOk ? 'ok' : 'hold',
    },
  ]
  const verifiedCount = evidenceSteps.filter((item) => item.tone === 'ok').length

  return `
    <div class="page-head">
      <div>
        <p class="eyebrow">CUSTOMS PUBLIC DATA</p>
        <h2>海关中心政务公开数据平台</h2>
      </div>
      <div class="page-head-actions">
        <a class="btn" href="#/stage">返回指挥舱</a>
        <a class="btn gold" href="https://online.customs.gov.cn/" target="_blank" rel="noopener noreferrer">访问海关官方平台 ↗</a>
      </div>
    </div>
    ${renderNextBar('eval')}
    <div class="card story-lead">
      <strong>公开风险信息驱动检测，批次原始证据形成结论</strong>
      联网时可访问 online.customs.gov.cn 核对公开信息，本地保留最近一次核验数据；网络波动不影响已载入风险排查与批次证据核验。
    </div>
    <div class="health-board mt-14 customs-risk-board">
      <section class="card customs-risk-card">
        <div class="customs-risk-head">
          <div>
            <p class="qr-kicker">实验前风险预警</p>
            <h3>出口鸡肉氟苯尼考残留风险</h3>
          </div>
          <span class="status-badge pending">已进入排查</span>
        </div>
        <p class="sub">某海关中心拦截一批出口鸡肉，兽药残留氟苯尼考超标，请对我基地鸡肉进行风险排查。</p>
        <dl class="customs-risk-facts">
          <div><dt>公开数据来源</dt><dd><a href="https://online.customs.gov.cn/" target="_blank" rel="noopener noreferrer">online.customs.gov.cn ↗</a></dd></div>
          <div><dt>风险对象</dt><dd>出口鸡肉</dd></div>
          <div><dt>重点指标</dt><dd>氟苯尼考兽药残留</dd></div>
          <div><dt>处置方式</dt><dd>联动焦点批次安全检测</dd></div>
        </dl>
      </section>
      <section class="card customs-strategy-card">
        <p class="qr-kicker">数据接入策略</p>
        <h3>在线更新，本地保留</h3>
        <p class="sub">比赛现场优先读取已审核的公开信息；联网条件具备时更新风险数据，网络不可用时继续使用最近一次本地核验记录。</p>
        <ul class="plain-facts">
          <li class="ok">不依赖现场网络完成风险排查</li>
          <li class="ok">不展示未经核验的实时信息</li>
          <li class="ok">不以风险信息替代批次检测结论</li>
        </ul>
      </section>
      <section class="card customs-evidence-card">
        <div class="customs-evidence-head">
          <div>
            <p class="qr-kicker">证据闭环</p>
            <h3>风险触发排查，批次证据决定放行</h3>
          </div>
          <span class="customs-evidence-summary is-${verifiedCount === evidenceSteps.length ? 'ok' : 'hold'}">${verifiedCount}/4 已核验</span>
        </div>
        <p class="sub customs-evidence-intro">每项结论都能回到当前批次原始记录，点击节点可直接复核。</p>
        <ol class="customs-evidence-chain" aria-label="当前批次证据核验链路">
          ${evidenceSteps.map((item, index) => `
            <li class="customs-evidence-step is-${item.tone}">
              <a href="${item.href}" aria-label="打开${item.title}：${esc(item.detail)}">
                <span class="customs-evidence-index" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
                <span class="customs-evidence-copy">
                  <b class="customs-evidence-step-title">${item.title}</b>
                  <small>${esc(item.detail)}</small>
                </span>
                <span class="customs-evidence-state">${item.state}</span>
                <span class="customs-evidence-arrow" aria-hidden="true">→</span>
              </a>
            </li>
          `).join('')}
        </ol>
      </section>
    </div>
  `
}

export function bind() {}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
