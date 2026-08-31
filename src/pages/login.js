import { markSvg } from '../svg.js'
import { login } from '../auth.js'

export const meta = { id: 'login', title: '登录' }

export function render() {
  return `
    <div class="login-page">
      <div class="login-card">
        <div class="login-brand">
          <div class="brand-mark">${markSvg}</div>
          <div>
            <h1>替抗蓟化</h1>
            <p>减抗鸡肉 · 全链条质控</p>
          </div>
        </div>
        <p class="login-lead">工作人员登录后选择批次，查看并维护本岗数据。</p>
        <form class="login-form" data-login>
          <div class="field">
            <label for="login-user">用户名</label>
            <input id="login-user" name="username" autocomplete="username" required>
          </div>
          <div class="field">
            <label for="login-pass">密码</label>
            <input id="login-pass" name="password" type="password" autocomplete="current-password" required>
          </div>
          <p class="login-error" data-login-error hidden></p>
          <button type="submit" class="btn gold">进入</button>
        </form>
        <p class="login-hint">买家扫码不用登录。工作账号向管理员领取，默认口令须更换。</p>
      </div>
    </div>
  `
}

export function bind(root, onReady) {
  const form = root.querySelector('[data-login]')
  const err = root.querySelector('[data-login-error]')
  const btn = form?.querySelector('button[type="submit"]')
  if (!form) return
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const fd = new FormData(form)
    const username = String(fd.get('username') || '').trim()
    const password = String(fd.get('password') || '')
    err.hidden = true
    form.querySelectorAll('input').forEach((el) => el.classList.remove('is-error'))
    if (btn) {
      btn.classList.add('is-busy')
      btn.disabled = true
    }
    try {
      await login(username, password)
      location.hash = '#/batches'
      onReady?.()
    } catch (ex) {
      err.textContent = ex.message || '登录失败。'
      err.hidden = false
      form.querySelectorAll('input').forEach((el) => el.classList.add('is-error'))
    } finally {
      if (btn) {
        btn.classList.remove('is-busy')
        btn.disabled = false
      }
    }
  })
}
