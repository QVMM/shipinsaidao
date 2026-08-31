/** 顶部细进度条。可嵌套。不挡页面。 */

let depth = 0

function paint() {
  document.documentElement.classList.toggle('is-busy', depth > 0)
}

export function beginBusy() {
  depth += 1
  paint()
}

export function endBusy() {
  depth = Math.max(0, depth - 1)
  paint()
}

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function busy(fn) {
  beginBusy()
  try {
    return await fn()
  } finally {
    endBusy()
  }
}

/**
 * 按钮上的本地转圈。页面被换掉也无所谓。
 * @param {Element | null} el
 * @param {() => unknown} fn
 */
export function armButton(el, fn) {
  if (!el) return
  el.addEventListener('click', async () => {
    if (el.classList.contains('is-busy')) return
    el.classList.add('is-busy')
    el.setAttribute('aria-busy', 'true')
    const wasDisabled = el.hasAttribute('disabled')
    if ('disabled' in el) el.disabled = true
    try {
      await fn()
    } finally {
      el.classList.remove('is-busy')
      el.removeAttribute('aria-busy')
      if ('disabled' in el && !wasDisabled) el.disabled = false
    }
  })
}
