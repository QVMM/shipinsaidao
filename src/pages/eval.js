import { bindFields, val } from '../bind-fields.js'
import { getVerdict } from '../store.js'
import { evalHuman, humanHeadline } from '../lib/verdict.js'
import { renderNextBar, bindJourneyActions } from '../components/journey-ui.js'

export const meta = { id: 'eval', title: '健康评价' }

function bar(v, c) {
  const max = Math.max(v, c, 1) * 1.15
  return `<div class="bar"><em style="--bar-w:${(c / max) * 100}%"></em><i style="--bar-w:${(v / max) * 100}%"></i></div>`
}

/**
 * @param {object} state
 * @returns {string}
 */
export function render(state) {
  const e = state.eval
  const v = getVerdict()
  const rows = [
    ['IL-1β', e.IL1b, e.IL1bCtrl, 'pg/mL', 'IL1b', 'IL1bCtrl'],
    ['IL-6', e.IL6, e.IL6Ctrl, 'pg/mL', 'IL6', 'IL6Ctrl'],
    ['TNF-α', e.TNFa, e.TNFaCtrl, 'pg/mL', 'TNFa', 'TNFaCtrl'],
    ['CRP', e.CRP, e.CRPCtrl, 'mg/L', 'CRP', 'CRPCtrl'],
  ]
  return `
    <div class="page-head">
      <h2>健康评价</h2>
      <span class="chip ${v.pass ? 'ok' : 'warn'}">${humanHeadline(v)}</span>
    </div>
    ${renderNextBar('eval')}
    <div class="card story-lead">
      <strong>${evalHuman(state, v)}</strong>
      浅色为队内对照测定（同期常规日粮组），深色为本批次。深色更短表示炎症更低。
    </div>
    <div class="grid g-2">
      <div class="card">
        <h3>实验室定量（氟苯尼考）</h3>
        <div class="form two">
          <div class="field"><label>检测日期</label><input data-field="eval.testDate" value="${val(e.testDate)}"></div>
          <div class="field"><label>仪器</label><input data-field="eval.instrument" value="${val(e.instrument)}"></div>
          <div class="field"><label>标准曲线 R²</label><input data-field="eval.curveR" value="${val(e.curveR)}"></div>
          <div class="field"><label>检出限 μg/kg</label><input data-field="eval.lod" value="${val(e.lod)}"></div>
          <div class="field"><label>结果表述</label><input data-field="eval.valueText" value="${val(e.valueText)}"></div>
          <div class="field"><label>定量值（可空）</label><input data-field="eval.valueNum" value="${val(e.valueNum)}" placeholder="未检出则留空"></div>
          <div class="field span2"><label>操作人</label><input data-field="eval.operator" value="${val(e.operator)}"></div>
        </div>
        <p class="sub mt-10">方法要求 R² ≥ 0.998，检出限 ${val(e.lod)} μg/kg。当前 R² = ${val(e.curveR)}</p>
      </div>
      <div class="card">
        <h3>炎症对照 本批次 vs 常规</h3>
        <div class="bars">
          ${rows.map(([name, valn, ctrl]) => `
            <div class="bar-row"><span>${name}</span>${bar(Number(valn), Number(ctrl))}<span>${valn}</span></div>
          `).join('')}
        </div>
        <p class="sub mt-10">浅色 = 队内对照测定（同期常规日粮组），深色 = 本批次。</p>
        <div class="form two mt-14">
          ${rows.map(([name, , , , k, ck]) => `
            <div class="field"><label>${name} 本批次</label><input data-field="eval.${k}" value="${val(e[k])}"></div>
            <div class="field"><label>${name} 对照</label><input data-field="eval.${ck}" value="${val(e[ck])}"></div>
          `).join('')}
        </div>
      </div>
    </div>
    <div class="card mt-14">
      <h3>肠道菌群（第三维，可选）</h3>
      <div class="form two">
        <div class="field"><label>Shannon 本批次</label><input data-field="eval.shannon" value="${val(e.shannon)}"></div>
        <div class="field"><label>Shannon 对照</label><input data-field="eval.shannonCtrl" value="${val(e.shannonCtrl)}"></div>
        <div class="field"><label>乳酸菌变化 %</label><input data-field="eval.lactoChange" value="${val(e.lactoChange)}"></div>
        <div class="field"><label>大肠杆菌变化 %</label><input data-field="eval.ecoliChange" value="${val(e.ecoliChange)}"></div>
      </div>
    </div>
  `
}

/**
 * @param {Element} root
 * @param {object} state
 */
export function bind(root, state) {
  bindFields(root)
  bindJourneyActions(root, state)
}
