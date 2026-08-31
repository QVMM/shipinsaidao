/**
 * 批次能不能出证：快检/定量/炎症只在这里算一遍。
 * 页面只消费结果，不要各自再写一遍判定。
 * 市售对照阳性不拖累大蓟组：residueClear 只看大蓟样品与汇总字段。
 */

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
 * 快检或定量是否显示「药没检出」。
 * 有样品数组时只看大蓟组；质控组、市售对照不参与出证。
 * @param {object} state
 * @returns {boolean}
 */
export function residueClear(state) {
  const samples = state.screen?.samples
  if (Array.isArray(samples) && samples.length) {
    const thistle = samples.filter(isThistleSample)
    if (thistle.length) {
      return thistle.every((s) => {
        const q = s.qualitative === '阴性'
        const text = String(s.result || '').includes('未检出')
        return q || text
      })
    }
  }
  const q = state.screen.qualitative === '阴性'
  const text = String(state.screen.result || '').includes('未检出')
  const evalText = String(state.eval.valueText || '')
  const evalClear = evalText.includes('未检出') || evalText.includes('<')
  const num = state.eval.valueNum
  const belowLod = num !== '' && Number(num) < Number(state.eval.lod)
  return q || text || evalClear || belowLod
}

/**
 * 四个炎症指标是否都明显低于常规对照。
 * 阈值 0.7：要比对照低三成才算「低炎症」，避免擦线也出高品质。
 * @param {object} state
 * @returns {boolean}
 */
export function lowInflammation(state) {
  const markers = [
    [state.eval.IL1b, state.eval.IL1bCtrl],
    [state.eval.IL6, state.eval.IL6Ctrl],
    [state.eval.TNFa, state.eval.TNFaCtrl],
    [state.eval.CRP, state.eval.CRPCtrl],
  ]
  return markers.every(([v, c]) => Number(v) < Number(c) * 0.7)
}

/**
 * 日粮添加物是否写了大蓟（只认蓟，不认别的字）。
 * @param {object} state
 * @returns {boolean}
 */
export function fedThistle(state) {
  return /蓟/.test(state.farm.additive || '')
}

/**
 * 用药本上饲用抗生素是否未使用。没有相关行也视为未使用。
 * @param {object} state
 * @returns {boolean}
 */
export function noFeedAntibiotic(state) {
  const rows = state.farm.medLog || []
  const hits = rows.filter((r) => /抗生素/.test(r.item || ''))
  if (!hits.length) return true
  return hits.every((r) => /未使用|未添加|无|—|-/.test(r.result || ''))
}

/**
 * 综合判定。报告印章用检验检测专用章 / 待复核。
 * @param {object} state
 * @returns {{ residue: string, inflam: string, quality: string, pass: boolean, label: string, stamp: string }}
 */
export function computeVerdict(state) {
  const florfenicolLow = residueClear(state)
  const lowInflam = lowInflammation(state)
  const residue = florfenicolLow ? '低残' : '残留关注'
  const inflam = lowInflam ? '低炎症' : '炎症偏高'
  const quality = florfenicolLow && lowInflam ? '高品质' : '待复核'
  const pass = florfenicolLow && lowInflam
  return {
    residue,
    inflam,
    quality,
    pass,
    label: `${residue} + ${inflam} + ${quality}`,
    stamp: pass ? '检验检测专用章' : '待复核',
  }
}

/**
 * 给第一次打开的人看的结论。
 * @param {{ pass: boolean }} verdict
 * @returns {string}
 */
export function humanHeadline(verdict) {
  return verdict.pass ? '合格准予上市' : '尚未达到出证条件'
}

/**
 * 结论下面那句说明。
 * @param {object} state
 * @param {{ pass: boolean }} verdict
 * @returns {string}
 */
export function humanWhy(state, verdict) {
  if (verdict.pass) return '本批次未使用饲用抗生素，氟苯尼考未检出。'
  const bits = []
  if (!noFeedAntibiotic(state)) bits.push('用药记录仍有饲用抗生素')
  if (!residueClear(state)) bits.push('兽药筛查或定量未过关')
  if (residueClear(state) && noFeedAntibiotic(state) && !lowInflammation(state)) {
    bits.push('炎症因子未达标，须复核后再出证')
  }
  return bits.length ? `${bits.join('；')}。` : '尚有指标未过关，暂不出证。'
}

/**
 * 首页与客户端展示的事实条。氟苯尼考与炎症因子拆开。
 * @param {object} state
 * @returns {{ ok: boolean, text: string }[]}
 */
export function threeFacts(state) {
  const residue = residueClear(state)
  const inflam = lowInflammation(state)
  const thistle = fedThistle(state)
  const noAbx = noFeedAntibiotic(state)
  return [
    { ok: thistle, text: thistle ? '饲喂大蓟粗提物' : '日粮尚未记录大蓟' },
    { ok: noAbx, text: noAbx ? '饲用抗生素未使用' : '饲用抗生素未清零' },
    { ok: residue, text: residue ? '氟苯尼考未检出' : '氟苯尼考需复核' },
    { ok: inflam, text: inflam ? '炎症因子达标' : '炎症因子未达标' },
  ]
}

/**
 * 安全检测页开头说明，分钟数跟录入走。
 * @param {object} state
 * @returns {string}
 */
export function screenHuman(state) {
  const mins = Number(state.screen.mdspeMin) + Number(state.screen.goldMin)
  if (state.screen.qualitative === '无效') {
    return `${mins} 分钟筛查无效，试纸不能用，须重做。`
  }
  if (residueClear(state) && state.screen.qualitative === '阴性') {
    return `${mins} 分钟筛完：大蓟组未检出兽药。`
  }
  if (state.screen.qualitative === '阳性' || !residueClear(state)) {
    return `${mins} 分钟筛查未通过，本批次暂不出证。`
  }
  return `${mins} 分钟筛查结果：${state.screen.result}。`
}

/**
 * 评价页开头说明。
 * @param {object} state
 * @param {{ pass: boolean }} verdict
 * @returns {string}
 */
export function evalHuman(state, verdict) {
  const r = residueClear(state)
  if (r && verdict.pass) return '实验室定量未检出氟苯尼考。炎症因子优于常规对照。'
  if (r && !verdict.pass) return '残留已过关，炎症因子尚未达标，须复核后再出证。'
  return '实验室定量未过关，暂不出证明。'
}
