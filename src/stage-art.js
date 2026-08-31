/** 蓟化之路六幕插画。原作 SVG，大色块，五米外能认。 */

function art(body) {
  return `<svg class="scene-svg" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`
}

/** 大蓟粗提物倾入日粮。 */
export const artFeed = art(`
  <ellipse class="feed-bowl" cx="56" cy="92" rx="38" ry="12" fill="#3a2a18" stroke="#e8d5a8" stroke-width="2"/>
  <ellipse cx="56" cy="88" rx="30" ry="7" fill="#6b5428"/>
  <circle class="feed-grain" cx="42" cy="87" r="2.2" fill="#e8d5a8"/>
  <circle class="feed-grain" cx="52" cy="86" r="2" fill="#c9a15a"/>
  <circle class="feed-grain" cx="63" cy="87.5" r="2.4" fill="#e8d5a8"/>
  <circle class="feed-grain" cx="72" cy="86" r="1.8" fill="#d4b36a"/>
  <g class="feed-flask">
    <path d="M86 18h16l-4 10v16c4 8 4 16-8 16s-12-8-8-16V28l-4-10h16z" fill="rgba(200,107,138,.22)" stroke="#c86b8a" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M90 22h8" stroke="#e8d5a8" stroke-width="1.6" stroke-linecap="round"/>
    <ellipse cx="94" cy="48" rx="7" ry="5" fill="#8c3d5c" opacity=".85"/>
  </g>
  <circle class="feed-drop d1" cx="78" cy="64" r="3.2" fill="#c86b8a"/>
  <circle class="feed-drop d2" cx="72" cy="74" r="2.4" fill="#c86b8a"/>
  <circle class="feed-drop d3" cx="68" cy="82" r="1.8" fill="#a84d72"/>
`)

/** 鸡舍与一群鸡。 */
export const artFarm = art(`
  <path d="M18 62 L60 28 L102 62" stroke="#e8d5a8" stroke-width="2.6" stroke-linejoin="round"/>
  <path d="M28 62v28h64V62" stroke="#c9b48a" stroke-width="2.2"/>
  <rect x="50" y="70" width="20" height="20" rx="2" stroke="#e8d5a8" stroke-width="1.8"/>
  <path d="M14 90h92" stroke="#7a9e86" stroke-width="2" stroke-linecap="round"/>
  <g class="farm-bird b1">
    <ellipse cx="34" cy="86" rx="10" ry="7" fill="#d8c49a"/>
    <circle cx="42" cy="82" r="4.2" fill="#efe6d3"/>
    <path d="M45.6 82l4-1.2" stroke="#c86b8a" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M26 86c-3 1-5 0-7-2" stroke="#c9b48a" stroke-width="1.6" stroke-linecap="round"/>
  </g>
  <g class="farm-bird b2">
    <ellipse cx="60" cy="88" rx="11" ry="7.5" fill="#e8d5a8"/>
    <circle cx="69" cy="84" r="4.4" fill="#f6f1e6"/>
    <path d="M72.8 84l4.2-1.4" stroke="#c86b8a" stroke-width="1.6" stroke-linecap="round"/>
  </g>
  <g class="farm-bird b3">
    <ellipse cx="86" cy="87" rx="9" ry="6.5" fill="#c9b48a"/>
    <circle cx="93" cy="83" r="3.8" fill="#efe6d3"/>
    <path d="M96.2 83l3.6-1" stroke="#c86b8a" stroke-width="1.6" stroke-linecap="round"/>
  </g>
`)

/** 胶体金试纸亮起。 */
export const artScreen = art(`
  <rect x="40" y="14" width="40" height="92" rx="8" fill="#1a1612" stroke="#e8d5a8" stroke-width="2.2"/>
  <rect x="48" y="28" width="24" height="54" rx="3" fill="#2a2218" stroke="#c9b48a" stroke-width="1.4"/>
  <path class="strip-c" d="M52 40h16" stroke="#c86b8a" stroke-width="3.2" stroke-linecap="round"/>
  <path class="strip-t" d="M54 58h12" stroke="#5a4a38" stroke-width="2.4" stroke-linecap="round"/>
  <circle class="strip-glow" cx="60" cy="40" r="14" fill="rgba(200,107,138,.18)"/>
  <text x="60" y="96" text-anchor="middle" fill="#e8d5a8" font-size="11" font-family="serif">阴</text>
`)

/** 炎症对照落下。 */
export const artEval = art(`
  <path d="M22 22v76" stroke="#7a9e86" stroke-width="1.6" opacity=".5"/>
  <path d="M22 98h80" stroke="#7a9e86" stroke-width="1.6" opacity=".5"/>
  <rect class="eval-ctrl" x="36" y="30" width="18" height="68" rx="3" fill="rgba(155,44,44,.35)" stroke="#c9a07a" stroke-width="1.6"/>
  <rect class="eval-now" x="70" y="58" width="18" height="40" rx="3" fill="rgba(43,107,76,.55)" stroke="#e8d5a8" stroke-width="1.8"/>
  <path class="eval-arrow" d="M79 52v-16m0 0-5 6m5-6 5 6" stroke="#e8d5a8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="45" y="16" text-anchor="middle" fill="#c9b48a" font-size="9">对照</text>
  <text x="79" y="16" text-anchor="middle" fill="#e8d5a8" font-size="9">蓟化</text>
`)

/** 合格印落下。 */
export const artStamp = art(`
  <g class="stamp-seal">
    <circle cx="60" cy="60" r="38" fill="rgba(180,35,24,.08)" stroke="#c45a4a" stroke-width="4"/>
    <circle cx="60" cy="60" r="30" stroke="#c45a4a" stroke-width="1.6"/>
    <text x="60" y="68" text-anchor="middle" fill="#c45a4a" font-size="22" font-family="serif" letter-spacing="4">合格</text>
  </g>
`)

/** 手机与追溯码绽开。 */
export const artQr = art(`
  <rect class="qr-phone" x="34" y="10" width="52" height="100" rx="8" fill="#14110e" stroke="#e8d5a8" stroke-width="2.2"/>
  <rect x="48" y="16" width="24" height="3" rx="1.5" fill="#5a4a38"/>
  <g class="qr-bloom">
    <rect x="44" y="32" width="32" height="32" rx="2" fill="#f6f1e6"/>
    <rect x="46" y="34" width="8" height="8" fill="#1a1408"/>
    <rect x="66" y="34" width="8" height="8" fill="#1a1408"/>
    <rect x="46" y="54" width="8" height="8" fill="#1a1408"/>
    <rect x="48" y="36" width="4" height="4" fill="#f6f1e6"/>
    <rect x="68" y="36" width="4" height="4" fill="#f6f1e6"/>
    <rect x="48" y="56" width="4" height="4" fill="#f6f1e6"/>
    <rect x="58" y="46" width="4" height="4" fill="#1a1408"/>
    <rect x="64" y="50" width="3" height="3" fill="#1a1408"/>
    <rect x="56" y="38" width="3" height="3" fill="#1a1408"/>
    <rect x="62" y="42" width="2" height="2" fill="#1a1408"/>
    <rect x="52" y="48" width="3" height="3" fill="#1a1408"/>
  </g>
  <path d="M50 80h20" stroke="#c9b48a" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M54 86h12" stroke="#7a6a50" stroke-width="1.4" stroke-linecap="round"/>
`)

export const sceneArt = {
  feed: artFeed,
  farm: artFarm,
  screen: artScreen,
  eval: artEval,
  stamp: artStamp,
  qr: artQr,
}

/** 场边蓟影，慢呼吸。 */
export const thistleSilhouette = `<svg class="stage-thistle" viewBox="0 0 220 320" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M112 312c-2-48-8-96 2-142 4-18 6-36 0-54" stroke="currentColor" stroke-width="7" stroke-linecap="round"/>
  <path d="M114 210C62 188 28 150 48 128c22 18 48 34 66 40-18-8-28-28-22-52 28 22 40 48 24 84z" fill="currentColor"/>
  <path d="M112 206c48-20 86-56 70-84-20 20-48 38-70 46 16-12 24-34 14-56-24 26-36 54-14 94z" fill="currentColor"/>
  <ellipse cx="118" cy="88" rx="46" ry="58" fill="currentColor"/>
  <path d="M90 54c8-22 20-38 28-46M118 40c4-24 8-36 8-46M146 56c10-20 22-34 32-42" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
</svg>`
