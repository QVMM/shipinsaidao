import { bindFields, val } from '../bind-fields.js'
import { evalHuman, inflamStatus } from '../lib/verdict.js'
import { getVerdict } from '../store.js'
import { renderNextBar, bindJourneyActions } from '../components/journey-ui.js'
import { renderVerdictStrip } from '../components/verdict-strip.js'
import { isEditing, renderEditToggle, bindEditToggle } from '../components/page-edit.js'
import { canWrite } from '../auth.js'
import { bindDjtkHuman, renderDjtkHuman, unbindDjtkHuman } from '../lib/djtk-human.js'

export const meta = { id: 'eval', title: '健康评价' }

function bar(v, c) {
  const max = Math.max(v, c, 1) * 1.15
  return `<div class="bar"><em style="--bar-w:${(c / max) * 100}%"></em><i style="--bar-w:${(v / max) * 100}%"></i></div>`
}

/**
 * @param {unknown} v
 * @returns {string}
 */
function show(v) {
  const s = val(v)
  return s === '' ? '—' : s
}

const MEAT_QUALITY_METRICS = [
  { field: 'moisture', label: '水分', unit: '%', note: '水分含量' },
  { field: 'tenderness', label: '嫩度', unit: 'N', note: '以剪切力表征，数值越低，肉质越嫩' },
  { field: 'pH', label: 'pH 值', unit: '', note: '宰后 24 h' },
  { field: 'waterHolding', label: '保水性', unit: '%', note: '以系水力表征，加压法测定' },
]

const NUTRITION_METRICS = [
  { field: 'protein', label: '蛋白质', unit: 'g/100g', note: '营养组成' },
  { field: 'fat', label: '脂肪', unit: 'g/100g', note: '营养组成' },
  { field: 'minerals', label: '矿物质', unit: 'g/100g', note: '灰分计' },
  { field: 'vitamins', label: '维生素', unit: '', note: '主要维生素记录' },
  { field: 'aminoAcids', label: '氨基酸', unit: '', note: '必需氨基酸组成' },
  { field: 'fattyAcids', label: '脂肪酸', unit: '', note: '脂肪酸组成' },
  { field: 'peptides', label: '多肽', unit: '', note: '活性肽检测' },
]

const QUALITY_METRICS = [...MEAT_QUALITY_METRICS, ...NUTRITION_METRICS]

function qualityTiles(metrics, e) {
  return metrics.map((metric) => `
    <article class="quality-tile">
      <h4>${metric.label}</h4>
      <p><b>${show(e[metric.field])}</b>${metric.unit ? `<small>${metric.unit}</small>` : ''}</p>
      <span>${metric.note}</span>
    </article>
  `).join('')
}

/**
 * @param {object} e
 * @param {{ editing?: boolean }} [options]
 */
export function renderQualityBlock(e = {}, { editing = false } = {}) {
  if (editing) {
    return `
      <section class="health-block health-quality">
        <h3>肉质品质指标</h3>
        <p class="sub">录入肉质核心指标与营养组成检测结果。</p>
        <div class="form two">
          ${QUALITY_METRICS.map((metric) => `
            <div class="field">
              <label>${metric.label}${metric.unit ? `（${metric.unit}）` : ''}</label>
              <input ${MEAT_QUALITY_METRICS.includes(metric) ? 'type="number" step="any" inputmode="decimal"' : 'type="text"'} data-field="eval.${metric.field}" value="${val(e[metric.field])}">
            </div>
          `).join('')}
        </div>
      </section>
    `
  }
  const hasQuality = QUALITY_METRICS.some((metric) => e[metric.field] !== '' && e[metric.field] != null)
  return `
    <section class="health-block health-quality">
      <h3>肉质品质指标</h3>
      ${hasQuality ? `
      <h4 class="quality-group-title">肉质核心指标</h4>
      <div class="quality-grid">
        ${qualityTiles(MEAT_QUALITY_METRICS, e)}
      </div>
      <h4 class="quality-group-title is-nutrition">营养品质指标</h4>
      <div class="quality-grid quality-grid-nutrition">
        ${qualityTiles(NUTRITION_METRICS, e)}
      </div>
      <p class="quality-note">以上为当前批次实测值，与炎症、菌群结果共同构成三维评价证据，不单独作为放行结论。</p>
      ` : `<div class="card inflam-empty">
        <p>当前批次尚未录入品质检测结果。</p>
        <span class="sub">录入检测数据后，此处将显示对应指标与单位。</span>
      </div>`}
    </section>
  `
}

/**
 * @param {object} state
 * @returns {string}
 */
export function render(state) {
  const e = state.eval
  const v = getVerdict()
  const editing = canWrite('eval') && isEditing('eval', state.batchId)
  const rows = [
    ['IL-1β', e.IL1b, e.IL1bCtrl, 'pg/mL', 'IL1b', 'IL1bCtrl'],
    ['IL-6', e.IL6, e.IL6Ctrl, 'pg/mL', 'IL6', 'IL6Ctrl'],
    ['TNF-α', e.TNFa, e.TNFaCtrl, 'pg/mL', 'TNFa', 'TNFaCtrl'],
    ['CRP', e.CRP, e.CRPCtrl, 'mg/L', 'CRP', 'CRPCtrl'],
  ]
  const pending = inflamStatus(state) === 'pending'
  return `
    <div class="page-head">
      <h2>健康评价</h2>
      ${renderEditToggle('eval', 'eval', state.batchId)}
    </div>
    ${renderDjtkHuman({ compact: true })}
    ${renderVerdictStrip(state)}
    ${renderNextBar('eval')}
    <div class="evidence-page${editing ? ' is-editing' : ''}" data-evidence-page>
      <div data-evidence-view>
        <div class="card story-lead">
          <strong>${evalHuman(state, v)}</strong>
          左栏看炎症，右栏上看菌群，右栏下看肉质。浅色对照 / 深色本批次 / 深色更短=炎症更低。
        </div>
        <div class="health-board">
          <section class="health-col health-inflam">
            <h3>炎症对照</h3>
            ${pending ? `
            <div class="card inflam-empty">
              <p>尚未评价</p>
            </div>
            ` : `
            <div class="inflam-grid">
              ${rows.map(([name, valn, ctrl, unit]) => `
                <article class="inflam-tile">
                  <h3>${name}</h3>
                  <div class="inflam-nums">
                    <b>${show(valn)}</b>
                    <span>本批次 ${unit}</span>
                  </div>
                  <div class="inflam-nums">
                    <span>对照 ${show(ctrl)} ${unit}</span>
                  </div>
                  ${bar(Number(valn), Number(ctrl))}
                </article>
              `).join('')}
            </div>
            <p class="inflam-legend">浅色对照 / 深色本批次 / 深色更短=炎症更低</p>
            `}
          </section>
          <div class="health-col health-side">
            <section class="health-block health-flora">
              <h3>肠道菌群</h3>
              <div class="flora-grid">
                <article class="flora-tile">
                  <h3>Shannon</h3>
                  <p><b>${show(e.shannon)}</b> 本批次</p>
                  <p>对照 ${show(e.shannonCtrl)}</p>
                </article>
                <article class="flora-tile">
                  <h3>乳酸菌</h3>
                  <p><b>${show(e.lactoChange)}</b>%</p>
                  <p>相对对照变化</p>
                </article>
                <article class="flora-tile">
                  <h3>大肠杆菌</h3>
                  <p><b>${show(e.ecoliChange)}</b>%</p>
                  <p>相对对照变化</p>
                </article>
              </div>
            </section>
            ${renderQualityBlock(e)}
          </div>
        </div>
      </div>
      <div data-edit-view>
        <div class="health-board">
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
          <div class="health-col">
            <div class="card">
              <h3>肠道菌群（第三维，可选）</h3>
              <div class="form two">
                <div class="field"><label>Shannon 本批次</label><input data-field="eval.shannon" value="${val(e.shannon)}"></div>
                <div class="field"><label>Shannon 对照</label><input data-field="eval.shannonCtrl" value="${val(e.shannonCtrl)}"></div>
                <div class="field"><label>乳酸菌变化 %</label><input data-field="eval.lactoChange" value="${val(e.lactoChange)}"></div>
                <div class="field"><label>大肠杆菌变化 %</label><input data-field="eval.ecoliChange" value="${val(e.ecoliChange)}"></div>
              </div>
            </div>
            ${renderQualityBlock(e, { editing: true })}
          </div>
        </div>
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
  bindEditToggle(root, 'eval', 'eval', state.batchId)
  bindJourneyActions(root, state)
  bindDjtkHuman(root, { compact: true, batchId: state.batchId })
}

export function unbind() {
  unbindDjtkHuman()
}
