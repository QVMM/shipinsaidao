import { bindFields, val } from '../bind-fields.js'
import { screenHuman, residueClear } from '../lib/verdict.js'
import { renderNextBar } from '../components/journey-ui.js'
import { renderLabStatus } from '../lib/lab-status.js'

export const meta = { id: 'screen', title: '安全检测' }

/**
 * @param {object} state
 * @returns {string}
 */
export function render(state) {
  const s = state.screen
  const extra = s.extra || {}
  const samples = Array.isArray(s.samples) ? s.samples : []
  const ok = residueClear(state) && s.qualitative === '阴性'
  return `
    <div class="page-head">
      <h2>安全检测</h2>
      <span class="chip ${ok ? 'ok' : (s.qualitative === '无效' ? 'warn' : 'bad')}">${ok ? '大蓟组未检出' : s.qualitative}</span>
    </div>
    ${renderNextBar('screen')}
    <div class="card story-lead">
      <strong>${screenHuman(state)}</strong>
      胶体金竞争法：T≥C 或 T 深于 C 为阴性；T 浅于 C 或不显色为阳性。市售对照用于证明氟苯尼考滥用，不计入本批次出证。
    </div>
    <div class="card">
      <h3>人机料法环测</h3>
      ${renderLabStatus()}
    </div>
    <div class="card mt-14">
      <h3>六份样品（质控 / 市售对照 / 大蓟鸡肉）</h3>
      <p class="sub">1–2 质控组阴性；3–4 市售对照阳性（氟苯尼考超标）；5–6 大蓟鸡肉全阴性。出证只看大蓟组。</p>
      <div class="table-wrap mt-10">
        <table class="table">
          <thead>
            <tr><th>编号</th><th>组别</th><th>T/C</th><th>定性</th><th>结果</th><th>说明</th></tr>
          </thead>
          <tbody>
            ${samples.map((row, i) => `
              <tr class="${/市售/.test(row.group || '') ? 'is-ctrl' : ''} ${/大蓟/.test(row.group || '') ? 'is-thistle' : ''}">
                <td><input data-sample="${i}" data-key="id" value="${val(row.id)}"></td>
                <td><input data-sample="${i}" data-key="group" value="${val(row.group)}"></td>
                <td><input data-sample="${i}" data-key="tLine" value="${val(row.tLine)}"></td>
                <td><input data-sample="${i}" data-key="qualitative" value="${val(row.qualitative)}"></td>
                <td><input data-sample="${i}" data-key="result" value="${val(row.result)}"></td>
                <td><input data-sample="${i}" data-key="note" value="${val(row.note)}"></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
    <div class="grid g-2 mt-14">
      <div class="card">
        <h3>大蓟组汇总</h3>
        <div class="form two">
          <div class="field"><label>样品编号</label><input data-field="screen.sampleId" value="${val(s.sampleId)}"></div>
          <div class="field"><label>采样时间</label><input data-field="screen.sampleDate" value="${val(s.sampleDate)}"></div>
          <div class="field span2"><label>取样部位</label><input data-field="screen.samplePart" value="${val(s.samplePart)}"></div>
          <div class="field span2"><label>方法</label><input data-field="screen.method" value="${val(s.method)}"></div>
          <div class="field"><label>前处理（分钟）</label><input data-field="screen.mdspeMin" value="${val(s.mdspeMin)}"></div>
          <div class="field"><label>出结果（分钟）</label><input data-field="screen.goldMin" value="${val(s.goldMin)}"></div>
          <div class="field"><label>查的哪种药</label><input data-field="screen.target" value="${val(s.target)}"></div>
          <div class="field"><label>操作人</label><input data-field="screen.operator" value="${val(s.operator)}"></div>
        </div>
      </div>
      <div class="card">
        <h3>筛查结果（大蓟组汇总）</h3>
        <div class="form">
          <div class="field"><label>定性</label>
            <select data-field="screen.qualitative">
              <option ${s.qualitative === '阴性' ? 'selected' : ''}>阴性</option>
              <option ${s.qualitative === '阳性' ? 'selected' : ''}>阳性</option>
              <option ${s.qualitative === '无效' ? 'selected' : ''}>无效</option>
            </select>
          </div>
          <div class="field"><label>结果表述</label><input data-field="screen.result" value="${val(s.result)}"></div>
          <div class="field"><label>质控线</label><input data-field="screen.qcLine" value="${val(s.qcLine)}"></div>
          <div class="field"><label>检出限说明</label><input data-field="screen.lodNote" value="${val(s.lodNote)}"></div>
          <div class="field"><label>备注</label><textarea data-field="screen.notes">${val(s.notes)}</textarea></div>
        </div>
      </div>
    </div>
    <div class="card mt-14">
      <h3>其它指标</h3>
      <div class="form two">
        <div class="field"><label>其它兽药残留</label><input data-field="screen.extra.otherResidues" value="${val(extra.otherResidues)}"></div>
        <div class="field"><label>重金属</label><input data-field="screen.extra.heavyMetals" value="${val(extra.heavyMetals)}"></div>
        <div class="field"><label>蛋白质</label><input data-field="screen.extra.protein" value="${val(extra.protein)}"></div>
        <div class="field"><label>氨基酸</label><input data-field="screen.extra.aminoAcids" value="${val(extra.aminoAcids)}"></div>
        <div class="field span2"><label>感官</label><input data-field="screen.extra.sensory" value="${val(extra.sensory)}"></div>
      </div>
    </div>
  `
}

/**
 * @param {Element} root
 */
export function bind(root) {
  bindFields(root)
}
