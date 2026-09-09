import '../styles/dashboard.css'
import { bindFields, val } from '../bind-fields.js'
import { fedThistle, noFeedAntibiotic } from '../lib/verdict.js'
import { renderNextBar } from '../components/journey-ui.js'
import { renderVerdictStrip } from '../components/verdict-strip.js'
import { isEditing, renderEditToggle, bindEditToggle } from '../components/page-edit.js'
import { canWrite } from '../auth.js'
import { iconPlus } from '../icons.js'
import { envMetrics, HOUSE_ENV_LIMITS, resolveHouseEnv, pickHouseEnvPoint } from '../lib/house-env.js'

export const meta = { id: 'farm', title: '养殖过程' }

const ENV_CHART_COLOR = {
  temp: '#b8893a',
  humidity: '#2b6b4c',
  nh3: '#8c3d5c',
  co2: '#163528',
}

const ENV_KEYS = ['temp', 'humidity', 'nh3', 'co2']

let echartsMod = null
/** @type {import('echarts').ECharts[]} */
let envCharts = []
/** @type {(() => void) | null} */
let onEnvResize = null

/**
 * @param {object} [houseEnv]
 * @returns {string}
 */
function renderHouseEnv(houseEnv, listed) {
  const metrics = envMetrics(houseEnv, new Date(), { listed })
  const tiles = metrics.map((m) => `
    <div class="env-tile ${m.ok ? 'ok' : 'warn'}">
      <span class="env-k">${m.label}</span>
      <b>${m.value === '' || m.value == null ? '—' : m.value}<small>${m.unit}</small></b>
      <em class="chip ${m.ok ? 'ok' : 'warn'}">${m.chip}</em>
    </div>`).join('')
  const charts = metrics.map((m) => `
    <figure class="env-mini">
      <figcaption>${m.label} ${m.unit}</figcaption>
      <div data-env-chart="${m.key}"></div>
    </figure>`).join('')
  return `
    <div class="card mt-14 farm-env">
      <div class="card-head">
        <div>
          <h3>鸡舍实况</h3>
          <p class="sub">演示传感器，待接物联网</p>
        </div>
      </div>
      <div class="env-tiles">${tiles}</div>
      <div class="env-charts">${charts}</div>
      <p class="sub mt-10">出栏前 8–19 时 · 半小时一条 · 演示传感器</p>
    </div>
  `
}

/**
 * @param {unknown} s
 * @returns {string}
 */
function day(s) {
  return String(s || '').slice(0, 10)
}

/**
 * 日粮里第一次写大蓟的日期，没有就用进苗日。
 * @param {object} state
 * @returns {string}
 */
function thistleFeedDate(state) {
  const row = (state.farm.medLog || []).find((r) => /蓟/.test(r.item || ''))
  return day(row?.date || state.farm.stockDate)
}

/**
 * @param {unknown} v
 * @returns {string}
 */
function show(v) {
  const s = val(v)
  return s === '' ? '—' : s
}

/**
 * @param {object} state
 * @returns {string}
 */
export function render(state) {
  const f = state.farm
  const s = state.screen
  const e = state.eval
  const thistle = fedThistle(state)
  const noAbx = noFeedAntibiotic(state)
  const editing = canWrite('farm') && isEditing('farm', state.batchId)
  const story = [
    { src: './evidence/flock.jpg', title: '进苗', date: day(f.stockDate), note: `${val(f.breed)} 入舍` },
    { src: './evidence/thistle.jpg', title: '喂大蓟', date: thistleFeedDate(state), note: `${val(f.additive)} ${val(f.dose)}` },
    { src: './evidence/meat.jpg', title: '出栏', date: day(f.plannedSlaughter), note: `${val(f.count)} 羽计划出栏` },
    { src: './evidence/lab.jpg', title: '安全检测', date: day(s.sampleDate || s.hplcDate), note: `${val(s.target)} ${val(s.result || s.valueText)}` },
    { src: './evidence/lab.jpg', title: '健康评价', date: '', note: e.IL6 !== '' && e.IL6 != null ? `IL-6 ${val(e.IL6)} / 对照 ${val(e.IL6Ctrl)}` : '待评价' },
  ]
  const medRows = f.medLog || []
  return `
    <div class="page-head">
      <h2>养殖过程</h2>
      ${renderEditToggle('farm', 'farm', state.batchId)}
    </div>
    ${renderVerdictStrip(state)}
    ${renderNextBar('farm')}
    <div class="evidence-page${editing ? ' is-editing' : ''}" data-evidence-page>
      <div data-evidence-view>
        <div class="card story-lead">
          ${thistle ? `本批次日粮添加 <strong>大蓟粗提物</strong>（${val(f.additive)} ${val(f.dose)}）。` : '日粮尚未记录大蓟。'}
          ${noAbx ? '用药记录：<strong>饲用抗生素未使用</strong>。' : '用药记录中饲用抗生素尚未清零。'}
          疫苗按规程执行，不属于饲用抗生素。
        </div>
        <section class="dash-story" aria-label="本批次日程">
          <h3>本批次日程</h3>
          <ol>
            ${story.map((n) => `
              <li>
                <img src="${n.src}" alt="" width="72" height="72">
                <b>${n.title}</b>
                <time>${n.date}</time>
                <span>${n.note}</span>
              </li>
            `).join('')}
          </ol>
        </section>
        <div class="grid g-12 mt-14">
          <div class="card fact-block">
            <h3>批次与基地</h3>
            <dl class="fact-grid">
              <div><dt>批次号</dt><dd>${show(state.batchId)}</dd></div>
              <div><dt>鸡群编号</dt><dd>${show(f.flockId)}</dd></div>
              <div><dt>养殖基地</dt><dd>${show(f.name)}</dd></div>
              <div><dt>共建单位</dt><dd>${show(f.partners)}</dd></div>
              <div><dt>地址</dt><dd>${show(f.location)}</dd></div>
              <div><dt>鸡舍</dt><dd>${show(f.house)}</dd></div>
              <div><dt>品种</dt><dd>${show(f.breed)}</dd></div>
              <div><dt>入孵</dt><dd>${show(f.hatchDate)}</dd></div>
              <div><dt>进苗</dt><dd>${show(f.stockDate)}</dd></div>
              <div><dt>计划出栏</dt><dd>${show(f.plannedSlaughter)}</dd></div>
              <div><dt>本群羽数</dt><dd>${show(f.count)} 羽</dd></div>
              <div><dt>密度</dt><dd>${show(f.density)}</dd></div>
            </dl>
          </div>
          <article class="card diet-card">
            <h3>日粮证据</h3>
            <p class="diet-lead">${thistle ? `添加物 <strong>${show(f.additive)}</strong>，剂量 ${show(f.dose)}。` : '日粮尚未记录大蓟。'}</p>
            <dl class="fact-grid">
              <div><dt>添加物</dt><dd>${show(f.additive)}</dd></div>
              <div><dt>剂量</dt><dd>${show(f.dose)}</dd></div>
              <div><dt>日粮</dt><dd>${show(f.feedBrand)}</dd></div>
              <div><dt>起始日龄</dt><dd>${show(f.doseStartDay)}</dd></div>
              <div><dt>料肉比</dt><dd>${show(f.fcr)} · 对照 ${show(f.fcrControl)}</dd></div>
              <div><dt>死淘率</dt><dd>${show(f.mortality)}% · 对照 ${show(f.mortalityControl)}%</dd></div>
            </dl>
            <p class="diet-note">${show(f.feedNote)}</p>
            <span class="chip ${noAbx ? 'ok' : 'bad'}">${noAbx ? '饲用抗生素未使用' : '饲用抗生素未清零'}</span>
          </article>
        </div>
        ${renderHouseEnv(f.houseEnv, !!(state.report?.generated && state.trace?.generated))}
        <div class="card mt-14 farm-cam">
          <h3>合作鸡场监控</h3>
          <div class="cam-crossfade" aria-label="合作鸡场监控（待接入实时流）">
            <img src="./evidence/house.jpg" alt="合作鸡场鸡舍" width="880" height="360">
            <img src="./evidence/flock.jpg" alt="合作鸡场鸡群" width="880" height="360">
          </div>
          <p class="sub mt-10">合作鸡场监控（待接入实时流）</p>
        </div>
        <div class="card mt-14 med-list">
          <h3>用药与添加记录</h3>
          <ol class="med-timeline">
            ${medRows.map((row) => `
              <li>
                <time>${day(row.date)}</time>
                <div>
                  <b>${show(row.item)}</b>
                  <span class="med-meta">${show(row.dose)} · ${show(row.purpose)}</span>
                </div>
                <em class="med-result">${show(row.result)}</em>
              </li>`).join('') || '<li><span>尚无记录</span></li>'}
          </ol>
        </div>
      </div>
      <div data-edit-view>
        <div class="grid g-12">
          <div class="card">
            <h3>批次与基地</h3>
            <div class="form two">
              <div class="field"><label>批次号</label><input data-field="batchId" value="${val(state.batchId)}"></div>
              <div class="field"><label>鸡群编号</label><input data-field="farm.flockId" value="${val(f.flockId)}"></div>
              <div class="field span2"><label>养殖基地</label><input data-field="farm.name" value="${val(f.name)}"></div>
              <div class="field span2"><label>共建单位</label><input data-field="farm.partners" value="${val(f.partners)}"></div>
              <div class="field span2"><label>地址</label><input data-field="farm.location" value="${val(f.location)}"></div>
              <div class="field"><label>鸡舍</label><input data-field="farm.house" value="${val(f.house)}"></div>
              <div class="field"><label>品种</label><input data-field="farm.breed" value="${val(f.breed)}"></div>
              <div class="field"><label>入孵</label><input data-field="farm.hatchDate" value="${val(f.hatchDate)}"></div>
              <div class="field"><label>进苗</label><input data-field="farm.stockDate" value="${val(f.stockDate)}"></div>
              <div class="field"><label>计划出栏</label><input data-field="farm.plannedSlaughter" value="${val(f.plannedSlaughter)}"></div>
              <div class="field"><label>本群羽数</label><input data-field="farm.count" value="${val(f.count)}"></div>
              <div class="field"><label>密度</label><input data-field="farm.density" value="${val(f.density)}"></div>
            </div>
          </div>
          <div class="card">
            <h3>喂了什么</h3>
            <div class="form">
              <div class="field"><label>日粮</label><input data-field="farm.feedBrand" value="${val(f.feedBrand)}"></div>
              <div class="field"><label>添加物</label><input data-field="farm.additive" value="${val(f.additive)}"></div>
              <div class="field"><label>添加量</label><input data-field="farm.dose" value="${val(f.dose)}"></div>
              <div class="field"><label>起始日龄</label><input data-field="farm.doseStartDay" value="${val(f.doseStartDay)}"></div>
              <div class="field"><label>料肉比</label><input data-field="farm.fcr" value="${val(f.fcr)}"></div>
              <div class="field"><label>死淘率 %</label><input data-field="farm.mortality" value="${val(f.mortality)}"></div>
              <div class="field"><label>备注</label><textarea data-field="farm.feedNote">${val(f.feedNote)}</textarea></div>
            </div>
            <p class="sub mt-10">对照料肉比 ${val(f.fcrControl)} · 对照死淘 ${val(f.mortalityControl)}% · 队内对照测定（同期常规日粮组）</p>
          </div>
        </div>
        <div class="card mt-14">
          <div class="card-head">
            <h3>用药与添加记录</h3>
            <button type="button" class="btn line" data-action="add-med">${iconPlus}<span>增一行</span></button>
          </div>
          <div class="table-wrap">
          <table class="table">
            <thead><tr><th>日期</th><th>项目</th><th class="num">剂量</th><th>目的</th><th>结果</th></tr></thead>
            <tbody>
              ${medRows.map((row, i) => `
                <tr>
                  <td><input data-med="${i}" data-key="date" value="${val(row.date)}"></td>
                  <td><input data-med="${i}" data-key="item" value="${val(row.item)}"></td>
                  <td class="num"><input data-med="${i}" data-key="dose" value="${val(row.dose)}"></td>
                  <td><input data-med="${i}" data-key="purpose" value="${val(row.purpose)}"></td>
                  <td><input data-med="${i}" data-key="result" value="${val(row.result)}"></td>
                </tr>`).join('')}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </div>
  `
}

/**
 * @param {string} hex
 * @param {number} a
 * @returns {string}
 */
function hexAlpha(hex, a) {
  const n = hex.replace('#', '')
  const r = parseInt(n.slice(0, 2), 16)
  const g = parseInt(n.slice(2, 4), 16)
  const b = parseInt(n.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${a})`
}

/**
 * @param {unknown} at
 * @returns {string}
 */
function hourLabel(at) {
  const m = String(at || '').match(/\b(\d{1,2}):(\d{2})/)
  if (!m) return String(at || '')
  return `${m[1].padStart(2, '0')}:${m[2]}`
}

/**
 * @param {object[]} series
 * @param {Date} [now]
 * @returns {object}
 */
function currentSeriesPoint(series, listed, now = new Date()) {
  return pickHouseEnvPoint(series, { listed }, now) || series[series.length - 1]
}

/**
 * Zoom y to the day's trace, pad 12–18%. Pull in 内控 min/max only if they sit
 * within pad×2 of the data — never stretch NH3/CO2 to the full 内控 span.
 * @param {string} key
 * @param {number[]} data
 * @returns {{ min: number, max: number }}
 */
function envYWindow(key, data) {
  const lim = HOUSE_ENV_LIMITS[key]
  const vals = data.filter((n) => Number.isFinite(n))
  if (!vals.length) return { min: lim.min, max: lim.max }
  const dMin = Math.min(...vals)
  const dMax = Math.max(...vals)
  const span = Math.max(dMax - dMin, Number.EPSILON)
  const pad = span * 0.16
  let yMin = dMin - pad
  let yMax = dMax + pad
  const reach = pad * 2
  if (lim.min >= dMin - reach && lim.min <= dMax + reach) yMin = Math.min(yMin, lim.min)
  if (lim.max >= dMin - reach && lim.max <= dMax + reach) yMax = Math.max(yMax, lim.max)
  return { min: yMin, max: yMax }
}

/**
 * @param {string} key
 * @param {unknown} value
 * @returns {string}
 */
function envValueText(key, value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value ?? '')
  if (key === 'co2') return String(Math.round(n))
  return (Math.round(n * 10) / 10).toFixed(1)
}

/**
 * @param {string} key
 * @param {object[]} series
 * @param {object} current
 * @param {boolean} reduced
 */
function envChartOption(key, series, current, reduced) {
  const lim = HOUSE_ENV_LIMITS[key]
  const color = ENV_CHART_COLOR[key]
  const labels = series.map((p) => hourLabel(p.at))
  const data = series.map((p) => Number(p[key]))
  const { min: yMin, max: yMax } = envYWindow(key, data)
  const curLabel = hourLabel(current?.at)
  const curVal = Number(current?.[key])
  const visLo = Math.max(lim.min, yMin)
  const visHi = Math.min(lim.max, yMax)
  const markLines = []
  if (lim.min >= yMin && lim.min <= yMax) markLines.push({ yAxis: lim.min })
  if (lim.max >= yMin && lim.max <= yMax) markLines.push({ yAxis: lim.max })
  const curText = Number.isFinite(curVal) ? `${envValueText(key, curVal)}${lim.unit}` : ''
  return {
    animationDuration: reduced ? 0 : 500,
    animationDurationUpdate: reduced ? 0 : 500,
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'line',
        lineStyle: { color: '#163528', width: 1, opacity: 0.45 },
      },
      backgroundColor: '#fffdf8',
      borderColor: '#d4c9ae',
      borderWidth: 1,
      padding: [6, 10],
      textStyle: { color: '#163528', fontSize: 12, fontWeight: 600 },
      extraCssText: 'box-shadow: 0 8px 20px rgba(18,38,28,.08); border-radius: 8px;',
      formatter: (params) => {
        const p = Array.isArray(params) ? params[0] : params
        return `${p.axisValue}  ${lim.label} ${envValueText(key, p.value)}${lim.unit}`
      },
    },
    grid: { left: 40, right: 12, top: 22, bottom: 24 },
    xAxis: {
      type: 'category',
      data: labels,
      boundaryGap: false,
      axisPointer: { show: true, type: 'line', lineStyle: { color: '#163528', opacity: 0.35 } },
      axisLabel: {
        interval: (_idx, value) => /^(08|10|12|14|16|18):00$/.test(String(value)),
        formatter: (value) => String(value).slice(0, 2),
        fontSize: 10,
        color: '#5c7266',
        hideOverlap: true,
      },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#d4c9ae' } },
    },
    yAxis: {
      type: 'value',
      name: lim.unit,
      min: yMin,
      max: yMax,
      nameGap: 6,
      nameTextStyle: { fontSize: 10, color: '#5c7266' },
      splitNumber: 4,
      axisLabel: {
        fontSize: 10,
        color: '#5c7266',
        formatter: (v) => (key === 'co2' ? String(Math.round(v)) : String(Math.round(v * 10) / 10)),
      },
      splitLine: { lineStyle: { color: '#e6dcc6', type: 'dashed' } },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [{
      type: 'line',
      data,
      smooth: 0.25,
      showSymbol: false,
      symbol: 'circle',
      symbolSize: 7,
      lineStyle: { width: 2, color },
      itemStyle: { color },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: hexAlpha(color, 0.22) },
            { offset: 1, color: hexAlpha(color, 0.02) },
          ],
        },
      },
      markArea: visLo < visHi ? {
        silent: true,
        itemStyle: { color: 'rgba(28,107,69,.07)' },
        label: {
          show: true,
          formatter: '内控',
          color: 'rgba(28,107,69,.55)',
          fontSize: 9,
          position: 'insideTopLeft',
        },
        data: [[{ yAxis: visLo }, { yAxis: visHi }]],
      } : undefined,
      markLine: markLines.length ? {
        silent: true,
        symbol: 'none',
        label: { show: false },
        lineStyle: { type: 'dashed', color: 'rgba(28,107,69,.42)', width: 1 },
        data: markLines,
      } : undefined,
      markPoint: Number.isFinite(curVal) ? {
        silent: true,
        symbol: 'circle',
        symbolSize: 9,
        itemStyle: { color, borderColor: '#fffdf8', borderWidth: 2 },
        label: {
          show: true,
          formatter: curText,
          position: 'top',
          fontSize: 10,
          color,
          fontWeight: 650,
          textBorderColor: '#fffdf8',
          textBorderWidth: 3,
        },
        data: [{ coord: [curLabel, curVal] }],
      } : undefined,
    }],
  }
}

/**
 * @param {Element} root
 * @param {object} houseEnv
 */
function mountEnvCharts(root, houseEnv, listed) {
  if (!echartsMod || !root) return
  const live = resolveHouseEnv(houseEnv, new Date(), { listed })
  const series = live.series
  if (!series.length) return
  const current = currentSeriesPoint(series, listed)
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ENV_KEYS.forEach((key) => {
    const el = root.querySelector(`[data-env-chart="${key}"]`)
    if (!el) return
    const chart = echartsMod.init(el, null, { renderer: 'canvas' })
    chart.setOption(envChartOption(key, series, current, reduced))
    envCharts.push(chart)
  })
  requestAnimationFrame(() => {
    envCharts.forEach((c) => c.resize())
  })
  onEnvResize = () => {
    envCharts.forEach((c) => c.resize())
  }
  window.addEventListener('resize', onEnvResize)
}

/**
 * @param {Element} root
 * @param {object} [state]
 */
export async function bind(root, state) {
  bindFields(root)
  bindEditToggle(root, 'farm', 'farm', state?.batchId)
  root.querySelector('[data-edit-toggle]')?.addEventListener('click', () => {
    if (isEditing('farm', state?.batchId)) return
    requestAnimationFrame(() => {
      envCharts.forEach((c) => c.resize())
    })
  })
  if (!state?.farm) return
  if (!echartsMod) echartsMod = await import('echarts')
  if (!root.isConnected) return
  unbind()
  mountEnvCharts(root, state.farm.houseEnv, !!(state.report?.generated && state.trace?.generated))
}

/**
 * 离开养殖过程页时释放折线图。
 */
export function unbind() {
  if (onEnvResize) {
    window.removeEventListener('resize', onEnvResize)
    onEnvResize = null
  }
  envCharts.forEach((c) => c.dispose())
  envCharts = []
}
