import { bindFields, val } from '../bind-fields.js'
import { screenHuman, hplcOf, hplcClear } from '../lib/verdict.js'
import { renderNextBar } from '../components/journey-ui.js'
import { renderVerdictStrip } from '../components/verdict-strip.js'
import { isEditing, renderEditToggle, bindEditToggle } from '../components/page-edit.js'
import { canWrite } from '../auth.js'
import { renderLabStatus } from '../lib/lab-status.js'

export const meta = { id: 'screen', title: '安全检测' }

/**
 * @param {unknown} v
 * @returns {string}
 */
function show(v) {
  const s = val(v)
  return s === '' ? '—' : s
}

/**
 * 质控线人话：T深于C / T≥C 不原样上屏。
 * @param {unknown} v
 * @returns {string}
 */
function showQcLine(v) {
  const s = val(v)
  if (!s) return '—'
  if (/T深于C|T≥C|T>=C/.test(s)) return '检测线深过对照线'
  return s
}

/**
 * @param {string} group
 * @returns {'qc' | 'market' | 'thistle'}
 */
function cassetteKind(group) {
  const g = String(group || '')
  if (/市售/.test(g)) return 'market'
  if (/大蓟/.test(g)) return 'thistle'
  return 'qc'
}

/**
 * T深于C / T≥C → 更深更高；T浅于C → 更矮更淡；不显色 → 没有 T 线。
 * @param {string} tLine
 * @returns {'strong' | 'equal' | 'faint' | 'none'}
 */
function tTone(tLine) {
  const t = String(tLine || '')
  if (!t || /不显色/.test(t)) return 'none'
  if (/浅于/.test(t)) return 'faint'
  if (/深于|≥|>=/.test(t)) return 'strong'
  return 'equal'
}

/**
 * @param {object} row
 * @returns {string}
 */
function resultWord(row) {
  if (row.qualitative) return row.qualitative
  if (String(row.result || '').includes('未检出')) return '未检出'
  return row.result || '待测'
}

/**
 * @param {string} word
 * @returns {string}
 */
function wordClass(word) {
  if (word === '阴性' || word === '未检出') return 'ok'
  if (word === '阳性') return 'bad'
  if (word === '无效') return 'warn'
  return 'muted'
}

/**
 * 未读卡：无定性、无结果。
 * @param {object} row
 * @param {string} word
 * @returns {boolean}
 */
function isWaitCard(row, word) {
  return word === '待测' || (!val(row.qualitative) && !val(row.result))
}

/**
 * 卡面人话。待测不写破折号。
 * @param {object} row
 * @param {string} word
 * @param {boolean} wait
 * @returns {string}
 */
function cassetteNote(row, word, wait) {
  if (wait) return ''
  if (word === '无效') return val(row.note) || '试纸坏了'
  if (word === '阴性' || word === '未检出') return '检测线深过对照线'
  if (word === '阳性') return '检测线浅或不显'
  return val(row.note) || ''
}

/**
 * 卡面结论词，不用阴性/阳性/T/C。
 * @param {string} word
 * @param {boolean} wait
 * @returns {string}
 */
function displayWord(word, wait) {
  if (wait || word === '待测') return '还没测'
  if (word === '阴性' || word === '未检出') return '没检出'
  if (word === '阳性') return '检出药'
  if (word === '无效') return '试纸坏了'
  return word || '还没测'
}

/**
 * 胶体金卡：加样孔在窗左；检测/对照三分窗内对称。加样标签只在孔下。
 * @param {'strong' | 'equal' | 'faint' | 'none'} tone
 * @param {boolean} wait
 * @param {boolean} invalid
 * @returns {string}
 */
function lfaSvg(tone, wait, invalid) {
  const xWell = 26
  const winX = 50
  const winW = 176
  const xT = 109
  const xC = 167
  const labY = 78
  const muted = '#5c7266'
  const bandW = 2.5
  const cy = 32
  const ctrlH = 22
  const tH = tone === 'strong' ? 28 : tone === 'faint' ? 12 : 22
  const tFill = tone === 'strong' ? '#6e1616' : tone === 'faint' ? '#d4a098' : '#a33a32'
  const tOp = tone === 'faint' ? '0.7' : '1'
  const showT = !wait && tone !== 'none'
  const showC = !wait && !invalid
  const tBand = showT
    ? `<rect x="${xT - bandW / 2}" y="${cy - tH / 2}" width="${bandW}" height="${tH}" rx="1" fill="${tFill}" opacity="${tOp}"/>`
    : ''
  const cBand = showC
    ? `<rect x="${xC - bandW / 2}" y="${cy - ctrlH / 2}" width="${bandW}" height="${ctrlH}" rx="1" fill="#a33a32"/>`
    : ''
  const waitText = wait
    ? `<text x="${winX + winW / 2}" y="36" text-anchor="middle" font-size="12" fill="${muted}">还没测</text>`
    : ''
  const zoneLabs = wait
    ? ''
    : `<text x="${xT}" y="${labY}" text-anchor="middle" font-size="9" fill="${muted}">检测</text>
    <text x="${xC}" y="${labY}" text-anchor="middle" font-size="9" fill="${muted}">对照</text>`
  return `<svg class="lfa-svg" viewBox="0 0 240 86" width="100%" height="86" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <rect x="6" y="6" width="228" height="52" rx="10" fill="#f3e8cd" stroke="#d4c9ae" stroke-width="1"/>
    <circle cx="${xWell}" cy="32" r="10" fill="#efe4cc" stroke="#c9b48a" stroke-width="1.2"/>
    <circle cx="${xWell}" cy="32" r="7" fill="#2a2218"/>
    <rect x="${winX}" y="14" width="${winW}" height="36" rx="4" fill="#ead6a4" stroke="#c9b48a" stroke-width="1"/>
    ${tBand}${cBand}${waitText}
    <text x="${xWell}" y="${labY}" text-anchor="middle" font-size="9" fill="${muted}">加样</text>
    ${zoneLabs}
  </svg>`
}

/**
 * @param {object} extra
 * @returns {boolean}
 */
function extraAllEmpty(extra) {
  const e = extra || {}
  return ['otherResidues', 'heavyMetals', 'protein', 'aminoAcids', 'sensory'].every((k) => !val(e[k]))
}

function renderCassetteCard(row, group) {
  if (!row) {
    return `
      <article class="cassette is-empty ${group.kind}">
        <p class="cassette-empty">尚未备样</p>
      </article>`
  }
  const kind = cassetteKind(row.group)
  const tone = tTone(row.tLine)
  const word = resultWord(row)
  const wait = isWaitCard(row, word)
  const invalid = word === '无效'
  const shown = displayWord(word, wait)
  const mods = [kind, wait ? 'is-wait' : '', invalid ? 'is-void' : ''].filter(Boolean).join(' ')
  return `
    <article class="cassette ${mods}">
      <div class="cassette-head">
        <span class="cassette-group">${val(row.group) || group.title}</span>
        <span class="cassette-id">${val(row.id)}</span>
      </div>
      ${lfaSvg(tone, wait, invalid)}
      <p class="cassette-word ${wordClass(wait ? '待测' : word)}">${shown}</p>
      ${wait ? '' : `<p class="cassette-note">${cassetteNote(row, word, wait)}</p>`}
    </article>`
}

/**
 * @param {object[]} samples
 * @returns {string}
 */
function renderCassettes(samples) {
  const groups = [
    { kind: 'thistle', title: '大蓟鸡肉', sub: '出证看这两份', test: (g) => /大蓟/.test(g) },
    { kind: 'market', title: '市售对照', sub: '对照，不出证', test: (g) => /市售/.test(g) },
    { kind: 'qc', title: '质控', sub: '看试纸有没有坏', test: (g) => /质控/.test(g) },
  ]
  const byGroup = groups.map((g) => samples.filter((row) => g.test(row.group || '')))
  const headers = groups.map((g) => `
    <div class="cassette-board-head ${g.kind}">
      <h3>${g.title}</h3>
      <p>${g.sub}</p>
    </div>`).join('')
  const cards = [0, 1].flatMap((slot) => groups.map((g, gi) => renderCassetteCard(byGroup[gi][slot], g))).join('')
  return `
    <div class="cassette-board">
      ${headers}
      ${cards}
    </div>
  `
}

/**
 * @param {object} state
 * @returns {string}
 */
export function render(state) {
  const s = state.screen
  const extra = s.extra || {}
  const samples = Array.isArray(s.samples) ? s.samples : []
  const hplc = hplcOf(state)
  const quantOk = hplcClear(state)
  const editing = canWrite('screen') && isEditing('screen', state.batchId)
  const summaryEmpty = !val(s.sampleId) && !val(s.qualitative) && !val(s.result)
  const hplcPending = !val(hplc.valueText)
  const extraEmpty = extraAllEmpty(extra)
  return `
    <div class="page-head">
      <h2>安全检测</h2>
      ${renderEditToggle('screen', 'screen', state.batchId)}
    </div>
    ${renderVerdictStrip(state)}
    ${renderNextBar('screen')}
    <div class="evidence-page${editing ? ' is-editing' : ''}" data-evidence-page>
      <div data-evidence-view>
        <div class="card story-lead">
          <strong>${screenHuman(state)}</strong>
          <p>出证只看大蓟组两份。市售对照用来证明市面上有人用药，不计入本批。</p>
          <p class="cassette-legend">两条线都有、检测线更深 = 没检出。只有对照线 = 检出药。</p>
        </div>
        <div class="card lab-cond-card">
          <h3>检测过程</h3>
          ${renderLabStatus('dock')}
        </div>
        <div class="card mt-14">
          <h3>六份样品</h3>
          ${renderCassettes(samples)}
        </div>
        <div class="grid g-2 mt-14">
          <div class="card fact-block">
            <h3>大蓟组汇总</h3>
            ${summaryEmpty ? '<p class="fact-empty">尚未采样。读卡后这里写编号、时间和结果。</p>' : `
            <dl class="fact-grid">
              <div><dt>样品编号</dt><dd>${show(s.sampleId)}</dd></div>
              <div><dt>采样时间</dt><dd>${show(s.sampleDate)}</dd></div>
              <div><dt>方法</dt><dd>${show(s.method)}</dd></div>
              <div><dt>取样部位</dt><dd>${show(s.samplePart)}</dd></div>
              <div><dt>操作人</dt><dd>${show(s.operator)}</dd></div>
              <div><dt>查的哪种药</dt><dd>${show(s.target)}</dd></div>
            </dl>`}
          </div>
          <div class="card fact-block">
            <h3>筛查结果</h3>
            ${summaryEmpty ? '<p class="fact-empty">尚未采样。读卡后这里写编号、时间和结果。</p>' : `
            <dl class="fact-grid">
              <div><dt>定性</dt><dd>${show(s.qualitative)}</dd></div>
              <div><dt>结果</dt><dd>${show(s.result)}</dd></div>
              <div><dt>质控线</dt><dd>${showQcLine(s.qcLine)}</dd></div>
              <div><dt>检出限说明</dt><dd>${show(s.lodNote)}</dd></div>
            </dl>`}
          </div>
        </div>
        <div class="card mt-14 result-plaque ${hplcPending ? 'quiet' : (quantOk ? 'ok' : 'hold')}">
          <h3>${hplcPending ? '实验室定量' : '实验室定量（氟苯尼考）'}</h3>
          ${hplcPending ? '<p class="plaque-empty">尚未做高效液相。</p>' : `
          <p class="plaque-value">${show(hplc.valueText)}</p>
          <dl class="fact-grid">
            <div><dt>仪器</dt><dd>${show(hplc.instrument)}</dd></div>
            <div><dt>结果表述</dt><dd>${show(hplc.valueText)}</dd></div>
            <div><dt>检出限</dt><dd>${show(hplc.lod)} μg/kg</dd></div>
            <div><dt>标准曲线 R²</dt><dd>${show(hplc.curveR)}</dd></div>
            <div><dt>检测日期</dt><dd>${show(hplc.hplcDate)}</dd></div>
            <div><dt>操作人</dt><dd>${show(hplc.hplcOperator)}</dd></div>
          </dl>`}
        </div>
        ${extraEmpty ? `
        <div class="card mt-14 fact-block">
          <h3>其它指标</h3>
          <p class="fact-empty">尚未填写</p>
        </div>` : `
        <div class="card mt-14 fact-block">
          <h3>其它指标</h3>
          <dl class="fact-grid">
            <div><dt>其它兽药残留</dt><dd>${show(extra.otherResidues)}</dd></div>
            <div><dt>重金属</dt><dd>${show(extra.heavyMetals)}</dd></div>
            <div><dt>蛋白质</dt><dd>${show(extra.protein)}</dd></div>
            <div><dt>氨基酸</dt><dd>${show(extra.aminoAcids)}</dd></div>
            <div><dt>感官</dt><dd>${show(extra.sensory)}</dd></div>
          </dl>
        </div>`}
      </div>
      <div data-edit-view>
        <div class="card">
          <h3>检测条件</h3>
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
          <h3>实验室定量（氟苯尼考）</h3>
          <div class="form two">
            <div class="field"><label>检测日期</label><input data-field="screen.hplcDate" value="${val(hplc.hplcDate)}"></div>
            <div class="field"><label>仪器</label><input data-field="screen.instrument" value="${val(hplc.instrument)}"></div>
            <div class="field"><label>标准曲线 R²</label><input data-field="screen.curveR" value="${val(hplc.curveR)}"></div>
            <div class="field"><label>检出限 μg/kg</label><input data-field="screen.lod" value="${val(hplc.lod)}"></div>
            <div class="field"><label>结果表述</label><input data-field="screen.valueText" value="${val(hplc.valueText)}"></div>
            <div class="field"><label>定量值（可空）</label><input data-field="screen.valueNum" value="${val(hplc.valueNum)}" placeholder="未检出则留空"></div>
            <div class="field span2"><label>操作人</label><input data-field="screen.hplcOperator" value="${val(hplc.hplcOperator)}"></div>
          </div>
          <p class="sub mt-10">方法要求 R² ≥ 0.998，检出限 ${val(hplc.lod)} μg/kg。当前 R² = ${val(hplc.curveR)}</p>
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
      </div>
    </div>
  `
}

/**
 * @param {Element} root
 */
export function bind(root, state) {
  bindFields(root)
  bindEditToggle(root, 'screen', 'screen', state?.batchId)
}
