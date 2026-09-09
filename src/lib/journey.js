/** 评委能看懂的整条路径。角色不是入口。 */

export const NAV = [
  { href: '#/dashboard', id: 'dashboard', label: '产品信息' },
  { href: '#/farm', id: 'farm', label: '养殖过程' },
  { href: '#/screen', id: 'screen', label: '安全检测' },
  { href: '#/eval', id: 'eval', label: '健康评价' },
  { href: '#/report', id: 'report', label: '检测报告' },
  { href: '#/qr', id: 'qr', label: '追溯码' },
  { href: '#/consumer', id: 'consumer', label: '客户端显示' },
]

/** 顶栏故事步进：产品路径，避免和侧栏抢注意力。 */
export const STEPS = [
  { id: 'pick', label: '选择批次', pages: ['batches'], href: '#/batches' },
  { id: 'batch', label: '产品信息', pages: ['dashboard'], href: '#/dashboard' },
  { id: 'farm', label: '养殖过程', pages: ['farm'], href: '#/farm' },
  { id: 'test', label: '安全检测', pages: ['screen'], href: '#/screen' },
  { id: 'eval', label: '健康评价', pages: ['eval'], href: '#/eval' },
  { id: 'proof', label: '出证溯源', pages: ['report', 'qr'], href: '#/report' },
  { id: 'buyer', label: '客户端显示', pages: ['consumer'], href: '#/consumer' },
]

export const PAGE_META = {
  dashboard: {
    title: '产品信息',
    brief: {
      what: '本批次减抗鸡肉的来源、安全结论与出证状态。',
      why: '先看结论，再按路径查看养殖与检测记录。',
      next: '查看养殖过程，或直接生成检测报告。',
    },
    next: { href: '#/farm', label: '下一步：查看养殖过程' },
    secondary: { action: 'jump-report', label: '生成检测报告' },
  },
  farm: {
    title: '养殖过程',
    brief: {
      what: '本批次饲喂记录与是否使用饲用抗生素。',
      why: '安全从饲料开始。未使用饲用抗生素，后续检测才有意义。',
      next: '查看出栏前安全检测结果。',
    },
    next: { href: '#/screen', label: '下一步：查看安全检测' },
  },
  screen: {
    title: '安全检测',
    brief: {
      what: '出栏前抽检：胶体金快筛 + HPLC 定量确认有没有药。',
      why: '未检出可继续。筛到或试纸无效，暂不出证。',
      next: '查看健康评价（炎症）。',
    },
    next: { href: '#/eval', label: '下一步：查看健康评价' },
  },
  eval: {
    title: '健康评价',
    brief: {
      what: '血清炎症因子对照。',
      why: '炎症低于对照才可出证。',
      next: '汇总为检测报告。',
    },
    next: { action: 'next-report', href: '#/report', label: '下一步：生成检测报告' },
  },
  report: {
    title: '检测报告',
    brief: {
      what: '给监管和企业看的正式证明，版式为 A4。',
      why: '前面各页录入的数据都会写入报告。',
      next: '生成本批次追溯码。',
    },
    next: { href: '#/qr', label: '下一步：生成追溯码' },
  },
  reportEmpty: {
    title: '检测报告',
    brief: {
      what: '给监管和企业看的正式证明，版式为 A4。',
      why: '尚未生成。按当前数据出一份即可。',
      next: '生成报告后，再出追溯码。',
    },
    next: { action: 'gen-report', label: '生成检测报告' },
  },
  qr: {
    title: '追溯码',
    brief: {
      what: '本批次追溯码。扫开即客户端显示页。',
      why: '码指向本机批次溯源页。',
      next: '查看客户端显示。',
    },
    next: { href: '#/consumer', label: '下一步：查看客户端显示' },
  },
  qrEmpty: {
    title: '追溯码',
    brief: {
      what: '本批次追溯码。扫开即客户端显示页。',
      why: '尚未出码。建议先有报告，再出码。',
      next: '生成追溯码，再查看客户端显示。',
    },
    next: { action: 'gen-qr', label: '生成追溯码' },
  },
  consumer: {
    title: '客户端显示',
    brief: {
      what: '扫码后在客户端看到的内容。',
      why: '从养殖到检测都能被普通人看懂。',
      next: '可返回产品信息，或恢复预填数据。',
    },
    next: { href: '#/dashboard', label: '返回产品信息' },
  },
  batches: {
    title: '选择批次',
    brief: {
      what: '选择或输入要打开的批次。',
      why: '登录后先选定批次，再进入产品信息。',
      next: '确认后打开产品信息。',
    },
    next: { href: '#/dashboard', label: '打开产品信息' },
  },
}

/**
 * @param {string} id
 * @returns {typeof PAGE_META.dashboard}
 */
export function getPageMeta(id) {
  return PAGE_META[id] || PAGE_META.dashboard
}

/**
 * @param {string} pageId
 * @returns {(typeof STEPS)[number] | undefined}
 */
export function stepForPage(pageId) {
  return STEPS.find((s) => s.pages.includes(pageId))
}
