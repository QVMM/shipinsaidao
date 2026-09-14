/**
 * 橡胶印：不规则圆、油墨颗粒、略偏的字。不要卡通描边。
 */

let stampSeq = 0

/**
 * @param {'pass' | 'official' | 'hold'} variant
 * @returns {{ lines: string[], ink: string }}
 */
function faceOf(variant) {
  if (variant === 'official') {
    return { lines: ['检验检测', '专用章'], ink: '#b42318' }
  }
  if (variant === 'hold') {
    return { lines: ['待复核'], ink: '#8a5a12' }
  }
  return { lines: ['合格', '准予上市'], ink: '#b42318' }
}

/**
 * 略扁、略偏的双环，看起来像盖上去的，不是圆规画的。
 * @param {string} ink
 * @returns {string}
 */
function rings(ink) {
  return `
    <path d="M61.2 8.6C80.8 7.2 102.4 20.4 110.6 40.8C119.2 62.6 113.4 89.6 95.8 103.4C77.6 117.8 50.6 118.6 33.4 106.2C14.8 93.2 7.6 68.4 13.8 47.2C19.6 27.2 41.4 10.2 61.2 8.6Z"
      fill="none" stroke="${ink}" stroke-width="4.2" stroke-linejoin="round" opacity=".86"/>
    <path d="M60.4 16.8C76.8 15.6 94.8 26.6 101.2 43.4C107.8 61.2 102.6 83.2 88.2 94.2C73.2 105.8 51.4 106.2 37.6 95.6C22.6 84.2 17.2 63.6 22.4 46.8C27.4 30.6 43.8 18.2 60.4 16.8Z"
      fill="none" stroke="${ink}" stroke-width="1.35" opacity=".72"/>
    <ellipse cx="28" cy="38" rx="3.2" ry="1.4" fill="${ink}" opacity=".18" transform="rotate(-28 28 38)"/>
    <ellipse cx="94" cy="78" rx="2.6" ry="1.1" fill="${ink}" opacity=".16" transform="rotate(18 94 78)"/>
    <path d="M22 72c2.4 1.2 3.1 2.8 1.6 3.4c-1.6.6-3.6-.8-3.2-2.2c.2-.8 1-.14 1.6-1.2z" fill="${ink}" opacity=".2"/>
  `
}

/**
 * @param {string} ink
 * @returns {string}
 */
function star(ink) {
  return `<path d="M60 44.2l3.05 6.28 6.9.84-5.1 4.78 1.36 6.82L60 59.7l-6.21 3.22 1.36-6.82-5.1-4.78 6.9-.84z"
    fill="${ink}" opacity=".8"/>`
}

/**
 * @param {{ variant?: 'pass' | 'official' | 'hold', lines?: string[] }} [opts]
 * @returns {string}
 */
export function renderInkStamp(opts = {}) {
  const variant = opts.variant || 'pass'
  const face = faceOf(variant)
  const lines = opts.lines && opts.lines.length ? opts.lines : face.lines
  const ink = face.ink
  const id = `inkn${++stampSeq}`
  const two = lines.length > 1
  const text = two
    ? `<text x="60" y="68" text-anchor="middle" fill="${ink}" font-size="17" font-family="STKaiti, KaiTi, 'KaiTi_GB2312', 'Songti SC', serif" letter-spacing="3" opacity=".88">${esc(lines[0])}</text>
       <text x="60.6" y="88" text-anchor="middle" fill="${ink}" font-size="11.5" font-family="STKaiti, KaiTi, 'KaiTi_GB2312', 'Songti SC', serif" letter-spacing="1.2" opacity=".8">${esc(lines[1])}</text>`
    : `<text x="60.4" y="72" text-anchor="middle" fill="${ink}" font-size="20" font-family="STKaiti, KaiTi, 'KaiTi_GB2312', 'Songti SC', serif" letter-spacing="4" opacity=".88">${esc(lines[0])}</text>`
  return `
    <svg class="ink-stamp" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <filter id="${id}" x="-18%" y="-18%" width="136%" height="136%">
          <feTurbulence type="fractalNoise" baseFrequency="0.78" numOctaves="3" seed="${stampSeq + 4}" result="n"/>
          <feDisplacementMap in="SourceGraphic" in2="n" scale="1.7" xChannelSelector="R" yChannelSelector="G"/>
          <feGaussianBlur stdDeviation="0.18"/>
        </filter>
      </defs>
      <g filter="url(#${id})" fill="none">
        ${rings(ink)}
        ${variant === 'official' ? star(ink) : ''}
        ${text}
      </g>
    </svg>
  `
}

/**
 * @param {string} stamp
 * @returns {'pass' | 'official' | 'hold'}
 */
export function stampVariant(stamp) {
  if (stamp === '检验检测专用章') return 'official'
  if (!stamp || stamp === '待复核' || stamp === '待出证') return 'hold'
  return 'pass'
}

function esc(v) {
  return v == null ? '' : String(v)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}
