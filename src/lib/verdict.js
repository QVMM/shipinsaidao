/**
 * 批次能不能出证：快检/定量/炎症只在这里算一遍。
 * 页面只消费结果，不要各自再写一遍判定。
 * 市售对照阳性不拖累大蓟组：residueClear 只看大蓟样品与汇总字段。
 * 空值是待检，不是未过关。
 */

function filled(v) {
  return v !== '' && v != null
}

function sampleUsable(sample) {
  const q = sample?.qualitative
  const r = String(sample?.result || '').trim()
  return q === '阴性' || q === '阳性' || q === '无效' || r.length > 0
}

function sampleClear(sample) {
  return sample?.qualitative === '阴性' || String(sample?.result || '').includes('未检出')
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
      if (thistle.some((s) => sampleUsable(s) && !sampleClear(s))) return 'fail'
      if (thistle.every(sampleClear)) return 'clear'
      return 'pending'
    }
  }
  const q = state.screen?.qualitative
  const r = String(state.screen?.result || '').trim()
  if (q === '阴性' || r.includes('未检出')) return 'clear'
  if (q === '阳性' || q === '无效' || r.length > 0) return 'fail'
  return 'pending'
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
  if (text.includes('未检出') || text.includes('<')) return 'clear'
  const lod = h.lod
  if (hasNum && lod !== '' && lod != null && Number(h.valueNum) < Number(lod)) return 'clear'
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
  const e = state.eval || {}
  const markers = [
    [e.IL1b, e.IL1bCtrl],
    [e.IL6, e.IL6Ctrl],
    [e.TNFa, e.TNFaCtrl],
    [e.CRP, e.CRPCtrl],
  ]
  return markers.every(([v, c]) => Number(v) < Number(c) * 0.7)
}

/**
 * @param {object} state
 * @returns {'pending' | 'clear' | 'fail'}
 */
export function inflamStatus(state) {
  const e = state.eval || {}
  if (!filled(e.IL6) || !filled(e.IL6Ctrl)) return 'pending'
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
 * 用药本上饲用抗生素是否未使用。没有相关行也视为未使用。
 * @param {object} state
 * @returns {boolean}
 */
export function noFeedAntibiotic(state) {
  const rows = state.farm?.medLog || []
  const hits = rows.filter((r) => /抗生素/.test(r.item || ''))
  if (!hits.length) return true
  return hits.every((r) => /未使用|未添加|无|—|-/.test(r.result || ''))
}

function anyPending(state) {
  return screenStatus(state) === 'pending' || hplcStatus(state) === 'pending' || inflamStatus(state) === 'pending'
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
  const residue = florfenicolLow ? '低残' : (ss === 'pending' || hs === 'pending' ? '待检' : '残留关注')
  const inflam = lowInflam ? '低炎症' : (is === 'pending' ? '待评价' : '炎症偏高')
  const pass = ss === 'clear' && hs === 'clear' && is === 'clear'
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
 * 给第一次打开的人看的结论。
 * @param {{ pass: boolean }} verdict
 * @param {object} [state]
 * @returns {string}
 */
export function humanHeadline(verdict, state) {
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
  if (verdict.pass) return '本批次未使用饲用抗生素，氟苯尼考未检出。'
  const ss = screenStatus(state)
  const hs = hplcStatus(state)
  const is = inflamStatus(state)
  const bits = []
  if (!noFeedAntibiotic(state)) bits.push('用药记录仍有饲用抗生素')
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
