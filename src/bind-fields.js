import { patchPath, patchMed, addMed, patchSample } from './store.js'
import { canWrite } from './auth.js'

/**
 * 表单字段对应的写权限。farm.* 与用药本走 farm，screen.* 走 screen，eval.* 走 eval，
 * 顶层批次元数据走 meta。
 * @param {string} path
 * @returns {string | null}
 */
export function writeActionForPath(path) {
  if (!path) return null
  if (path === 'farm' || path.startsWith('farm.') || path === 'med') return 'farm'
  if (path === 'screen' || path.startsWith('screen.')) return 'screen'
  if (path === 'eval' || path.startsWith('eval.')) return 'eval'
  if (
    path === 'batchId'
    || path === 'productName'
    || path === 'brand'
    || path === 'platform'
    || path === 'team'
    || path === 'program'
    || path.startsWith('program.')
  ) {
    return 'meta'
  }
  return null
}

/**
 * @param {string | null} action
 * @returns {boolean}
 */
function writable(action) {
  return !!action && canWrite(action)
}

/**
 * 把带 data-field / data-med / data-sample 的表单接到 store。无写权限则禁用且不 PATCH。
 * @param {ParentNode} root
 */
export function bindFields(root) {
  root.querySelectorAll('[data-field]').forEach((el) => {
    const action = writeActionForPath(el.dataset.field || '')
    if (!writable(action)) {
      el.disabled = true
      el.setAttribute('readonly', '')
      return
    }
    el.addEventListener('change', () => patchPath(el.dataset.field, el.value))
    el.addEventListener('blur', () => patchPath(el.dataset.field, el.value))
  })
  root.querySelectorAll('[data-med]').forEach((el) => {
    if (!writable('farm')) {
      el.disabled = true
      el.setAttribute('readonly', '')
      return
    }
    el.addEventListener('change', () => patchMed(Number(el.dataset.med), el.dataset.key, el.value))
    el.addEventListener('blur', () => patchMed(Number(el.dataset.med), el.dataset.key, el.value))
  })
  root.querySelectorAll('[data-sample]').forEach((el) => {
    if (!writable('screen')) {
      el.disabled = true
      el.setAttribute('readonly', '')
      return
    }
    el.addEventListener('change', () => patchSample(Number(el.dataset.sample), el.dataset.key, el.value))
    el.addEventListener('blur', () => patchSample(Number(el.dataset.sample), el.dataset.key, el.value))
  })
  const add = root.querySelector('[data-action="add-med"]')
  if (add) {
    if (!writable('farm')) add.disabled = true
    else add.addEventListener('click', addMed)
  }
}

/**
 * 写入 HTML 属性时的转义。
 * @param {unknown} v
 * @returns {string}
 */
export function val(v) {
  return v == null ? '' : String(v).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
}
