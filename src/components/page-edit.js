import { canWrite } from '../auth.js'
import { currentBatchId } from '../store.js'

/**
 * @param {string} pageId
 * @param {string} [batchId]
 * @returns {string}
 */
function storageKey(pageId, batchId) {
  return `tihua-edit-${pageId}-${batchId || currentBatchId() || ''}`
}

/**
 * @param {string} pageId
 * @param {string} [batchId]
 * @returns {boolean}
 */
export function isEditing(pageId, batchId) {
  try {
    return sessionStorage.getItem(storageKey(pageId, batchId)) === '1'
  } catch {
    return false
  }
}

/**
 * @param {string} pageId
 * @param {boolean} on
 * @param {string} [batchId]
 */
export function setEditing(pageId, on, batchId) {
  try {
    if (on) sessionStorage.setItem(storageKey(pageId, batchId), '1')
    else sessionStorage.removeItem(storageKey(pageId, batchId))
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * 有写权限才出按钮。默认只读。
 * @param {string} pageId
 * @param {string} writeAction
 * @param {string} [batchId]
 * @returns {string}
 */
export function renderEditToggle(pageId, writeAction, batchId) {
  if (!canWrite(writeAction)) return ''
  const on = isEditing(pageId, batchId)
  return `<button type="button" class="btn line" data-edit-toggle aria-pressed="${on ? 'true' : 'false'}">${on ? '看证据' : '改记录'}</button>`
}

/**
 * 只切 class，不重绘整页。关掉编辑时给鸡舍折线图一次 resize。
 * @param {Element} root
 * @param {string} pageId
 * @param {string} writeAction
 * @param {string} [batchId]
 */
export function bindEditToggle(root, pageId, writeAction, batchId) {
  const btn = root.querySelector('[data-edit-toggle]')
  const page = root.querySelector('[data-evidence-page]')
  if (!btn || !page || !canWrite(writeAction)) return
  btn.addEventListener('click', () => {
    const next = !isEditing(pageId, batchId)
    setEditing(pageId, next, batchId)
    page.classList.toggle('is-editing', next)
    btn.textContent = next ? '看证据' : '改记录'
    btn.setAttribute('aria-pressed', next ? 'true' : 'false')
    if (!next) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.dispatchEvent(new Event('resize'))
        })
      })
    }
  })
}
