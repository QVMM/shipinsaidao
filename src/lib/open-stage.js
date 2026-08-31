/** 操作台把裁判大屏开到新窗口，拖到投影即可。 */

export function stageHref(batchId) {
  const id = encodeURIComponent(batchId || '蓟化-2026-0812')
  return `${location.origin}${location.pathname || '/'}#/stage/${id}`
}

/**
 * @param {string} [batchId]
 */
export function openStage(batchId) {
  window.open(stageHref(batchId), 'tihua-stage')
}
