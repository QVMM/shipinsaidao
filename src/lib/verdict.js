/**
 * 批次能不能出证：快检/定量/炎症只在这里算一遍。
 * 页面只消费结果，不要各自再写一遍判定。
 * 市售对照阳性不拖累大蓟组：residueClear 只看大蓟样品与汇总字段。
 * 空值是待检，不是未过关。
 */

function filled(v) {
  return v !== '' && v != null
}

function resultClaimsClear(value) {
  return /未检出|未发现/.test(String(value || '').trim())
}

function resultClaimsFail(value) {
  const text = String(value || '').trim()
  if (!text || resultClaimsClear(text)) return false
  return /检出|超标|阳性/.test(text)
}

function sampleStatus(sample) {
  const q = String(sample?.qualitative || '').trim()
  const r = String(sample?.result || '').trim()
  if (!q && !r) return 'pending'
  if (q === '阳性' || q === '无效' || resultClaimsFail(r)) return 'fail'
  if (q === '阴性' && resultClaimsClear(r)) return 'clear'
  return 'pending'
}

/**
 * 是否属于大蓟鸡肉样品。
 * @param {object} sample
 * @returns {boolean}
 */
export function isThistleSample(sample) {
  const g = String(sample?.group || '')
  const id = String(sample?.id || '')
  return /大蓟/.test(g) || /^DJ-/i.test(id)
}

/**
 * 胶体金筛查：pending / clear / fail。空值不是 fail。
 * @param {object} state
 * @returns {'pending' | 'clear' | 'fail'}
 */
export function screenStatus(state) {
  const samples = state.screen?.samples
  if (Array.isArray(samples) && samples.length) {
    const thistle = samples.filter(isThistleSample)
    if (thistle.length) {
      const statuses = thistle.map(sampleStatus)
      if (statuses.includes('fail')) return 'fail'
      if (statuses.every((status) => status === 'clear')) return 'clear'
      return 'pending'
    }
  }
  const q = state.screen?.qualitative
  const r = String(state.screen?.result || '').trim()
  return sampleStatus({ qualitative: q, result: r })
}

/**
 * 快检或定量是否显示「药没检出」。只在金标已出阴性时为 true。
 * @param {object} state
 * @returns {boolean}
 */
export function residueClear(state) {
  return screenStatus(state) === 'clear'
}

/**
 * HPLC 字段。优先 screen，旧档案可能仍在 eval。
 * @param {object} state
 * @returns {{ instrument: unknown, curveR: unknown, lod: unknown, valueText: string, valueNum: unknown, unit: string, hplcDate: string, hplcOperator: string }}
 */
export function hplcOf(state) {
  const s = state.screen || {}
  const e = state.eval || {}
  const pick = (a, b) => (a !== '' && a != null ? a : b)
  return {
    instrument: s.instrument || e.instrument || '',
    curveR: pick(s.curveR, e.curveR),
    lod: pick(s.lod, e.lod),
    valueText: s.valueText || e.valueText || '',
    valueNum: pick(s.valueNum, e.valueNum),
    unit: s.unit || e.unit || 'μg/kg',
    hplcDate: s.hplcDate || e.testDate || '',
    hplcOperator: s.hplcOperator || e.operator || '',
  }
}

/**
 * @param {object} state
 * @returns {'pending' | 'clear' | 'fail'}
 */
export function hplcStatus(state) {
  const h = hplcOf(state)
  const text = String(h.valueText || '').trim()
  const hasNum = h.valueNum !== '' && h.valueNum != null
  if (!text && !hasNum) return 'pending'
  const lod = Number(h.lod)
  const validLod = Number.isFinite(lod) && lod > 0
  if (resultClaimsFail(text)) return 'fail'
  if (resultClaimsClear(text)) return validLod ? 'clear' : 'pending'
  if (hasNum && validLod) {
    const value = Number(h.valueNum)
    if (!Number.isFinite(value) || value < 0) return 'fail'
    return value < lod ? 'clear' : 'fail'
  }
  return 'fail'
}

/**
 * @param {object} state
 * @returns {boolean}
 */
export function hplcClear(state) {
  return hplcStatus(state) === 'clear'
}

/**
 * 四个炎症指标是否都明显低于常规对照。
 * 阈值 0.7：要比对照低三成才算「低炎症」，避免擦线也出高品质。
 * @param {object} state
 * @returns {boolean}
 */
export function lowInflammation(state) {
  const markers = inflammationMarkers(state)
  if (!markersComplete(markers)) return false
  return markers.every(([v, c]) => Number(v) < Number(c) * 0.7)
}

function inflammationMarkers(state) {
  const e = state.eval || {}
  return [
    [e.IL1b, e.IL1bCtrl],
    [e.IL6, e.IL6Ctrl],
    [e.TNFa, e.TNFaCtrl],
    [e.CRP, e.CRPCtrl],
  ]
}

function markersComplete(markers) {
  return markers.every(([value, control]) => {
    if (!filled(value) || !filled(control)) return false
    const v = Number(value)
    const c = Number(control)
    return Number.isFinite(v) && Number.isFinite(c) && v >= 0 && c > 0
  })
}

/**
 * @param {object} state
 * @returns {'pending' | 'clear' | 'fail'}
 */
export function inflamStatus(state) {
  const markers = inflammationMarkers(state)
  if (!markersComplete(markers)) return 'pending'
  return lowInflammation(state) ? 'clear' : 'fail'
}

/**
 * 日粮添加物是否写了大蓟（只认蓟，不认别的字）。
 * @param {object} state
 * @returns {boolean}
 */
export function fedThistle(state) {
  return /蓟/.test(state.farm?.additive || '')
}

/**
 * 用药本上饲用抗生素是否明确记录为未使用。
 * @param {object} state
 * @returns {boolean}
 */
export function noFeedAntibiotic(state) {
  const rows = state.farm?.medLog || []
  const hits = rows.filter((r) => /抗生素/.test(r.item || ''))
  if (!hits.length) return false
  return hits.every((r) => /^(未使用|未添加|无使用记录)$/.test(String(r.result || '').trim()))
}

function anyPending(state) {
  const medRows = state.farm?.medLog || []
  const hasAntibioticRecord = medRows.some((r) => /抗生素/.test(r.item || ''))
  return !String(state.farm?.additive || '').trim()
    || !hasAntibioticRecord
    || screenStatus(state) === 'pending'
    || hplcStatus(state) === 'pending'
    || inflamStatus(state) === 'pending'
}

/**
 * 没有封存字段时保持兼容；一旦服务端给出封存状态，链与现场快照都必须通过。
 * @param {object} state
 * @returns {boolean}
 */
export function sealIntegrityClear(state) {
  const seal = state?.seal
  if (!seal) return true
  return seal.okChain !== false && seal.okLive !== false
}

/**
 * 综合判定。报告印章用检验检测专用章 / 待出证 / 待复核。
 * @param {object} state
 * @returns {{ residue: string, inflam: string, quality: string, pass: boolean, label: string, stamp: string }}
 */
export function computeVerdict(state) {
  const ss = screenStatus(state)
  const hs = hplcStatus(state)
  const is = inflamStatus(state)
  const florfenicolLow = ss === 'clear' && hs === 'clear'
  const lowInflam = is === 'clear'
  const feedOk = fedThistle(state)
  const antibioticOk = noFeedAntibiotic(state)
  const residue = florfenicolLow ? '低残' : (ss === 'pending' || hs === 'pending' ? '待检' : '残留关注')
  const inflam = lowInflam ? '低炎症' : (is === 'pending' ? '待评价' : '炎症偏高')
  const pass = feedOk && antibioticOk && ss === 'clear' && hs === 'clear' && is === 'clear' && sealIntegrityClear(state)
  const quality = pass ? '高品质' : '待复核'
  let stamp = '待复核'
  if (pass && state.report?.generated) stamp = '检验检测专用章'
  else if (pass || anyPending(state)) stamp = '待出证'
  return {
    residue,
    inflam,
    quality,
    pass,
    label: `${residue} + ${inflam} + ${quality}`,
    stamp,
  }
}

/**
 * 报告与追溯共用的服务端签发门禁。页面可以展示原因，但不能绕过。
 * @param {object} state
 * @returns {{ ok: boolean, reasons: string[] }}
 */
export function issuanceGate(state) {
  const reasons = []
  if (state?.seal?.okChain === false) reasons.push('证据封存链未通过核验')
  if (state?.seal?.okLive === false) reasons.push('当前记录与封存快照不一致')
  if (!fedThistle(state)) reasons.push('日粮未明确记录大蓟')
  if (!noFeedAntibiotic(state)) reasons.push('饲用抗生素未明确记录为未使用')

  const ss = screenStatus(state)
  if (ss === 'pending') reasons.push('安全筛查尚未完成')
  else if (ss === 'fail') reasons.push('安全筛查未通过或记录相互矛盾')

  const hs = hplcStatus(state)
  if (hs === 'pending') reasons.push('HPLC 定量信息尚未完成')
  else if (hs === 'fail') reasons.push('HPLC 定量结果未通过')

  const is = inflamStatus(state)
  if (is === 'pending') reasons.push('四项炎症指标尚未完整录入')
  else if (is === 'fail') reasons.push('炎症指标未达到内控阈值')

  return { ok: reasons.length === 0, reasons }
}

/**
 * 给第一次打开的人看的结论。
 * @param {{ pass: boolean }} verdict
 * @param {object} [state]
 * @returns {string}
 */
export function humanHeadline(verdict, state) {
  if (state && !sealIntegrityClear(state)) return '证据封存待核验'
  if (state && anyPending(state)) return '检测尚未完成'
  if (!verdict.pass) return '尚未达到出证条件'
  if (!state?.report?.generated) return '检测合格，待出证'
  if (!state?.trace?.generated) return '已出证，待出码'
  return '合格准予上市'
}

/**
 * 结论下面那句说明。
 * @param {object} state
 * @param {{ pass: boolean }} verdict
 * @returns {string}
 */
export function humanWhy(state, verdict) {
  if (!sealIntegrityClear(state)) return '证据封存链或当前记录未通过一致性核验，暂不放行。'
  if (verdict.pass) return '本批次未使用饲用抗生素，氟苯尼考未检出。'
  const ss = screenStatus(state)
  const hs = hplcStatus(state)
  const is = inflamStatus(state)
  const bits = []
  if (!fedThistle(state)) bits.push('日粮尚未明确记录大蓟')
  if (!noFeedAntibiotic(state)) bits.push('饲用抗生素缺少明确的未使用记录或已有使用记录')
  if (ss === 'pending' || hs === 'pending') bits.push('安全检测尚未完成')
  else if (ss === 'fail') bits.push('兽药筛查未过关')
  else if (hs === 'fail' && ss === 'clear') bits.push('实验室定量未过关')
  if (is === 'pending') bits.push('炎症评价尚未完成')
  else if (ss === 'clear' && hs === 'clear' && noFeedAntibiotic(state) && is === 'fail') {
    bits.push('炎症因子未达标，须复核后再出证')
  }
  return bits.length ? `${bits.join('；')}。` : '尚有指标未过关，暂不出证。'
}

/**
 * 首页与客户端展示的事实条。氟苯尼考与炎症因子拆开。pending 用 wait，不说未过关。
 * @param {object} state
 * @returns {{ ok: boolean, wait?: boolean, text: string }[]}
 */
export function threeFacts(state) {
  const thistle = fedThistle(state)
  const noAbx = noFeedAntibiotic(state)
  const ss = screenStatus(state)
  const is = inflamStatus(state)
  return [
    { ok: thistle, text: thistle ? '饲喂大蓟粗提物' : '日粮尚未记录大蓟' },
    { ok: noAbx, text: noAbx ? '饲用抗生素未使用' : '饲用抗生素未清零' },
    {
      ok: ss === 'clear',
      wait: ss === 'pending',
      text: ss === 'clear' ? '氟苯尼考未检出' : ss === 'pending' ? '氟苯尼考待检' : '氟苯尼考需复核',
    },
    {
      ok: is === 'clear',
      wait: is === 'pending',
      text: is === 'clear' ? '炎症因子达标' : is === 'pending' ? '炎症待评价' : '炎症因子未达标',
    },
  ]
}

/**
 * 安全检测页开头说明，分钟数跟录入走。
 * @param {object} state
 * @returns {string}
 */
export function screenHuman(state) {
  const q = state.screen?.qualitative
  const r = String(state.screen?.result || '').trim()
  if (!q && !r) return '尚未筛查'
  const mins = Number(state.screen.mdspeMin) + Number(state.screen.goldMin)
  const minsText = Number.isFinite(mins) ? `${mins} 分钟` : ''
  if (q === '无效') {
    return minsText ? `${minsText}筛查无效，试纸不能用，须重做。` : '筛查无效，试纸不能用，须重做。'
  }
  if (residueClear(state) && q === '阴性') {
    return minsText ? `${minsText}筛完：大蓟组未检出兽药。` : '大蓟组未检出兽药。'
  }
  if (q === '阳性' || screenStatus(state) === 'fail') {
    return minsText ? `${minsText}筛查未通过，本批次暂不出证。` : '筛查未通过，本批次暂不出证。'
  }
  return minsText ? `${minsText}筛查结果：${state.screen.result}。` : `筛查结果：${state.screen.result}。`
}

/**
 * 评价页开头说明。
 * @param {object} state
 * @param {{ pass: boolean }} verdict
 * @returns {string}
 */
export function evalHuman(state, verdict) {
  const is = inflamStatus(state)
  if (is === 'pending') return '炎症评价尚未完成。'
  const inflam = is === 'clear'
  if (inflam && verdict.pass) return '炎症因子优于常规对照。'
  if (inflam && !verdict.pass) return '炎症已过关，仍有指标未达出证条件。'
  return '炎症因子尚未达标，须复核后再出证。'
}

/**
 * 事实条 CSS class。
 * @param {{ ok: boolean, wait?: boolean }} item
 * @returns {string}
 */
export function factClass(item) {
  if (item.ok) return 'ok'
  if (item.wait) return 'wait'
  return 'bad'
}
