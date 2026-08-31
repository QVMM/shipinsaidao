/** 手绘小标：侧栏与按钮用。描边走 currentColor。 */

function ico(body) {
  return `<svg class="ico" viewBox="0 0 24 24" fill="none" aria-hidden="true">${body}</svg>`
}

/** 产品信息 */
export const iconBatch = ico(`
  <path d="M5 15.2c.2-3 3.2-5 6.6-4.2 1-3.2 4.2-4.8 7.2-3.2.3 1.7-.8 3.1-2.3 3.7 1.4 1.2 2 3.4.4 5.2-2 2.1-7.4 2.4-9.8.4C5.8 16.3 5 15.8 5 15.2z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M18.6 8.6 21 9.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  <circle cx="16.4" cy="9.1" r=".7" fill="currentColor"/>
  <path d="M9.2 18.6v2M13.2 18.6v2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
`)

/** 养殖过程 */
export const iconFarm = ico(`
  <path d="M4 12.2 12 5.4l8 6.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M6.4 10.8V19h11.2v-8.2" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M10.2 19v-4.6h3.6V19" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M12 5.4V3.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  <circle cx="12" cy="2.8" r="1.1" fill="currentColor"/>
`)

/** 安全检测 */
export const iconTube = ico(`
  <path d="M9 3.2h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M10.2 3.2v6.4L7.4 18a2.8 2.8 0 0 0 2.5 3.8h4.2A2.8 2.8 0 0 0 16.6 18l-2.8-8.4V3.2" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M8.6 14.8h6.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
`)

/** 健康评价 */
export const iconHeart = ico(`
  <path d="M12 19.6S5.2 15.2 5.2 10.8A3.8 3.8 0 0 1 12 8.2a3.8 3.8 0 0 1 6.8 2.6c0 4.4-6.8 8.8-6.8 8.8z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M8.4 12h2l1.1-1.8 1.5 3 1-1.2h1.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
`)

/** 检测报告 */
export const iconDoc = ico(`
  <path d="M7.2 4.2h7.2L18 8v12.2H7.2z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M14.4 4.2V8H18" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M9.6 11.4h4.8M9.6 14.2h4.8M9.6 17h3.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
`)

/** 追溯码 */
export const iconQr = ico(`
  <path d="M4.5 4.5h6v6h-6zM13.5 4.5h6v6h-6zM4.5 13.5h6v6h-6z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M6.4 6.4h2.2v2.2H6.4zM15.4 6.4h2.2v2.2h-2.2zM6.4 15.4h2.2v2.2H6.4z" fill="currentColor" stroke="none"/>
  <path d="M13.5 13.5h3v3h-3zM18.5 13.5v3M13.5 18.5h3M18.5 18.5v.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
`)

/** 客户端显示 */
export const iconPhone = ico(`
  <rect x="7.2" y="3.2" width="9.6" height="17.6" rx="2.2" stroke="currentColor" stroke-width="1.6"/>
  <path d="M10.2 5.6h3.6M11 18.6h2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
`)

export const iconPlus = ico(`
  <path d="M12 6.5v11M6.5 12h11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
`)

export const iconChevron = ico(`
  <path d="M9 6.5 15 12 9 17.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
`)

export const iconAudit = ico(`
  <path d="M7.2 4.2h7.2L18 8v12.2H7.2z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M14.4 4.2V8H18" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M9.4 12.2 11 13.8l3.2-3.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M9.6 17h4.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
`)

export const NAV_ICONS = {
  dashboard: iconBatch,
  farm: iconFarm,
  screen: iconTube,
  eval: iconHeart,
  report: iconDoc,
  qr: iconQr,
  consumer: iconPhone,
  audit: iconAudit,
}
