/** @returns {boolean} */
export function offlineMode() {
  return /^(1|true|yes|on)$/i.test(String(process.env.OFFLINE_MODE || '').trim())
}
