import { getVerdict } from '../store.js'
import { residueClear, lowInflammation, humanHeadline, humanWhy } from '../lib/verdict.js'
import { val } from '../bind-fields.js'
import { renderNextBar, bindJourneyActions } from '../components/journey-ui.js'
import { ensureReport } from '../lib/actions.js'
import { armButton } from '../lib/busy.js'

export const meta = { id: 'report', title: '检测报告' }

/**
 * @param {object} state
 * @returns {string}
 */
export function render(state) {
  const v = getVerdict()
  if (!state.report.generated) {
    return `
      <div class="page-head">
        <h2>检测报告</h2>
      </div>
      ${renderNextBar('reportEmpty')}
      <div class="card empty">尚未生成正式报告。点上面即可按当前批次生成 A4 证明。</div>
    `
  }
  const f = state.farm
  const s = state.screen
  const e = state.eval
  const residueLine = residueClear(state) ? '未检出 / 低于方法检出限' : '见定量结果'
  const inflamLine = lowInflammation(state)
    ? '血清促炎因子低于常规有抗对照，肠道菌群多样性优于对照。'
    : '血清促炎因子尚未低于对照阈值，炎症评价未过关。'
  const close = v.pass
    ? '符合「替抗蓟化」减抗鸡肉内控要求，合格准予上市。'
    : '尚未达到出证条件，请复核后再签发。'
  return `
    <div class="page-head no-print">
      <h2>检测报告</h2>
    </div>
    ${renderNextBar('report', `
      <button type="button" class="btn line" data-action="regen">按当前数据重出</button>
      <button type="button" class="btn line" data-action="print">打印 / 另存 PDF</button>
    `)}
    <div class="report-wrap">
      <article class="report-sheet">
        <div class="report-seal ${v.pass ? '' : 'hold'}"><span>${v.pass ? '检验检测<br>专用章' : '待复核'}</span></div>
        <header class="report-head">
          <div>
            <div class="report-org">「替抗蓟化」食品安全创新团队</div>
            <h2>替抗肉鸡产品质量检测报告</h2>
            <div class="report-sub">氟苯尼考残留 · 血清炎症因子评价 · 综合结论</div>
          </div>
          <div class="report-meta">
            编号 ${val(state.report.no)}<br>
            批次 ${val(state.batchId)}<br>
            签发 ${val(state.report.generatedAt)}
          </div>
        </header>
        <div class="report-block">
          <h3>一、样品信息</h3>
          <table class="report-table">
            <tr><th>产品</th><td>${val(state.productName)}</td><th>鸡群</th><td>${val(f.flockId)}</td></tr>
            <tr><th>基地</th><td colspan="3">${val(f.name)}（${val(f.partners)}）</td></tr>
            <tr><th>地址</th><td>${val(f.location)}</td><th>出栏计划</th><td>${val(f.plannedSlaughter)} · ${val(f.count)} 羽</td></tr>
            <tr><th>替抗添加</th><td>${val(f.additive)} ${val(f.dose)}</td><th>样品</th><td>${val(s.sampleId)} ${val(s.samplePart)}</td></tr>
          </table>
        </div>
        <div class="report-block">
          <h3>二、快速筛查（MDSPE + 胶体金）</h3>
          <table class="report-table">
            <tr><th>方法</th><td colspan="3">${val(s.method)}</td></tr>
            <tr><th>前处理</th><td>${val(s.mdspeMin)} 分钟</td><th>出结果</th><td>${val(s.goldMin)} 分钟</td></tr>
            <tr><th>靶标</th><td>${val(s.target)}</td><th>定性</th><td>${val(s.qualitative)} / ${val(s.result)}</td></tr>
            <tr><th>质控</th><td colspan="3">${val(s.qcLine)}。${val(s.lodNote)}</td></tr>
            <tr><th>操作</th><td colspan="3">${val(s.operator)} ${val(s.sampleDate)}</td></tr>
          </table>
        </div>
        <div class="report-block">
          <h3>三、HPLC定量氟苯尼考残留</h3>
          <table class="report-table">
            <tr><th>仪器</th><td>${val(e.instrument)}</td><th>标准曲线</th><td>R² = ${val(e.curveR)}（要求 ≥0.998）</td></tr>
            <tr><th>检出限</th><td>${val(e.lod)} μg/kg</td><th>定量结果</th><td>${val(e.valueText)}${e.valueNum !== '' ? `（${e.valueNum} ${e.unit}）` : ''}</td></tr>
            <tr><th>操作</th><td colspan="3">${val(e.operator)} ${val(e.testDate)}</td></tr>
          </table>
        </div>
        <div class="report-block">
          <h3>四、血清炎症因子评价</h3>
          <table class="report-table">
            <tr><th>IL-1β</th><td>${val(e.IL1b)} pg/mL（对照 ${val(e.IL1bCtrl)}）</td><th>IL-6</th><td>${val(e.IL6)} pg/mL（对照 ${val(e.IL6Ctrl)}）</td></tr>
            <tr><th>TNF-α</th><td>${val(e.TNFa)} pg/mL（对照 ${val(e.TNFaCtrl)}）</td><th>CRP</th><td>${val(e.CRP)} mg/L（对照 ${val(e.CRPCtrl)}）</td></tr>
            <tr><th>肠道菌群</th><td colspan="3">Shannon ${val(e.shannon)} / 对照 ${val(e.shannonCtrl)}；乳酸菌 ${e.lactoChange > 0 ? '↑' : ''}${val(e.lactoChange)}%，大肠杆菌 ${val(e.ecoliChange)}%</td></tr>
            <tr><th>对照说明</th><td colspan="3">队内对照测定（同期常规日粮组）</td></tr>
          </table>
        </div>
        <div class="report-block">
          <h3>五、综合结论</h3>
          <p class="report-conclusion">
            ${humanWhy(state, v)}
            本批次鸡肉氟苯尼考${residueLine}；${inflamLine}
            综合判定：<strong>${humanHeadline(v)}</strong>（${v.label}）。
            ${close}
          </p>
        </div>
        <footer class="report-foot">
          <div>签发单位：${val(state.team)}<br>方法依据：企业标准（申报中）· 省级生物标志物定量检测工程技术中心</div>
          <div class="report-foot-right">本报告与批次档案、安全检测原始记录一并归档<br>打印请用 A4 ${new Date().getFullYear()}</div>
        </footer>
      </article>
    </div>
  `
}

/**
 * @param {Element} root
 * @param {object} state
 */
export function bind(root, state) {
  bindJourneyActions(root, state)
  armButton(root.querySelector('[data-action="regen"]'), () => ensureReport(state, true))
  const p = root.querySelector('[data-action="print"]')
  if (p) p.addEventListener('click', () => window.print())
}
