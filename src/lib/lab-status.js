/** 检测岗条件：指挥舱用短名，安全检测页用完整句。 */

export const LAB_STATUS = [
  { key: 'person', label: '检测员已考核', short: '检测员', ok: true },
  { key: 'machine', label: '仪器在线', short: '仪器', ok: true, pulse: true },
  { key: 'material', label: '试剂齐备', short: '试剂', ok: true },
  { key: 'method', label: '方法 MDSPE+胶体金', short: '方法', ok: true },
  { key: 'env', label: '环境达标', short: '环境', ok: true },
  { key: 'qc', label: '读数有效，T深于C', short: '读数', ok: true, pulse: true },
]

/**
 * @param {string} [extraClass]
 * @returns {string}
 */
export function renderLabStatus(extraClass = '') {
  const dock = /\bdock\b/.test(extraClass) || extraClass.includes('lab-5m-dock')
  return `
    <ul class="lab-5m ${extraClass}">
      ${LAB_STATUS.map((s) => `
        <li class="${s.ok ? 'ok' : 'bad'}${s.pulse && dock ? ' is-pulse' : ''}" title="${s.label}">
          <i></i>
          <span>${dock ? s.short : s.label}</span>
        </li>
      `).join('')}
    </ul>
  `
}

export const LAB_PROCESS = {
  risk: {
    title: '检测前风险预警',
    body: '市售鸡肉存在氟苯尼考滥用风险。出栏前须完成筛查，阳性批次不得出证。',
  },
  trigger: {
    title: '触发检测',
    body: '出栏前抽检。',
  },
  fix: {
    title: '失误整改',
    body: '质控线未显色，已换试纸',
    status: '已整改',
  },
  now: {
    post: '安全检测',
    sample: 'DJ-0812-02',
    sampleState: '读数中',
    group: '大蓟组',
  },
  assay: [
    { id: 'draw', label: '抽检', hint: '出栏前抽样', state: 'done' },
    { id: 'prep', label: '前处理', hint: '把肉样处理好', state: 'done' },
    { id: 'read', label: '读卡', hint: '仪器正在读这张卡', state: 'on' },
    { id: 'call', label: '判定', hint: '出未检出或阳性', state: 'wait' },
  ],
  handoff: [
    { post: '养殖', line: '鸡已送来', state: 'done' },
    { post: '检测', line: '正在读卡', state: 'on' },
    { post: '评价', line: '炎症已出', state: 'done' },
    { post: '溯源', line: '可扫码', state: 'done' },
  ],
  log: [
    { at: '08:40', post: '养殖岗', line: '提交出栏计划 8000 羽' },
    { at: '09:05', post: '检测岗', line: '质控线未显色，已更换试纸' },
    { at: '09:20', post: '检测岗', line: '接收并完成大蓟组筛查' },
    { at: '14:40', post: '评价岗', line: 'HPLC 与炎症评价完成' },
    { at: '16:20', post: '溯源岗', line: '已出证、已出码、已上市' },
  ],
}

function condIcon(key) {
  const a = 'class="lab-ci" viewBox="0 0 24 24" fill="none" aria-hidden="true"'
  if (key === 'person') {
    return `<svg ${a}><circle cx="12" cy="8" r="3.2" stroke="currentColor" stroke-width="1.6"/><path d="M6 19c.8-3.2 2.8-5 6-5s5.2 1.8 6 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`
  }
  if (key === 'machine') {
    return `<svg ${a}><rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M8 9h8M8 12h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`
  }
  if (key === 'material') {
    return `<svg ${a}><path d="M9 4h6M10 4v3l-3.5 9.5A2.4 2.4 0 0 0 8.8 20h6.4a2.4 2.4 0 0 0 2.3-3.5L14 7V4" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`
  }
  if (key === 'method') {
    return `<svg ${a}><path d="M7 4h8l3 3v13H7V4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M15 4v3h3M9 12h6M9 15h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`
  }
  if (key === 'env') {
    return `<svg ${a}><path d="M10 13.5V7.2a2 2 0 1 1 4 0v6.3a3.2 3.2 0 1 1-4 0z" stroke="currentColor" stroke-width="1.6"/><path d="M12 8.5v5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`
  }
  return `<svg ${a}><path d="M5 16l3.2-3.2 2.4 2.2L15 9l4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 19h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`
}

/**
 * 从焦点批次推导检测舱。样本号 / 定性随档案走。
 * @param {object} [live]
 * @returns {{ sample: string, group: string, sampleState: string, callLabel: string, callValue: string, callNote: string, assay: object[], handoff: object[], reading: boolean }}
 */
export function labDockFromLive(live = {}) {
  const sample = String(live.sampleId || '').trim() || '待抽检'
  const qualitative = String(live.qualitative || '').trim()
  const result = String(live.result || '').trim()
  const called = qualitative === '阴性' || qualitative === '阳性' || qualitative === '无效' || !!result
  const reading = !called && sample !== '待抽检'
  const assay = [
    { id: 'draw', label: '抽检', hint: '出栏前抽样', state: sample !== '待抽检' || called ? 'done' : 'wait' },
    { id: 'prep', label: '前处理', hint: '把肉样处理好', state: called || reading ? 'done' : 'wait' },
    { id: 'read', label: '读卡', hint: '仪器正在读这张卡', state: called ? 'done' : (reading ? 'on' : 'wait') },
    { id: 'call', label: '判定', hint: '出未检出或阳性', state: called ? 'done' : 'wait' },
  ]
  const evalDone = !!live.evalDone
  const report = !!live.reportGenerated
  const trace = !!live.traceGenerated
  const handoff = [
    { post: '养殖', line: '鸡已送来', state: 'done' },
    { post: '检测', line: called ? (result || qualitative) : (reading ? '正在读卡' : '待检'), state: called ? 'done' : (reading ? 'on' : 'wait') },
    { post: '评价', line: evalDone ? '炎症已出' : '待评价', state: evalDone ? 'done' : 'wait' },
    { post: '溯源', line: trace ? '可扫码' : (report ? '已出证' : '待出证'), state: trace || report ? 'done' : 'wait' },
  ]
  let callValue = '待读'
  let callNote = ''
  if (qualitative === '阴性' || String(result).includes('未检出')) {
    callValue = qualitative || '阴性'
    callNote = result || '未检出'
  } else if (qualitative === '阳性' || qualitative === '无效' || result) {
    callValue = qualitative || '阳性'
    callNote = result
  } else if (reading) {
    callValue = '读数中'
    callNote = live.qcLine ? String(live.qcLine).slice(0, 12) : 'T深于C'
  }
  return {
    sample,
    group: live.group || '大蓟组',
    sampleState: called ? (result || qualitative) : (reading ? '读数中' : '待抽检'),
    callLabel: called ? '判定' : '读数',
    callValue,
    callNote,
    assay,
    handoff,
    reading,
    headline: called ? '本张卡已判定' : (reading ? '正在读这张卡' : '等待抽检'),
  }
}

/**
 * 指挥舱检测过程：样本舱 + 四步过检 + 岗上条件 + 三岗交接。
 * @param {object} [live]
 * @returns {string}
 */
export function renderLabDock(live = {}) {
  const now = labDockFromLive(live)
  const assay = now.assay.map((s) => `
    <li class="lab-step is-${s.state}" title="${s.hint || ''}">
      <i></i>
      <span>${s.label}</span>
    </li>
  `).join('')
  const conds = LAB_STATUS.map((s) => `
    <li class="${s.ok ? 'ok' : 'bad'}${s.pulse ? ' is-pulse' : ''}" title="${s.label}">
      ${condIcon(s.key)}
      <span>${s.short}</span>
    </li>
  `).join('')
  const hand = now.handoff.map((h) => `
    <li class="is-${h.state}">
      <b>${h.post}</b>
      <span>${h.line}</span>
    </li>
  `).join('')
  const fix = live.showFix ? LAB_PROCESS.fix.body : LAB_PROCESS.risk.title
  return `
    <div class="lab-dock" data-lab-dock>
      <div class="lab-bay">
        <div class="lab-specimen">
          <span class="lab-well" aria-hidden="true"><i></i></span>
          <div class="lab-spec-copy">
            <em>${now.headline}</em>
            <b class="dig">${now.sample}</b>
            <span>${now.group} · ${now.sampleState}</span>
          </div>
        </div>
        <ol class="lab-assay">${assay}</ol>
        <div class="lab-call">
          <em>${now.callLabel}</em>
          <b>${now.callValue}</b>
          <span>${now.callNote}</span>
        </div>
      </div>
      <div class="lab-bay-2">
        <ul class="lab-conds">${conds}</ul>
        <ol class="lab-handoff">${hand}</ol>
        <span class="lab-fix-pill" title="${LAB_PROCESS.risk.body}">${fix}</span>
      </div>
    </div>
  `
}
