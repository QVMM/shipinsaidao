/** 人机料法环测：安全检测页与指挥舱共用。 */

export const LAB_STATUS = [
  { key: 'person', label: '人员考核合格', short: '人', ok: true },
  { key: 'machine', label: '设备在线', short: '机', ok: true, pulse: true },
  { key: 'material', label: '试剂有库', short: '料', ok: true },
  { key: 'method', label: '方法 MDSPE+胶体金', short: '法', ok: true },
  { key: 'env', label: '环境在控', short: '环', ok: true },
  { key: 'qc', label: '质控线正常', short: '测', ok: true, pulse: true },
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
    body: '出栏前抽检 · MDSPE 前处理 40 分钟 + 胶体金 5 分钟。',
  },
  fix: {
    title: '失误整改',
    body: '质控线未显色 → 已整改',
    status: '已整改',
  },
  now: {
    post: '安全检测',
    sample: 'DJ-0812-02',
    sampleState: '读数中',
  },
  log: [
    { at: '08:40', post: '养殖岗', line: '提交出栏计划 8000 羽' },
    { at: '09:05', post: '检测岗', line: '质控线未显色，已更换试纸' },
    { at: '09:20', post: '检测岗', line: '接收并完成大蓟组筛查' },
    { at: '14:40', post: '评价岗', line: 'HPLC 与炎症评价完成' },
    { at: '16:20', post: '溯源岗', line: '已出证、已出码、已上市' },
  ],
}

/**
 * 指挥舱检测过程：一条 LIVE 状态条，五件事压成芯片。
 * @returns {string}
 */
export function renderLabDock() {
  const last = LAB_PROCESS.log[LAB_PROCESS.log.length - 1]
  const now = LAB_PROCESS.now
  return `
    <div class="lab-dock" data-lab-dock>
      <span class="lab-now-tag">NOW</span>
      <span class="lab-chip" data-lab-post title="${LAB_PROCESS.trigger.body}">当前岗 ${now.post}</span>
      <span class="lab-chip is-live" data-lab-sample>当前样 ${now.sample} ${now.sampleState}</span>
      ${renderLabStatus('lab-5m-dock')}
      <span class="lab-chip lab-fix" title="${LAB_PROCESS.risk.body}">失误 ${LAB_PROCESS.fix.body}</span>
      <span class="lab-chip lab-log-one"><time>${last.at}</time> ${last.post} ${last.line}</span>
    </div>
  `
}
