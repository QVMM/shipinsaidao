/**
 * 指挥舱体系批次。焦点 蓟化-2026-0812 仍走 DEMO_SEED，这里是另外 11 批。
 * 批次号只许 蓟化-YYYY-MMDD。药材只写大蓟。
 */
import { DEMO_SEED } from './data.js'
import { makeDemoHouseEnv } from './lib/house-env.js'

const EMPTY_SCREEN = {
  sampleId: '',
  sampleDate: '',
  samplePart: '',
  method: '',
  mdspeMin: '',
  goldMin: '',
  target: '氟苯尼考',
  qualitative: '',
  result: '',
  lodNote: '',
  operator: '',
  qcLine: '',
  notes: '',
  instrument: '',
  curveR: '',
  lod: '',
  valueText: '',
  valueNum: '',
  unit: 'μg/kg',
  hplcDate: '',
  hplcOperator: '',
}

const EMPTY_EVAL = {
  IL1b: '',
  IL1bCtrl: '',
  IL6: '',
  IL6Ctrl: '',
  TNFa: '',
  TNFaCtrl: '',
  CRP: '',
  CRPCtrl: '',
  shannon: '',
  shannonCtrl: '',
  lactoChange: '',
  ecoliChange: '',
}

/**
 * @param {string} iso
 * @param {number} days
 * @returns {string}
 */
function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  const p = (n) => String(n).padStart(2, '0')
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`
}

/**
 * @param {string} batchId
 * @returns {string}
 */
function slaughterOf(batchId) {
  const m = /^蓟化-(\d{4})-(\d{2})(\d{2})$/.exec(batchId)
  if (!m) return '2026-08-12'
  return `${m[1]}-${m[2]}-${m[3]}`
}

/**
 * @param {string} stockDate
 */
function medLog(stockDate) {
  return [
    { date: stockDate, item: '大蓟粗提物', dose: '常规 5000 mg/kg（0.5%） / 应激 10000 mg/kg（1%）', purpose: '替抗提质、抗炎抑菌', result: '全程执行' },
    { date: addDays(stockDate, 1), item: '新城疫 / 法氏囊疫苗', dose: '按日龄规程', purpose: '基础免疫', result: '已执行' },
    { date: addDays(stockDate, 13), item: '球虫疫苗', dose: '按规程', purpose: '球虫防控（非抗菌药）', result: '已执行' },
    { date: addDays(stockDate, 26), item: '饲用抗生素', dose: '—', purpose: '—', result: '未使用' },
  ]
}

/**
 * @param {string} sampleDate
 * @param {string} sampleId
 */
function clearScreen(sampleDate, sampleId) {
  return {
    sampleId,
    sampleDate,
    samplePart: '胸肌 / 肝脏混样',
    method: '磁性分散固相萃取（MDSPE）+ 胶体金',
    mdspeMin: 40,
    goldMin: 5,
    target: '氟苯尼考',
    qualitative: '阴性',
    result: '未检出',
    lodNote: '胶体金筛查限与方法检出限对齐：50 μg/kg',
    operator: '2 号 安全检测工程师',
    qcLine: '质控线显色正常，检测线深于质控线（T深于C）',
    notes: 'MDSPE 甲醇-水交替活化磁珠，提取液澄清，基质干扰低。',
    instrument: 'HPLC',
    curveR: 0.999,
    lod: 50,
    valueText: '未检出（<50）',
    valueNum: '',
    unit: 'μg/kg',
    hplcDate: String(sampleDate || '').slice(0, 10) + ' 14:40',
    hplcOperator: '3 号 分析测试工程师',
  }
}

/**
 * @param {string} testDate
 * @param {object} [tweak]
 */
function goodEval(testDate, tweak = {}) {
  return {
    IL1b: 19.2,
    IL1bCtrl: 46.2,
    IL6: 24,
    IL6Ctrl: 58.7,
    TNFa: 16.4,
    TNFaCtrl: 41.3,
    CRP: 1.4,
    CRPCtrl: 4.6,
    shannon: 3.3,
    shannonCtrl: 2.71,
    lactoChange: 24,
    ecoliChange: -36,
    ...tweak,
  }
}

/**
 * @param {string} batchId
 * @param {string} at
 */
function doneReport(batchId, at) {
  const tail = String(batchId).replace(/\D/g, '').slice(-8) || '20260812'
  return { generated: true, generatedAt: at, no: `THJH-${tail}-001` }
}

/**
 * @param {string} batchId
 * @param {string} at
 */
function doneTrace(batchId, at) {
  return { generated: true, generatedAt: at, verifyId: `TR-8F2C-${String(batchId).slice(-4)}` }
}

/**
 * @param {{ batchId: string, stage: string, farm?: object, screen?: object, eval?: object, report?: object, trace?: object, program?: object }} spec
 */
function batch(spec) {
  const id = spec.batchId
  const slaughter = slaughterOf(id)
  const stock = addDays(slaughter, -51)
  const hatch = addDays(stock, -1)
  const farm = {
    ...DEMO_SEED.farm,
    hatchDate: hatch,
    stockDate: stock,
    plannedSlaughter: slaughter,
    flockId: `FL-${id.replace('蓟化-', '')}`,
    density: '10 只/m²',
    feedBrand: '替抗蓟化定制日粮',
    additive: '大蓟粗提物',
    dose: '5000 mg/kg 饲料（0.5%）',
    doseStartDay: 1,
    feedNote: '全程添加，替代饲用抗生素；疫苗免疫按规程执行。',
    fcr: '',
    fcrControl: 1.65,
    mortality: '',
    mortalityControl: 4.4,
    medLog: medLog(stock),
    houseEnv: makeDemoHouseEnv(stock, id),
    ...(spec.farm || {}),
  }
  if (!Array.isArray(farm.medLog)) farm.medLog = medLog(stock)
  return {
    ...DEMO_SEED,
    batchId: id,
    farm,
    screen: { ...EMPTY_SCREEN, ...(spec.screen || {}) },
    eval: { ...EMPTY_EVAL, ...(spec.eval || {}) },
    report: { generated: false, generatedAt: '', no: '', ...(spec.report || {}) },
    trace: { generated: false, generatedAt: '', verifyId: '', ...(spec.trace || {}) },
    program: {
      ...DEMO_SEED.program,
      pipelineStage: spec.stage,
      listed: spec.stage === 'market',
      ...(spec.program || {}),
    },
  }
}

/** 11 批体系鸡，和焦点 0812 一起铺满六站。 */
export const FLEET_SEEDS = [
  batch({
    batchId: '蓟化-2026-0828',
    stage: 'farming',
    farm: {
      name: '荥阳贾峪合作鸡场',
      partners: '双汇集团、荥阳市农业农村局',
      location: '河南省郑州市荥阳市贾峪镇',
      house: '12 号密闭鸡舍',
      breed: '白羽肉鸡（AA+）',
      count: 2800,
      plannedSlaughter: '2026-09-12',
    },
  }),
  batch({
    batchId: '蓟化-2026-0826',
    stage: 'farming',
    farm: {
      name: '中牟官渡养殖单元',
      partners: '双汇集团、中牟县畜牧站',
      location: '河南省郑州市中牟县官渡镇',
      house: '5 号密闭鸡舍',
      breed: '白羽肉鸡（AA+）',
      count: 4200,
      plannedSlaughter: '2026-09-08',
    },
  }),
  batch({
    batchId: '蓟化-2026-0824',
    stage: 'farming',
    farm: {
      name: '新郑龙王试验舍',
      partners: '替抗蓟化试验点',
      location: '河南省郑州市新郑市龙王镇',
      house: '1 号密闭鸡舍',
      breed: '白羽肉鸡（罗斯 308）',
      count: 3600,
      plannedSlaughter: '2026-09-05',
    },
  }),
  batch({
    batchId: '蓟化-2026-0820',
    stage: 'screening',
    farm: {
      name: '巩义回郭养殖点',
      partners: '双汇集团、巩义市畜牧中心',
      location: '河南省郑州市巩义市回郭镇',
      house: '6 号密闭鸡舍',
      breed: '白羽肉鸡（AA+）',
      count: 5100,
      fcr: 1.62,
      mortality: 2.6,
    },
    screen: {
      sampleId: 'QC-0820-01',
      sampleDate: '2026-08-20 08:40',
      samplePart: '胸肌 / 肝脏混样',
      method: '磁性分散固相萃取（MDSPE）+ 胶体金',
      mdspeMin: 40,
      goldMin: 5,
      target: '氟苯尼考',
      operator: '2 号 安全检测工程师',
      notes: '磁珠已活化，试纸待读。',
    },
  }),
  batch({
    batchId: '蓟化-2026-0818',
    stage: 'evaluating',
    farm: {
      name: '荥阳康店合作鸡场',
      partners: '双汇集团、郑州市农村发展中心',
      location: '河南省郑州市荥阳市康店镇',
      house: '2 号密闭鸡舍',
      breed: '白羽肉鸡（AA+）',
      count: 6400,
      fcr: 1.6,
      mortality: 2.4,
    },
    screen: clearScreen('2026-08-18 09:10', 'QC-0818-02'),
    eval: goodEval('2026-08-18 15:20', { curveR: 0.9988, IL6: 25.4, IL1b: 20.1 }),
  }),
  batch({
    batchId: '蓟化-2026-0816',
    stage: 'reporting',
    farm: {
      name: '登封告成养殖基地',
      partners: '双汇集团、登封市农业农村局',
      location: '河南省郑州市登封市告成镇',
      house: '4 号密闭鸡舍',
      breed: '白羽肉鸡（AA+）',
      count: 7200,
      fcr: 1.6,
      mortality: 2.3,
    },
    screen: clearScreen('2026-08-16 09:00', 'QC-0816-01'),
    eval: goodEval('2026-08-16 14:50', { curveR: 0.9991, IL6: 23.6 }),
  }),
  batch({
    batchId: '蓟化-2026-0814',
    stage: 'tracing',
    farm: {
      name: '新密曲梁养殖单元',
      partners: '双汇集团、新密市畜牧站',
      location: '河南省郑州市新密市曲梁镇',
      house: '7 号密闭鸡舍',
      breed: '白羽肉鸡（罗斯 308）',
      count: 6800,
      fcr: 1.61,
      mortality: 2.5,
    },
    screen: clearScreen('2026-08-14 08:50', 'QC-0814-04'),
    eval: goodEval('2026-08-14 15:10', { curveR: 0.9989, IL6: 26.1, IL1b: 21 }),
    report: doneReport('蓟化-2026-0814', '2026-08-14 16:20'),
    trace: doneTrace('蓟化-2026-0814', '2026-08-14 16:40'),
    program: { pipelineStage: 'tracing', listed: false },
  }),
  batch({
    batchId: '蓟化-2026-0808',
    stage: 'market',
    farm: {
      name: '中牟雁鸣湖养殖基地',
      partners: '双汇集团、中牟县农村发展中心',
      location: '河南省郑州市中牟县雁鸣湖镇',
      house: '8 号密闭鸡舍',
      breed: '白羽肉鸡（AA+）',
      count: 8600,
      fcr: 1.59,
      mortality: 2,
    },
    screen: clearScreen('2026-08-08 09:30', 'QC-0808-02'),
    eval: goodEval('2026-08-08 15:00', { curveR: 0.9993, IL6: 21.8, IL1b: 17.9 }),
    report: doneReport('蓟化-2026-0808', '2026-08-08 16:10'),
    trace: doneTrace('蓟化-2026-0808', '2026-08-08 16:30'),
  }),
  batch({
    batchId: '蓟化-2026-0802',
    stage: 'market',
    farm: {
      name: '荥阳高村养殖点',
      partners: '双汇集团、荥阳市畜牧中心',
      location: '河南省郑州市荥阳市高村乡',
      house: '9 号密闭鸡舍',
      breed: '白羽肉鸡（AA+）',
      count: 9000,
      fcr: 1.63,
      mortality: 2.5,
    },
    screen: clearScreen('2026-08-02 09:15', 'QC-0802-01'),
    eval: goodEval('2026-08-02 14:40', { curveR: 0.9987, IL6: 27.2, IL1b: 22.4 }),
    report: doneReport('蓟化-2026-0802', '2026-08-02 16:00'),
    trace: doneTrace('蓟化-2026-0802', '2026-08-02 16:20'),
  }),
  batch({
    batchId: '蓟化-2026-0810',
    stage: 'alert',
    farm: {
      name: '巩义芝田养殖单元',
      partners: '双汇集团、巩义市农业农村局',
      location: '河南省郑州市巩义市芝田镇',
      house: '11 号密闭鸡舍',
      breed: '白羽肉鸡（AA+）',
      count: 3300,
      fcr: 1.68,
      mortality: 3.9,
    },
    screen: clearScreen('2026-08-10 09:05', 'QC-0810-03'),
    eval: goodEval('2026-08-10 15:30', {
      IL1b: 38.6,
      IL1bCtrl: 46.2,
      IL6: 49.2,
      IL6Ctrl: 58.7,
      TNFa: 33.1,
      TNFaCtrl: 41.3,
      CRP: 3.8,
      CRPCtrl: 4.6,
      shannon: 2.8,
      lactoChange: 6,
      ecoliChange: -8,
    }),
  }),
  batch({
    batchId: '蓟化-2026-0806',
    stage: 'alert',
    farm: {
      name: '新郑郭店养殖点',
      partners: '双汇集团、新郑市畜牧站',
      location: '河南省郑州市新郑市郭店镇',
      house: '10 号密闭鸡舍',
      breed: '白羽肉鸡（罗斯 308）',
      count: 4500,
      fcr: 1.7,
      mortality: 4.1,
    },
    screen: {
      sampleId: 'QC-0806-02',
      sampleDate: '2026-08-06 09:40',
      samplePart: '胸肌 / 肝脏混样',
      method: '磁性分散固相萃取（MDSPE）+ 胶体金',
      mdspeMin: 40,
      goldMin: 5,
      target: '氟苯尼考',
      qualitative: '阳性',
      result: '检出',
      lodNote: '胶体金筛查限与方法检出限对齐：50 μg/kg',
      operator: '2 号 安全检测工程师',
      qcLine: '质控线显色正常，检测线显色',
      notes: '初筛阳性，批次扣留，不得出证。',
    },
  }),
]

export const FLEET_IDS = FLEET_SEEDS.map((b) => b.batchId)

export const SEED_BATCH_IDS = [DEMO_SEED.batchId, ...FLEET_IDS]
