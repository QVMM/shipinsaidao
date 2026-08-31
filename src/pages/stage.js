import '../styles/stage.css'
import { PIPELINE, stageLabel } from '../lib/pipeline.js'
import { STAGE_SCENES } from '../lib/stage-view.js'
import { threeFacts } from '../lib/verdict.js'
import { get } from '../api.js'
import { renderLabDock } from '../lib/lab-status.js'

export const meta = { id: 'stage', title: '指挥舱' }

const POLL_MS = 1500
const DESIGN_W = 1920
const DESIGN_H = 1080

const CYAN = '#27e0d0'
const BAR_CYAN = 'rgba(39, 224, 208, 0.88)'
const BAR_GOLD = 'rgba(228, 197, 106, 0.78)'
const BAR_RED = 'rgba(232, 90, 90, 0.82)'
const AXIS = '#7a9a96'
const SPLIT = 'rgba(39, 224, 208, 0.08)'

const KPI_CHIPS = [
  { key: 'inFarm', label: '在养', funnel: 'farming' },
  { key: 'inLab', label: '在检', funnel: ['screening', 'evaluating'] },
  { key: 'certified', label: '已出证', funnel: 'tracing' },
  { key: 'onMarket', label: '已上市', funnel: 'market' },
  { key: 'alerts', label: '预警', funnel: 'alert', danger: true },
]

let pollTimer = 0
let clockTimer = 0
let rootEl = null
let lastSig = ''
let echartsMod = null
let charts = { compare: null, rate: null, inflam: null, radar: null, trend: null }
const kpiFrom = { inFarm: 0, inLab: 0, certified: 0, onMarket: 0, alerts: 0 }

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function esc(v) {
  return v == null ? '' : String(v)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function dash(v) {
  return v === '' || v == null ? '—' : String(v)
}

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function formatClock(d = new Date()) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const g = (t) => parts.find((p) => p.type === t)?.value || ''
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}:${g('second')}`
}

function corners() {
  return '<i class="dv-c dv-tl"></i><i class="dv-c dv-tr"></i><i class="dv-c dv-bl"></i><i class="dv-c dv-br"></i>'
    + '<i class="dv-c2 dv-tl"></i><i class="dv-c2 dv-tr"></i><i class="dv-c2 dv-bl"></i><i class="dv-c2 dv-br"></i>'
}

function glyph(stage) {
  const common = 'class="st-ico" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"'
  if (stage === 'farming') {
    return `<svg ${common}><path d="M3 11.5 12 4l9 7.5" stroke="currentColor" stroke-width="1.6"/><path d="M6 11v8h12v-8" stroke="currentColor" stroke-width="1.6"/><path d="M10 19v-5h4v5" stroke="currentColor" stroke-width="1.6"/></svg>`
  }
  if (stage === 'screening') {
    return `<svg ${common}><path d="M8 3h8v4l-2.2 3.2A6 6 0 1 1 8.2 10.2L6 7V3z" stroke="currentColor" stroke-width="1.6"/><path d="M10 14.5h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`
  }
  if (stage === 'evaluating') {
    return `<svg ${common}><path d="M7 4h10M9 4v5.2L6.4 16A4.6 4.6 0 0 0 10.5 22h3a4.6 4.6 0 0 0 4.1-6L15 9.2V4" stroke="currentColor" stroke-width="1.6"/><path d="M9 13h6" stroke="currentColor" stroke-width="1.4"/></svg>`
  }
  if (stage === 'reporting') {
    return `<svg ${common}><path d="M7 3.5h7l3 3V20.5H7z" stroke="currentColor" stroke-width="1.6"/><path d="M14 3.5V7h3M9.5 11h5M9.5 14.5h5" stroke="currentColor" stroke-width="1.4"/></svg>`
  }
  if (stage === 'tracing') {
    return `<svg ${common}><path d="M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5z" stroke="currentColor" stroke-width="1.5"/><path d="M14 14h2v2h-2zM18 14h1v1h-1zM14 18h1v1h-1zM17 17h2v2h-2z" fill="currentColor"/></svg>`
  }
  return `<svg ${common}><path d="M4 8h16l-1.2 11H5.2z" stroke="currentColor" stroke-width="1.6"/><path d="M8 8V6a4 4 0 0 1 8 0v2" stroke="currentColor" stroke-width="1.6"/><path d="M9 13.5 11 16l4-4" stroke="currentColor" stroke-width="1.6"/></svg>`
}

function commonAxis() {
  return {
    axisLine: { lineStyle: { color: 'rgba(39, 224, 208, 0.28)' } },
    axisTick: { show: false },
    axisLabel: { color: AXIS, fontSize: 11 },
    splitLine: { lineStyle: { color: SPLIT } },
  }
}

function barOption({ categories, a, b, aName, bName, yName }) {
  return {
    animation: !reducedMotion(),
    animationDuration: 520,
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(4, 16, 22, 0.92)',
      borderColor: 'rgba(39, 224, 208, 0.35)',
      textStyle: { color: '#d7ece8', fontSize: 12 },
    },
    legend: {
      data: [aName, bName],
      top: 0,
      right: 4,
      itemWidth: 10,
      itemHeight: 8,
      textStyle: { color: AXIS, fontSize: 11 },
    },
    grid: { left: 40, right: 10, top: 38, bottom: 34 },
    xAxis: { type: 'category', data: categories, ...commonAxis() },
    yAxis: { type: 'value', name: yName || '', nameTextStyle: { color: AXIS, fontSize: 10 }, ...commonAxis() },
    series: [
      { name: aName, type: 'bar', barWidth: 16, data: a, itemStyle: { color: BAR_CYAN, borderRadius: [2, 2, 0, 0] } },
      { name: bName, type: 'bar', barWidth: 16, data: b, itemStyle: { color: BAR_GOLD, borderRadius: [2, 2, 0, 0] } },
    ],
  }
}

function radarOption(rings) {
  const indicators = (rings || []).map((r) => ({ name: r.name, max: 100 }))
  const values = (rings || []).map((r) => num(r.value))
  return {
    animation: !reducedMotion(),
    radar: {
      indicator: indicators.length ? indicators : [
        { name: '低残留', max: 100 },
        { name: '低炎症', max: 100 },
        { name: '高品质', max: 100 },
        { name: '可追溯', max: 100 },
      ],
      center: ['50%', '54%'],
      radius: '40%',
      splitNumber: 4,
      axisName: { color: AXIS, fontSize: 11, padding: [8, 10], overflow: 'break' },
      splitLine: { lineStyle: { color: 'rgba(39, 224, 208, 0.18)' } },
      splitArea: { areaStyle: { color: ['rgba(39, 224, 208, 0.03)', 'rgba(39, 224, 208, 0.07)'] } },
      axisLine: { lineStyle: { color: 'rgba(39, 224, 208, 0.22)' } },
    },
    series: [{
      type: 'radar',
      symbol: 'circle',
      symbolSize: 5,
      data: [{
        value: values.length ? values : [0, 0, 0, 0],
        name: '焦点',
        lineStyle: { color: CYAN, width: 2 },
        itemStyle: { color: CYAN },
        areaStyle: { color: 'rgba(39, 224, 208, 0.22)' },
      }],
    }],
  }
}

function gaugeOption(rate) {
  return {
    animation: !reducedMotion(),
    series: [{
      type: 'gauge',
      startAngle: 210,
      endAngle: -30,
      min: 0,
      max: 100,
      center: ['50%', '52%'],
      radius: '86%',
      pointer: { show: false },
      progress: { show: true, width: 7, roundCap: true, itemStyle: { color: CYAN } },
      axisLine: { lineStyle: { width: 7, color: [[1, 'rgba(39, 224, 208, 0.12)']] } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      anchor: { show: false },
      title: { show: false },
      detail: {
        valueAnimation: !reducedMotion(),
        offsetCenter: [0, '-8%'],
        fontSize: 28,
        fontWeight: 650,
        color: CYAN,
        fontFamily: 'SF Mono, Menlo, Consolas, monospace',
        formatter: (v) => `${Number(v).toFixed(v % 1 ? 1 : 0)}%`,
      },
      data: [{ value: num(rate) }],
    }],
  }
}

function trendOption(trend) {
  const days = trend?.days || []
  return {
    animation: !reducedMotion(),
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(4, 16, 22, 0.92)',
      borderColor: 'rgba(39, 224, 208, 0.35)',
      textStyle: { color: '#d7ece8', fontSize: 12 },
    },
    legend: {
      data: ['安全检测', '未检出', '预警'],
      bottom: 0,
      left: 'center',
      itemWidth: 8,
      itemHeight: 6,
      itemGap: 10,
      textStyle: { color: AXIS, fontSize: 9 },
    },
    grid: { left: 28, right: 8, top: 8, bottom: 36 },
    xAxis: { type: 'category', data: days.map((d) => d.date), ...commonAxis() },
    yAxis: { type: 'value', minInterval: 1, ...commonAxis() },
    series: [
      { name: '安全检测', type: 'line', smooth: true, symbolSize: 6, data: days.map((d) => d.screens), lineStyle: { color: CYAN, width: 2 }, itemStyle: { color: CYAN } },
      { name: '未检出', type: 'line', smooth: true, symbolSize: 6, data: days.map((d) => d.clears), lineStyle: { color: BAR_GOLD, width: 2 }, itemStyle: { color: BAR_GOLD } },
      { name: '预警', type: 'line', smooth: true, symbolSize: 6, data: days.map((d) => d.alerts), lineStyle: { color: BAR_RED, width: 2 }, itemStyle: { color: BAR_RED } },
    ],
  }
}

function shortId(id) {
  return String(id || '').replace('蓟化-2026-', '蓟化-')
}

function birdsOfFunnel(funnel, keys) {
  const want = Array.isArray(keys) ? keys : [keys]
  return (funnel || []).filter((f) => want.includes(f.stage)).reduce((n, f) => n + num(f.birds), 0)
}

/**
 * @returns {string}
 */
export function render() {
  const chips = KPI_CHIPS.map((c) => `
    <div class="kpi ${c.danger ? 'is-alert' : ''}" data-kpi="${c.key}">
      <b class="dig" data-kpi-n="${c.key}">0</b>
      <span>${c.label}</span>
      <small data-kpi-sub="${c.key}"></small>
    </div>`).join('')

  const stations = PIPELINE.map((p) => `
    <li class="station" data-st="${p.stage}">
      <div class="st-head">
        ${glyph(p.stage)}
        <div class="st-copy">
          <b>${p.label}</b>
          <em class="dig" data-st-n="${p.stage}">0</em>
        </div>
      </div>
      <div class="st-pills" data-pills="${p.stage}"></div>
    </li>`).join('')

  const path = STAGE_SCENES.map((s, i) => `
    <li class="path-node" data-scene="${s.id}">
      <b>${String(i + 1).padStart(2, '0')}</b>
      <span>${s.label}</span>
      <em data-path-st>待执行</em>
    </li>`).join('')

  return `
    <div class="wall" data-wall data-pass="">
      <div class="wall-board" data-board>
        <div class="wall-scan" aria-hidden="true"></div>
        <div class="wall-grid" aria-hidden="true"></div>
        <header class="wall-hd">
          <div class="hd-wing hd-left">
            <span class="hd-live"><i></i>LIVE</span>
            <span class="hd-sys">FLEET QC / TRACE COMMAND</span>
          </div>
          <div class="hd-title">
            <p class="hd-kicker">FOOD SAFETY · LIVESTOCK TRACEABILITY</p>
            <h1>替抗蓟化 全链条质控与溯源指挥舱</h1>
          </div>
          <div class="hd-wing hd-right">
            <time class="hd-clock dig" data-clock></time>
            <div class="hd-meta">
              <span class="hd-stamp" data-stamp>体系</span>
              <button type="button" class="hd-fs" data-fs title="F11 全屏">全屏</button>
            </div>
          </div>
          <div class="hd-kpis">${chips}</div>
        </header>

        <aside class="wall-col wall-left">
          <div class="dv-box queue-box">
            ${corners()}
            <div class="dv-hd"><i></i><h2>批次队列</h2><span>FLEET</span></div>
            <ol class="queue" data-queue></ol>
          </div>
          <div class="dv-box spot-box">
            ${corners()}
            <div class="dv-hd"><i></i><h2>焦点档案</h2><span>SPOT</span></div>
            <div class="spot-card" data-spot-card></div>
          </div>
          <div class="dv-box chart-box">
            ${corners()}
            <div class="dv-hd"><i></i><h2>焦点 vs 体系</h2><span>COMPARE</span></div>
            <p class="chart-cap">料肉比 / 死淘率</p>
            <div class="chart chart-compare" data-chart="compare"></div>
          </div>
        </aside>

        <section class="wall-mid">
          <div class="dv-box conveyor-box">
            ${corners()}
            <div class="dv-hd">
              <i></i><h2>全链条传送</h2>
              <span>CONVEYOR</span>
            </div>
            <div class="callout" data-callout></div>
            <div class="belt">
              <div class="belt-track" aria-hidden="true">
                <i class="belt-rail"></i>
                <i class="belt-flow"></i>
                <i class="belt-flow is-2"></i>
              </div>
              <ol class="stations">${stations}</ol>
            </div>
          </div>
          <div class="dv-box process-box" data-lab-layer>
            ${corners()}
            <div class="dv-hd"><i></i><h2>检测过程</h2><span>LIVE</span></div>
            ${renderLabDock()}
          </div>
          <div class="dv-box path-box">
            ${corners()}
            <div class="dv-hd"><i></i><h2>焦点路径</h2><span data-path-tag>7 STEP</span></div>
            <div class="path-rail" aria-hidden="true"><i data-rail></i></div>
            <ol class="path-nodes">${path}</ol>
          </div>
        </section>

        <aside class="wall-col wall-right">
          <div class="dv-box rate-box">
            ${corners()}
            <div class="dv-hd"><i></i><h2>氟苯尼考未检出率</h2><span>FLEET</span></div>
            <div class="rate-row">
              <div class="chart chart-rate" data-chart="rate"></div>
              <dl class="kv kv-rate" data-rate-kv></dl>
            </div>
          </div>
          <div class="dv-box">
            ${corners()}
            <div class="dv-hd"><i></i><h2>炎症对照</h2><span>SPOT vs CTRL</span></div>
            <div class="chart chart-inflam" data-chart="inflam"></div>
          </div>
          <div class="right-split">
            <div class="dv-box">
              ${corners()}
              <div class="dv-hd"><i></i><h2>四维</h2><span>RADAR</span></div>
              <div class="chart chart-radar" data-chart="radar"></div>
            </div>
            <div class="dv-box">
              ${corners()}
              <div class="dv-hd"><i></i><h2>近 7 节点</h2><span data-trend-tag>近七日筛查</span></div>
              <div class="chart chart-trend" data-chart="trend"></div>
            </div>
          </div>
        </aside>

        <footer class="wall-ft">
          <div class="ft-fade"></div>
          <div class="ft-track" data-ticker></div>
        </footer>
      </div>
    </div>
  `
}

/**
 * @param {ParentNode} root
 */
export async function bind(root) {
  teardown()
  rootEl = root
  lastSig = ''
  document.title = '替抗蓟化 全链条质控与溯源指挥舱'
  applyScale()
  if (!echartsMod) echartsMod = await import('echarts')
  initCharts()
  tickClock()
  root.querySelector('[data-fs]')?.addEventListener('click', toggleFs)
  window.addEventListener('resize', onResize)
  clockTimer = window.setInterval(tickClock, 1000)
  await tick()
  pollTimer = window.setInterval(tick, POLL_MS)
}

export function retarget() {
  lastSig = ''
  tick()
}

export function unbind() {
  teardown()
}

function teardown() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = 0
  }
  if (clockTimer) {
    clearInterval(clockTimer)
    clockTimer = 0
  }
  window.removeEventListener('resize', onResize)
  Object.keys(charts).forEach((k) => {
    charts[k]?.dispose()
    charts[k] = null
  })
  rootEl = null
  lastSig = ''
}

function onResize() {
  applyScale()
  Object.values(charts).forEach((c) => c?.resize())
  if (rootEl) syncPathRail(rootEl)
}

function applyScale() {
  const board = rootEl?.querySelector('[data-board]')
  if (!board) return
  const s = Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H)
  const x = (window.innerWidth - DESIGN_W * s) / 2
  const y = (window.innerHeight - DESIGN_H * s) / 2
  board.style.transform = `translate(${x}px, ${y}px) scale(${s})`
}

function toggleFs() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.()
  else document.exitFullscreen?.()
}

function tickClock() {
  const el = rootEl?.querySelector('[data-clock]')
  if (el) el.textContent = formatClock()
}

function initCharts() {
  if (!rootEl) return
  ;['compare', 'rate', 'inflam', 'radar', 'trend'].forEach((name) => {
    const el = rootEl.querySelector(`[data-chart="${name}"]`)
    if (!el) return
    charts[name]?.dispose()
    charts[name] = echartsMod.init(el, null, { renderer: 'canvas' })
  })
  charts.compare?.setOption(barOption({
    categories: ['料肉比', '死淘率'], a: [0, 0], b: [0, 0], aName: '焦点', bName: '体系均值',
  }))
  charts.rate?.setOption(gaugeOption(0))
  charts.inflam?.setOption(barOption({
    categories: ['IL-1β', 'IL-6', 'TNF-α', 'CRP'],
    a: [0, 0, 0, 0], b: [0, 0, 0, 0], aName: '焦点', bName: '对照',
  }))
  charts.radar?.setOption(radarOption([]))
  charts.trend?.setOption(trendOption({ days: [] }))
}

async function tick() {
  if (!rootEl) return
  try {
    const data = await get('/api/public/command', { silent: true })
    apply(rootEl, data)
  } catch {
    const call = rootEl.querySelector('[data-callout]')
    if (call && !call.textContent) call.textContent = '指挥舱还没接到体系数据。'
  }
}

function playKpi(key, to) {
  const el = rootEl?.querySelector(`[data-kpi-n="${key}"]`)
  if (!el) return
  const from = kpiFrom[key] || 0
  kpiFrom[key] = to
  if (from === to || reducedMotion()) {
    el.textContent = String(to)
    return
  }
  const t0 = performance.now()
  const dur = 640
  const frame = (now) => {
    if (!rootEl) return
    const p = Math.min(1, (now - t0) / dur)
    const eased = 1 - (1 - p) ** 3
    el.textContent = String(Math.round(from + (to - from) * eased))
    if (p < 1) requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

function pathFillT(spot) {
  const nodes = spot?.nodes || []
  const n = nodes.length || 7
  const activeIdx = nodes.findIndex((node) => node.active && !node.done)
  if (activeIdx >= 0) return (activeIdx + 0.5) / n
  const lastDone = nodes.reduce((acc, node, i) => (node.done ? i : acc), -1)
  if (lastDone < 0) return 0
  return lastDone === n - 1 ? 1 : (lastDone + 1) / n
}

function syncPathRail(el) {
  const wall = el.querySelector?.('[data-wall]') || el
  const rail = wall.querySelector?.('.path-rail')
  const fill = wall.querySelector?.('[data-rail]')
  const nodes = [...(wall.querySelectorAll?.('.path-node') || [])]
  if (!rail || !fill || !nodes.length) return
  const railBox = rail.getBoundingClientRect()
  const w = railBox.width
  if (!w) return
  const active = nodes.find((node) => node.classList.contains('is-on') && !node.classList.contains('is-done'))
  const lastDone = [...nodes].reverse().find((node) => node.classList.contains('is-done'))
  let x = 0
  if (active) {
    const r = active.getBoundingClientRect()
    x = r.left + r.width / 2 - railBox.left
  } else if (lastDone) {
    const r = lastDone.getBoundingClientRect()
    x = lastDone === nodes[nodes.length - 1] ? w : r.right - railBox.left
  }
  const t = Math.max(0, Math.min(1, x / w))
  fill.style.transition = 'none'
  fill.style.transform = `scaleX(${t})`
  wall.style?.setProperty('--path-t', String(t))
  requestAnimationFrame(() => { fill.style.transition = '' })
}

/**
 * @param {ParentNode} root
 * @param {object} data
 */
function apply(root, data) {
  const el = root.querySelector('[data-wall]')
  if (!el) return
  const sig = [
    data.kpis?.inFarm,
    data.kpis?.inLab,
    data.kpis?.certified,
    data.kpis?.alerts,
    data.kpis?.onMarket,
    (data.batches || []).map((b) => `${b.batchId}:${b.stage}:${b.result}`).join('|'),
    data.spotlight?.verdict?.headline,
    data.spotlight?.report?.no,
    data.spotlight?.trace?.verifyId,
  ].join('~')
  if (sig === lastSig) return
  lastSig = sig

  const pass = !!data.spotlight?.verdict?.pass
  el.dataset.pass = pass ? '1' : '0'
  el.style.setProperty('--path-t', String(pathFillT(data.spotlight)))

  const stamp = el.querySelector('[data-stamp]')
  if (stamp) {
    stamp.textContent = `${(data.batches || []).length} 批在链`
    stamp.classList.add('is-ok')
  }

  const kpis = data.kpis || {}
  KPI_CHIPS.forEach((c) => {
    playKpi(c.key, num(kpis[c.key]))
    const sub = el.querySelector(`[data-kpi-sub="${c.key}"]`)
    if (!sub) return
    if (c.key === 'alerts') {
      sub.textContent = kpis.alertNote || ''
      return
    }
    if (c.key === 'inLab') {
      sub.textContent = kpis.inLabBirds ? `${kpis.inLabBirds} 羽` : ''
      return
    }
    const birds = birdsOfFunnel(data.funnel, c.funnel)
    sub.textContent = birds ? `${birds} 羽` : ''
  })

  const order = [...PIPELINE.map((p) => p.stage), 'alert']
  const batches = [...(data.batches || [])].sort((a, b) => {
    if (a.spotlight !== b.spotlight) return a.spotlight ? -1 : 1
    const ia = order.indexOf(a.stage)
    const ib = order.indexOf(b.stage)
    if (ia !== ib) return ia - ib
    return a.batchId < b.batchId ? 1 : -1
  })

  const queue = el.querySelector('[data-queue]')
  if (queue) {
    queue.innerHTML = batches.map((b) => `
      <li class="q-row is-${esc(b.stage)} ${b.spotlight ? 'is-spot' : ''} ${b.alert ? 'is-alert' : ''}">
        <i class="q-dot"></i>
        <div class="q-main">
          <b>${esc(b.batchId)}</b>
          <span>${esc(b.count)}羽 · ${esc(b.house || b.base)} · ${esc(b.result)}</span>
        </div>
        <em>${esc(stageLabel(b.stage))}</em>
      </li>`).join('')
  }

  PIPELINE.forEach((p) => {
    const nEl = el.querySelector(`[data-st-n="${p.stage}"]`)
    const pills = el.querySelector(`[data-pills="${p.stage}"]`)
    const here = batches.filter((b) => b.station === p.stage)
    if (nEl) nEl.textContent = String(here.length)
    if (!pills) return
    pills.innerHTML = here.map((b) => {
      const cls = ['pill', `is-${b.stage}`, b.spotlight ? 'is-spot' : '', b.alert ? 'is-alert' : '']
        .filter(Boolean).join(' ')
      return `<article class="${cls}" title="${esc(b.batchId)} ${esc(b.result)}">
        <b>${esc(shortId(b.batchId))}</b>
        <em>${esc(b.count)}羽</em>
      </article>`
    }).join('')
  })

  const spot = data.spotlight || {}
  const farm = spot.farm || {}
  const facts = threeFacts({
    farm: { additive: farm.additive, medLog: farm.medLog || [] },
    screen: spot.screen || {},
    eval: spot.eval || {},
  })
  const call = el.querySelector('[data-callout]')
  if (call) {
    call.innerHTML = `
      <p class="co-kicker">焦点批次判定 · ${esc(spot.batchId || data.spotlightId || '')}</p>
      <h3>${esc(spot.verdict?.headline || '—')}</h3>
      <p class="co-why">${esc(spot.verdict?.why || '')}</p>
      <ul class="co-facts">${facts.map((f) => `<li class="${f.ok ? 'ok' : 'bad'}">${esc(f.text)}</li>`).join('')}</ul>`
  }

  const card = el.querySelector('[data-spot-card]')
  if (card) {
    const rows = [
      ['批次', spot.batchId],
      ['基地', farm.name],
      ['鸡舍', batches.find((b) => b.spotlight)?.house],
      ['羽数', farm.count],
      ['日粮', farm.feedBrand],
      ['大蓟', farm.dose || farm.additive],
      ['料肉比', farm.fcr],
      ['死淘 %', farm.mortality],
    ]
    card.innerHTML = `
      ${pass ? '<i class="spot-seal" aria-hidden="true">合格<br>准予上市</i>' : ''}
      <p class="spot-head ${pass ? 'is-ok' : 'is-hold'}">${esc(spot.verdict?.headline || '')}</p>
      <dl class="kv">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd class="dig">${esc(dash(v))}</dd></div>`).join('')}</dl>`
  }

  STAGE_SCENES.forEach((s) => {
    const node = el.querySelector(`[data-scene="${s.id}"]`)
    if (!node) return
    const info = (spot.nodes || []).find((n) => n.id === s.id)
    const done = info ? info.done : !!spot.scenes?.[s.id]
    const active = info ? info.active : spot.active === s.id
    node.classList.toggle('is-done', done)
    node.classList.toggle('is-on', active)
    const st = node.querySelector('[data-path-st]')
    if (st) st.textContent = info?.status || (done ? '已完成' : (active ? '进行中' : '待执行'))
  })
  syncPathRail(el)
  requestAnimationFrame(() => syncPathRail(el))

  const rateKv = el.querySelector('[data-rate-kv]')
  if (rateKv) {
    const d = data.detect || {}
    rateKv.innerHTML = [
      ['已筛', d.screened],
      ['未检出', d.cleared],
      ['阳性', d.positive],
      ['在栏羽', kpis.birdsLive],
    ].map(([k, v]) => `<div><dt>${esc(k)}</dt><dd class="dig">${esc(dash(v))}</dd></div>`).join('') +
      '<p class="kv-note">在养羽 + 在检羽（含预警工位）</p>'
  }

  const pathTag = el.querySelector('[data-path-tag]')
  if (pathTag) pathTag.textContent = `${spot.batchId || data.spotlightId || ''} · 7 STEP`

  const tag = el.querySelector('[data-trend-tag]')
  if (tag) tag.textContent = data.trend?.label || '近七日筛查'

  const ticker = el.querySelector('[data-ticker]')
  if (ticker) {
    const ev = (data.events || []).map((e) => e.line || e).filter(Boolean)
    const prog = spot.program || {}
    const bits = [
      ...ev,
      `累计出栏 ${prog.birds || '≥10万羽'}`,
      `公益快检 ${prog.charityTests || '3000+'}`,
      `料肉比下降 ${prog.fcrDrop || '≥0.05'}`,
      `死淘下降 ${prog.mortDrop || '≥2个百分点'}`,
      `覆盖市场 ${prog.markets ?? 12}`,
    ]
    const line = bits.filter(Boolean).join('   ·   ')
    ticker.textContent = line ? `${line}     ${line}` : ''
  }

  const cmp = data.compare || {}
  charts.compare?.setOption(barOption({
    categories: ['料肉比', '死淘率'],
    a: [num(cmp.fcr?.spotlight), num(cmp.mortality?.spotlight)],
    b: [num(cmp.fcr?.program), num(cmp.mortality?.program)],
    aName: '焦点',
    bName: '体系均值',
  }))
  charts.rate?.setOption(gaugeOption(kpis.detectRate))
  const ev = spot.eval || {}
  charts.inflam?.setOption(barOption({
    categories: ['IL-1β', 'IL-6', 'TNF-α', 'CRP'],
    a: [num(ev.IL1b), num(ev.IL6), num(ev.TNFa), num(ev.CRP)],
    b: [num(ev.IL1bCtrl), num(ev.IL6Ctrl), num(ev.TNFaCtrl), num(ev.CRPCtrl)],
    aName: '焦点',
    bName: '对照',
  }))
  charts.radar?.setOption(radarOption(spot.rings || []))
  charts.trend?.setOption(trendOption(data.trend))
}
