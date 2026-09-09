/**
 * 指挥舱 / 扫码页 / 审核页共用封存文案。
 * 只写白话，不写算法名词。
 */

export const SEAL_OK = '封存完整'
export const SEAL_TAMPER = '对不上，有人改过'
export const SEAL_BREAK = '封存链断了'
export const SEAL_HINT = '写下就盖章，改了扫码对不上'
export const SEAL_VISITOR = '写下就盖章，扫码能验，改了就对不上'
export const SEAL_PASS_NOTE = '这份和出证时一致'
export const SEAL_FAIL_NOTE = '对不上，有人改过'
export const SEAL_CHAIN_OK = '链完整'
export const SEAL_CHAIN_BAD = '链对不上'
export const SEAL_LIVE_OK = '与当前数据一致'
export const SEAL_LIVE_BAD = '与当前数据不一致'

/**
 * @param {'完整' | '对不上' | '链断裂' | string} status
 * @returns {string}
 */
export function sealHeadline(status) {
  if (status === '对不上') return SEAL_TAMPER
  if (status === '链断裂') return SEAL_BREAK
  return SEAL_OK
}

/**
 * @param {string} [hash]
 * @returns {string}
 */
export function sealFingerprint(hash) {
  const hex = String(hash || '').replace(/[^0-9a-fA-F]/g, '').slice(0, 8).toUpperCase()
  return hex ? `TH-${hex}` : 'TH-————————'
}
