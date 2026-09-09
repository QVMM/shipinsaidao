import { listBatches, loadBatch, chosenBatchId, createBatch } from '../store.js'
import { val } from '../bind-fields.js'
import { canWrite } from '../auth.js'

export const meta = { id: 'batches', title: '选择批次' }

/**
 * @returns {string}
 */
export function render() {
  return `
    <div class="page-head">
      <h2>选择批次</h2>
      ${canWrite('create') ? '<button type="button" class="btn gold" data-action="new-batch">新建批次</button>' : ''}
    </div>
    <div class="card story-lead">登录完成后先选定批次，再进入产品信息。可点列表或手工输入批次号。</div>
    <div class="card">
      <h3>在库批次</h3>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>批次</th><th>产品</th><th>基地</th><th class="num">羽数</th><th></th></tr></thead>
          <tbody data-batch-list>
            <tr><td colspan="5" class="sub">正在读取…</td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="card mt-14">
      <h3>输入批次号</h3>
      <form class="form two" data-batch-form>
        <div class="field span2">
          <label for="batch-typed">批次号</label>
          <input id="batch-typed" name="batchId" value="${val(chosenBatchId())}" placeholder="例如 蓟化-2026-0812" required>
        </div>
        <div class="field">
          <button type="submit" class="btn gold">确认打开</button>
        </div>
        <p class="login-error" data-batch-error hidden></p>
      </form>
    </div>
  `
}

/**
 * @param {Element} root
 */
export async function bind(root) {
  const body = root.querySelector('[data-batch-list]')
  const form = root.querySelector('[data-batch-form]')
  const err = root.querySelector('[data-batch-error]')
  const current = chosenBatchId()

  async function openBatch(id) {
    const batchId = String(id || '').trim()
    if (!batchId) return
    if (err) err.hidden = true
    try {
      await loadBatch(batchId)
      location.hash = '#/dashboard'
    } catch (ex) {
      if (err) {
        err.textContent = ex.message || '没有这个批次。'
        err.hidden = false
      }
    }
  }

  if (body) {
    try {
      const items = await listBatches()
      if (!items.length) {
        body.innerHTML = '<tr><td colspan="5" class="sub">库中暂无批次</td></tr>'
      } else {
        body.innerHTML = items.map((it) => `
          <tr class="${it.batchId === current ? 'is-current' : ''}">
            <td><code>${val(it.batchId)}</code></td>
            <td>${val(it.productName || '')}</td>
            <td>${val(it.farmName || '')}</td>
            <td class="num">${it.count == null || it.count === '' ? '—' : val(it.count)}</td>
            <td><button type="button" class="btn line" data-open-batch="${val(it.batchId)}">打开</button></td>
          </tr>
        `).join('')
      }
    } catch (ex) {
      body.innerHTML = `<tr><td colspan="5" class="sub">${val(ex.message || '读取失败')}</td></tr>`
    }
    body.querySelectorAll('[data-open-batch]').forEach((btn) => {
      btn.addEventListener('click', () => openBatch(btn.dataset.openBatch))
    })
  }

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      const fd = new FormData(form)
      openBatch(String(fd.get('batchId') || ''))
    })
  }

  const createBtn = root.querySelector('[data-action="new-batch"]')
  if (createBtn && canWrite('create')) {
    createBtn.addEventListener('click', async () => {
      if (err) err.hidden = true
      createBtn.classList.add('is-busy')
      createBtn.disabled = true
      try {
        const data = await createBatch()
        await loadBatch(data.batchId)
        location.hash = '#/dashboard'
      } catch (ex) {
        if (err) {
          err.textContent = ex.message || '不能新建批次。'
          err.hidden = false
        }
      } finally {
        createBtn.classList.remove('is-busy')
        createBtn.disabled = false
      }
    })
  }
}
