import { getVerdict } from '../store.js'
import { factClass, humanHeadline, threeFacts } from '../lib/verdict.js'

/**
 * 四页共用的结论条：一句结论 + 四条事实。不是表单，不是表格。
 * @param {object} state
 * @returns {string}
 */
export function renderVerdictStrip(state) {
  const v = getVerdict()
  const facts = threeFacts(state)
  const headline = humanHeadline(v, state)
  return `
    <div class="verdict-strip ${v.pass ? 'pass' : 'hold'}" role="status">
      <p class="verdict-strip-hl">${headline}</p>
      <ul class="verdict-strip-facts">
        ${facts.map((item) => `<li class="${factClass(item)}">${item.text}</li>`).join('')}
      </ul>
    </div>
  `
}
