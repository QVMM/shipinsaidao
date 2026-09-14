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
    return { lines: ['检验检测', '专用章'], ink: '#c01712' }
  }
  if (variant === 'hold') {
    return { lines: ['待复核'], ink: '#8a5a12' }
  }
  return { lines: ['合格', '准予上市'], ink: '#c01712' }
}

/**
 * 略扁、略偏的双环。
 * @param {string} ink
 * @returns {string}
 */
function rings(ink) {
  return `
    <path d="M60.8 9.2C81.6 7.6 103.8 21.4 111.4 42.6C119.6 65.2 112.8 91.8 94.6 105.2C76.2 118.8 49.4 118.4 32.6 105.4C14.2 91.8 7.4 66.2 14.2 44.8C20.4 25.2 41.2 10.8 60.8 9.2Z"
      fill="${ink}" fill-opacity=".07" stroke="${ink}" stroke-width="4.6" stroke-linejoin="round"/>
    <path d="M60.2 17.4C77.2 16 95.8 27.2 102 44.6C108.6 63.2 102.8 85.2 87.8 95.8C72.6 106.8 50.8 106.4 37.2 95.2C22.4 83.2 17.2 62.2 22.8 45.2C28 29.4 43.6 18.8 60.2 17.4Z"
      fill="none" stroke="${ink}" stroke-width="1.55"/>
    <ellipse cx="27.4" cy="37.2" rx="3.6" ry="1.5" fill="${ink}" opacity=".28" transform="rotate(-26 27.4 37.2)"/>
    <ellipse cx="95.2" cy="80.4" rx="2.8" ry="1.2" fill="${ink}" opacity=".24" transform="rotate(16 95.2 80.4)"/>
    <path d="M21.6 74.2c2.6 1.1 3.4 2.8 1.7 3.5c-1.8.6-3.8-.9-3.3-2.3c.2-.7 1-.12 1.6-1.2z" fill="${ink}" opacity=".28"/>
  `
}

/**
 * @param {string} ink
 * @returns {string}
 */
function star(ink) {
  return `<path d="M60 42.8l3.2 6.5 7.2.88-5.3 5 1.42 7.1L60 58.8l-6.52 3.38 1.42-7.1-5.3-5 7.2-.88z" fill="${ink}"/>`
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
    ? `<text x="60" y="70" text-anchor="middle" fill="${ink}" font-size="18" font-weight="700" font-family="STKaiti, KaiTi, 'KaiTi_GB2312', 'Songti SC', serif" letter-spacing="2.4">${esc(lines[0])}</text>
       <text x="60.5" y="90" text-anchor="middle" fill="${ink}" font-size="12.5" font-weight="600" font-family="STKaiti, KaiTi, 'KaiTi_GB2312', 'Songti SC', serif" letter-spacing="1">${esc(lines[1])}</text>`
    : `<text x="60.4" y="73" text-anchor="middle" fill="${ink}" font-size="22" font-weight="700" font-family="STKaiti, KaiTi, 'KaiTi_GB2312', 'Songti SC', serif" letter-spacing="3.2">${esc(lines[0])}</text>`
  return `
    <svg class="ink-stamp" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <filter id="${id}" x="-12%" y="-12%" width="124%" height="124%">
          <feTurbulence type="fractalNoise" baseFrequency="0.92" numOctaves="2" seed="${stampSeq + 3}" result="n"/>
          <feDisplacementMap in="SourceGraphic" in2="n" scale="0.85" xChannelSelector="R" yChannelSelector="G"/>
        </filter>
      </defs>
      <g filter="url(#${id})">
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
