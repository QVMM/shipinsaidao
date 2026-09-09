/** 预填批次默认数据。现场可改，恢复预填数据会回到这里。 */
import { makeDemoHouseEnv, shanghaiYmd } from './lib/house-env.js'

export const DEMO_SEED = {
  batchId: '蓟化-2026-0812',
  productName: '替抗蓟化 减抗鸡肉',
  brand: '替抗蓟化',
  platform: '减抗鸡肉全链条质控与溯源平台',
  team: '「替抗蓟化」食品安全创新团队',
  farm: {
    name: '双汇·郑州农发共建养殖基地',
    partners: '双汇集团、郑州市农村发展中心',
    location: '河南省郑州市荥阳市康店镇',
    house: '3 号密闭鸡舍',
    flockId: 'FL-2026-0812-A',
    breed: '白羽肉鸡（AA+）',
    hatchDate: '2026-06-22',
    stockDate: '2026-06-22',
    plannedSlaughter: '2026-08-12',
    count: 8000,
    density: '10 只/m²',
    feedBrand: '替抗蓟化定制日粮',
    additive: '大蓟粗提物',
    dose: '5000 mg/kg 饲料（0.5%）',
    doseStartDay: 1,
    feedNote: '常规添加 5000 mg/kg（0.5%），应激添加 10000 mg/kg（1%），替代饲用抗生素；疫苗免疫按规程执行。',
    fcr: 1.58,
    fcrControl: 1.65,
    mortality: 2.1,
    mortalityControl: 4.4,
    medLog: [
      { date: '2026-06-22', item: '大蓟粗提物', dose: '常规 5000 mg/kg（0.5%） / 应激 10000 mg/kg（1%）', purpose: '替抗提质、抗炎抑菌', result: '全程执行' },
      { date: '2026-06-23', item: '新城疫 / 法氏囊疫苗', dose: '按日龄规程', purpose: '基础免疫', result: '已执行' },
      { date: '2026-07-05', item: '球虫疫苗', dose: '按规程', purpose: '球虫防控（非抗菌药）', result: '已执行' },
      { date: '2026-07-18', item: '饲用抗生素', dose: '—', purpose: '—', result: '未使用' },
    ],
    houseEnv: makeDemoHouseEnv('2026-08-11', '蓟化-2026-0812'),
  },
  screen: {
    sampleId: 'DJ-0812',
    sampleDate: '2026-08-11 09:20',
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
    notes: '大蓟组汇总为阴性。市售对照阳性，用于证明市售鸡肉存在氟苯尼考滥用；大蓟组全阴性。',
    samples: [
      { id: 'QC-0812-01', group: '质控组', tLine: 'T≥C', qualitative: '阴性', result: '未检出', note: '质控线与检测线均显色，T≥C' },
      { id: 'QC-0812-02', group: '质控组', tLine: 'T≥C', qualitative: '阴性', result: '未检出', note: '质控有效' },
      { id: 'MKT-0812-01', group: '市售对照', tLine: 'T浅于C', qualitative: '阳性', result: '氟苯尼考超标', note: '市售鸡肉检出氟苯尼考' },
      { id: 'MKT-0812-02', group: '市售对照', tLine: '不显色', qualitative: '阳性', result: '氟苯尼考超标', note: '检测线未显色' },
      { id: 'DJ-0812-01', group: '大蓟鸡肉', tLine: 'T深于C', qualitative: '阴性', result: '未检出', note: '大蓟组阴性' },
      { id: 'DJ-0812-02', group: '大蓟鸡肉', tLine: 'T深于C', qualitative: '阴性', result: '未检出', note: '大蓟组阴性' },
    ],
    extra: {
      otherResidues: '恩诺沙星、磺胺类、四环素类：未检出',
      heavyMetals: '铅、镉、砷、汞：未超标',
      protein: '22.4 g/100g',
      aminoAcids: '必需氨基酸组成正常',
      sensory: '色泽正常，无异味，组织致密',
    },
    instrument: 'HPLC',
    curveR: 0.9992,
    lod: 50,
    valueText: '未检出（<50）',
    valueNum: '',
    unit: 'μg/kg',
    hplcDate: '2026-08-11 14:40',
    hplcOperator: '3 号 分析测试工程师',
  },
  eval: {
    IL1b: 18.4,
    IL1bCtrl: 46.2,
    IL6: 22.1,
    IL6Ctrl: 58.7,
    TNFa: 15.8,
    TNFaCtrl: 41.3,
    CRP: 1.2,
    CRPCtrl: 4.6,
    shannon: 3.42,
    shannonCtrl: 2.71,
    lactoChange: 28,
    ecoliChange: -41,
  },
  report: {
    generated: true,
    generatedAt: '2026-08-11 16:00',
    no: 'THJH-20260812-001',
  },
  trace: {
    generated: true,
    generatedAt: '2026-08-11 16:20',
    verifyId: 'TR-8F2C-0812',
  },
  review: {
    sampleAccept: true,
    dataReview: true,
    reportIssue: true,
    reviewed: true,
    reviewer: '数据溯源工程师',
    reviewedAt: '2026-08-11 16:10',
  },
  program: {
    birds: '≥10 万羽',
    fcrDrop: '≥0.05',
    mortDrop: '≥2 个百分点',
    markets: 12,
    charityTests: '3000+',
  },
}

/**
 * @returns {typeof DEMO_SEED}
 */
export function cloneSeed() {
  return structuredClone(DEMO_SEED)
}

/**
 * @returns {string}
 */
export function formatNow() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * @param {string} batchId
 * @returns {string}
 */
export function makeReportNo(batchId) {
  const tail = String(batchId).replace(/\D/g, '').slice(-8) || '20260812'
  return `THJH-${tail}-001`
}

/**
 * @param {string} batchId
 * @returns {string}
 */
export function makeVerifyId(batchId) {
  const tail = String(batchId).slice(-4)
  return `TR-8F2C-${tail}`
}


/**
 * @param {string} iso
 * @param {number} days
 * @returns {string}
 */
function addDaysIso(iso, days) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  const p = (n) => String(n).padStart(2, '0')
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`
}

/**
 * 新建批次：沿用焦点批的基地 / 日粮结构，检测与评价留空。
 * 进苗/入孵用上海当天，出栏 +50 天；用药本只留饲用抗生素未使用。
 * @param {string} batchId
 * @returns {typeof DEMO_SEED}
 */
export function blankBatchFromSpotlight(batchId) {
  const seed = cloneSeed()
  const day = shanghaiYmd().iso
  const samples = (seed.screen.samples || []).map((row) => ({
    id: '',
    group: row.group,
    tLine: '',
    qualitative: '',
    result: '',
    note: '',
  }))
  return {
    ...seed,
    batchId,
    farm: {
      ...seed.farm,
      flockId: `FL-${String(batchId).replace(/^蓟化-/, '')}`,
      hatchDate: day,
      stockDate: day,
      plannedSlaughter: addDaysIso(day, 50),
      fcr: '',
      mortality: '',
      houseEnv: makeDemoHouseEnv(day, batchId),
      medLog: [
        { date: day, item: '饲用抗生素', dose: '—', purpose: '—', result: '未使用' },
      ],
    },
    screen: {
      sampleId: '',
      sampleDate: '',
      samplePart: seed.screen.samplePart,
      method: seed.screen.method,
      mdspeMin: seed.screen.mdspeMin,
      goldMin: seed.screen.goldMin,
      target: seed.screen.target,
      qualitative: '',
      result: '',
      lodNote: seed.screen.lodNote,
      operator: '',
      qcLine: '',
      notes: '',
      samples,
      extra: {
        otherResidues: '',
        heavyMetals: '',
        protein: '',
        aminoAcids: '',
        sensory: '',
      },
      instrument: '',
      curveR: '',
      lod: seed.screen.lod || 50,
      valueText: '',
      valueNum: '',
      unit: 'μg/kg',
      hplcDate: '',
      hplcOperator: '',
    },
    eval: {
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
    },
    report: { generated: false, generatedAt: '', no: '' },
    trace: { generated: false, generatedAt: '', verifyId: '' },
    review: {
      sampleAccept: false,
      dataReview: false,
      reportIssue: false,
      reviewed: false,
      reviewer: '',
      reviewedAt: '',
    },
    program: {
      ...seed.program,
      pipelineStage: '',
      listed: false,
    },
  }
}

/** 现场四人分工，只放在侧栏折叠里，不是入口。 */
export const ROLES = [
  { id: 'farm', label: '智慧养殖', who: '1 号 智慧养殖专员', hash: '#/farm', hint: '档案 · 大蓟添加 · 用药' },
  { id: 'screen', label: '安全检测', who: '2 号 安全检测工程师', hash: '#/screen', hint: '胶体金 · HPLC' },
  { id: 'eval', label: '质量评价', who: '3 号 分析测试工程师', hash: '#/eval', hint: '炎症因子对照' },
  { id: 'trace', label: '数据溯源', who: '4 号 数据溯源工程师', hash: '#/qr', hint: '报告 · 出码 · 客户端' },
]
