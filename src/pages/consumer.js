import { getVerdict } from '../store.js'
import { humanHeadline, humanWhy, threeFacts, residueClear, lowInflammation } from '../lib/verdict.js'
import { renderNextBar } from '../components/journey-ui.js'
import { val } from '../bind-fields.js'

export const meta = { id: 'consumer', title: '客户端显示' }

/**
 * @param {object} state
 * @returns {string}
 */
export function render(state, opts = {}) {
  const v = getVerdict()
  const f = state.farm
  const s = state.screen
  const e = state.eval
  const facts = threeFacts(state)
  const residueOk = residueClear(state)
  const inflamOk = lowInflammation(state)
  const conclusion = v.pass
    ? '本批次饲用抗生素未使用，氟苯尼考未检出，炎症因子优于常规对照，合格准予上市。'
    : humanWhy(state, v)
  const steps = [
    ['进苗', `${val(f.breed)} · ${val(f.count)} 羽 · ${String(f.stockDate || '').slice(0, 10)}`],
    ['饲喂', `${val(f.additive)} ${val(f.dose)}`],
    ['安全检测', residueOk ? `${val(s.target)} 未检出` : `${val(s.target)} 未过关`],
    ['健康评价', inflamOk ? `IL-6 ${val(e.IL6)} / 对照 ${val(e.IL6Ctrl)}` : '炎症因子未达标'],
  ]
  const staffChrome = opts.publicView ? '' : `
    <div class="page-head no-print">
      <h2>客户端显示</h2>
    </div>
    ${renderNextBar('consumer')}
  `
  return `
    ${staffChrome}
    <div class="phone-wrap">
      <div class="phone">
        <div class="phone-screen">
          <div class="phone-top">
            <div class="brand-mini">替抗蓟化 · 扫码可查</div>
            <h3>${humanHeadline(v)}</h3>
            <p class="phone-batch">${val(state.batchId)}</p>
          </div>
          <div class="phone-body">
            <div class="phone-card">
              <h4>产地 / 品种 / 批次</h4>
              <p class="phone-place">${val(f.location)}<br>${val(f.breed)}<br>${val(state.batchId)}</p>
            </div>
            <div class="phone-card">
              <h4>本批次要点</h4>
              <ul class="plain-facts">
                ${facts.map((item) => `<li class="${item.ok ? 'ok' : 'bad'}">${item.text}</li>`).join('')}
              </ul>
            </div>
            <div class="phone-card">
              <h4>综合结论</h4>
              <p class="sub">${conclusion}</p>
            </div>
            <div class="phone-card">
              <h4>产品过程</h4>
              <div class="tl">
                ${steps.map((row, i) => `
                  <div class="tl-item"><i></i><div><b>${row[0]}</b><div class="sub">${row[1]}</div></div></div>
                  ${i < steps.length - 1 ? '<div class="tl-line"></div>' : ''}
                `).join('')}
              </div>
            </div>
            <div class="phone-card">
              <h4>核验</h4>
              <p class="sub">批次 ${val(state.batchId)}<br>核验号 ${val(state.trace.verifyId || '待出码')} · 报告 ${val(state.report.no || '尚未生成')}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
}
