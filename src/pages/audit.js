import { getState, loadAudit, saveReview } from '../store.js'
import { canWrite } from '../auth.js'
import { val } from '../bind-fields.js'
import { renderNextBar } from '../components/journey-ui.js'
export const meta = { id: 'audit', title: '质量审核' }

/**
 * 折叠连续相同动作，只展示最近约 15 条，不删库。
 * @param {object[]} items
 * @returns {object[]}
 */
function collapseAudit(items) {
  const out = []
  for (const it of items || []) {
    const prev = out[out.length - 1]
    const key = `${it.action}|${it.entity}|${it.entityId || ''}|${it.username || ''}`
    if (prev && prev._key === key) {
      prev._n = (prev._n || 1) + 1
      continue
    }
    out.push({ ...it, _key: key, _n: 1 })
  }
  return out.slice(0, 15)
}


/**
 * @param {string} iso
 * @returns {string}
 */
function fmtAt(iso) {
  const s = String(iso || '')
  if (s.length >= 16) return s.slice(0, 16).replace('T', ' ')
  return s || '—'
}

/**
 * @param {object} state
 * @returns {string}
 */
export function render(state) {
  const r = state.review || {}
  const writable = canWrite('audit')
  const dis = writable ? '' : 'disabled'
  return `
    <div class="page-head">
      <h2>质量审核</h2>
      <span class="chip ${r.reviewed ? 'ok' : 'warn'}">${r.reviewed ? '已审核' : '待审核'}</span>
    </div>
    ${renderNextBar('audit')}
    <div class="card story-lead">
      样品受理、检测数据与报告签发须由溯源岗或管理员签署。各岗页面可查看；无权限账号不能改审核状态。
    </div>
    <div class="card">
      <h3>审核项</h3>
      <form class="form" data-review-form>
        <label class="check-row">
          <input type="checkbox" name="sampleAccept" ${r.sampleAccept ? 'checked' : ''} ${dis}>
          <span>样品受理审核</span>
        </label>
        <label class="check-row">
          <input type="checkbox" name="dataReview" ${r.dataReview ? 'checked' : ''} ${dis}>
          <span>检测数据复核</span>
        </label>
        <label class="check-row">
          <input type="checkbox" name="reportIssue" ${r.reportIssue ? 'checked' : ''} ${dis}>
          <span>报告签发审核</span>
        </label>
        <label class="check-row">
          <input type="checkbox" name="reviewed" ${r.reviewed ? 'checked' : ''} ${dis}>
          <span>已复核</span>
        </label>
        <div class="field">
          <label>审核人</label>
          <input name="reviewer" value="${val(r.reviewer)}" ${dis} placeholder="签署人姓名 / 工号">
        </div>
        <p class="sub">最近签署 ${val(r.reviewedAt || '—')}</p>
        ${writable ? '<button type="submit" class="btn gold" data-action="save-review">保存审核</button>' : '<p class="sub">当前账号为只读。</p>'}
        <p class="login-error" data-review-error hidden></p>
      </form>
    </div>
    <div class="card mt-14">
      <h3>操作日志</h3>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>时间</th><th>动作</th><th>对象</th><th>账号</th></tr></thead>
          <tbody data-audit-log>
            <tr><td colspan="4" class="sub">正在读取…</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `
}

/**
 * @param {Element} root
 * @param {object} state
 */
export async function bind(root, state) {
  const form = root.querySelector('[data-review-form]')
  const err = root.querySelector('[data-review-error]')
  if (form && canWrite('audit')) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      if (err) err.hidden = true
      const fd = new FormData(form)
      const btn = form.querySelector('[data-action="save-review"]')
      if (btn) {
        btn.classList.add('is-busy')
        btn.disabled = true
      }
      try {
        await saveReview({
          sampleAccept: fd.get('sampleAccept') === 'on',
          dataReview: fd.get('dataReview') === 'on',
          reportIssue: fd.get('reportIssue') === 'on',
          reviewed: fd.get('reviewed') === 'on',
          reviewer: String(fd.get('reviewer') || ''),
        })
      } catch (ex) {
        if (err) {
          err.textContent = ex.message || '保存失败。'
          err.hidden = false
        }
      } finally {
        if (btn) {
          btn.classList.remove('is-busy')
          btn.disabled = false
        }
      }
    })
  }

  const body = root.querySelector('[data-audit-log]')
  if (!body) return
  try {
    const raw = await loadAudit(state.batchId || getState().batchId)
    const items = collapseAudit(raw)
    if (!items.length) {
      body.innerHTML = '<tr><td colspan="4" class="sub">暂无日志</td></tr>'
      return
    }
    body.innerHTML = items.map((it) => `
      <tr>
        <td>${val(fmtAt(it.at))}</td>
        <td>${val(it.action)}${it._n > 1 ? ` ×${it._n}` : ''}</td>
        <td>${val(it.entity)}${it.entityId ? ` · ${val(it.entityId)}` : ''}</td>
        <td>${val(it.displayName || it.username || '—')}</td>
      </tr>
    `).join('')
  } catch (ex) {
    body.innerHTML = `<tr><td colspan="4" class="sub">${val(ex.message || '读取失败')}</td></tr>`
  }
}
