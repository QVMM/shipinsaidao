import { bindFields, val } from '../bind-fields.js'
import { evalHuman, inflamStatus } from '../lib/verdict.js'
import { getVerdict } from '../store.js'
import { renderNextBar, bindJourneyActions } from '../components/journey-ui.js'
import { renderVerdictStrip } from '../components/verdict-strip.js'
import { isEditing, renderEditToggle, bindEditToggle } from '../components/page-edit.js'
import { canWrite } from '../auth.js'
import { QUALITY_METRICS } from '../lib/quality-metrics.js'
import { bindMonitorAssistant, renderMonitorAssistant } from '../lib/monitor-assistant.js'
import { bindDjtkHuman, renderDjtkHuman } from '../lib/djtk-human.js'

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

function qualityBlock() {
  return `
    <section class="health-block health-quality">
      <h3>品质指标</h3>
      <p class="sub">本批次鸡肉实测演示值。只读。</p>
      <div class="quality-grid">
        ${QUALITY_METRICS.map((m) => `
          <article class="quality-tile">
            <h4>${m.label}</h4>
            <p><b>${m.value}</b><small>${m.unit}</small></p>
            ${m.note ? `<span>${m.note}</span>` : ''}
          </article>
        `).join('')}
      </div>
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
    ${renderMonitorAssistant('staff')}
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
            ${qualityBlock()}
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
            ${qualityBlock()}
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
  bindMonitorAssistant(root)
  bindDjtkHuman(root, { compact: true })
}
