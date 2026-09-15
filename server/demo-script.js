/** DJTK 展台三幕固定话术（开头风险 → 中间判定 → 升华收束）。 */

/** @typedef {'open' | 'mid' | 'end'} DemoAct */

export const DEMO_ACTS = /** @type {const} */ (['open', 'mid', 'end'])

/** Shortcut chip labels shown above business STARTERS. */
export const DEMO_CHIP_LABELS = {
  open: '开头·风险排查',
  mid: '中间·结果判定',
  end: '升华·致谢收束',
}

export const DEMO_SCRIPT = {
  open: {
    id: 'open',
    step: '开头',
    chip: '【演示】风险排查 · 订单缺口',
    mark: '险',
    tone: 'warn',
    engineer: {
      who: '4号 · 质量工程师',
      say: '【演示】我是某出口鸡肉企业的质量工程师，我联动自主开发的大蓟替抗智控平台，对近期我国出口鸡肉安全进行风险排查。请DJTK智控助手结合大数据平台进行安全风险排查。',
    },
    assistant: {
      who: 'DJTK智控助手',
      say: '【演示·非真实】对近一个月出口鸡肉安全信息搜集分析，发现某海关中心查验多批次出口鸡肉氟苯尼考兽药残留超标，相关产品依法退市，造成约 10 万吨订单缺口。',
      note: '【演示·非真实】剧本场景，非真实海关通报；引出市场缺口任务，展现系统全域数据研判能力。',
    },
    customs: true,
    cta: '开始风险排查',
    href: '#/screen',
    nextLabel: '下一段 · 结果判定',
  },
  mid: {
    id: 'mid',
    step: '中间',
    chip: '结果判定 · 全部合格',
    mark: '判',
    tone: 'ok',
    engineer: {
      who: '4号 · 质量工程师',
      say: '质检结果已出，请DJTK智控助手结合实时数据进行样品结果判定。',
    },
    assistant: {
      who: 'DJTK智控助手',
      say: '已完成结果审核，并对标高品质鸡肉三维评价体系做出判定，大蓟替抗鸡肉抽检样品全部合格。',
      note: '三维：安全残留 · 健康炎症 · 品质指标，与指挥舱证据墙一致。',
    },
    customs: false,
    cta: '查看健康评价',
    href: '#/eval',
    nextLabel: '下一段 · 升华收束',
  },
  end: {
    id: 'end',
    step: '升华',
    chip: '技能展示完成',
    mark: '谢',
    tone: 'warm',
    engineer: {
      who: '4号 · 质量工程师',
      say: '大蓟替抗 高品质鸡肉解决方案 技能展示完成。',
    },
    assistant: {
      who: 'DJTK智控助手',
      say: '屏幕之外可能是素未谋面的陌生人，也可能是我们的家人；感谢替抗蓟化团队，以技能筑牢安全防线，护航中国高品质鸡肉走向世界餐桌。',
      note: '',
    },
    team: [
      '给孩子一块鸡排，只留香，不留忧；',
      '给父母一碗鸡汤，只暖心，不担心；',
      '“产地中国”，成为世界放心。',
    ],
    customs: false,
    cta: '回到焦点批次',
    href: '#/dashboard',
    nextLabel: '回到开头',
  },
}

/**
 * Match booth question / chip / engineer line → act id.
 * @param {string} question
 * @returns {DemoAct | null}
 */
export function matchDemoAct(question) {
  const q = String(question || '').trim()
  if (!q) return null

  for (const id of DEMO_ACTS) {
    if (q === DEMO_CHIP_LABELS[id]) return id
    const s = DEMO_SCRIPT[id]
    if (q === s.chip || q === s.engineer.say) return id
  }

  // Keywords (chip shorthand / doc cues)
  if (/开头风险排查|开头·风险排查/.test(q)) return 'open'
  if (/样品结果判定|中间·结果判定/.test(q)) return 'mid'
  if (/技能展示完成|升华·致谢收束/.test(q)) return 'end'

  return null
}

/**
 * Fixed user + assistant lines for an act.
 * End assistantSay appends team lines joined for TTS.
 * @param {DemoAct | string} actId
 * @returns {{ userSay: string, assistantSay: string } | null}
 */
export function demoReply(actId) {
  const s = DEMO_SCRIPT[actId]
  if (!s) return null
  let assistantSay = s.assistant.say
  if (actId === 'end' && Array.isArray(s.team) && s.team.length) {
    assistantSay = `${s.assistant.say}${s.team.join('')}`
  }
  return {
    userSay: s.engineer.say,
    assistantSay,
  }
}
