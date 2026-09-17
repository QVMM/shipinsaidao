import { renderNextBar } from '../components/journey-ui.js'

export const meta = { id: 'customs', title: '法规与风险' }

export function render() {
  return `
    <div class="page-head">
      <h2>法规与风险</h2>
    </div>
    ${renderNextBar('eval')}
    <div class="card story-lead">
      <strong>本地证据与外部信息严格分开</strong>
      当前离线实例未配置实时监管或海关数据源，不会将推测内容包装成监管通报。
    </div>
    <div class="health-board mt-14">
      <section class="card">
        <p class="qr-kicker">外部信息源</p>
        <h3>尚未接入实时监管数据</h3>
        <p class="sub">断网状态下，系统只展示本机已保存的批次档案。需要监管信息时，应由管理员配置经过授权、可核验的数据源。</p>
        <ul class="plain-facts">
          <li class="wait">海关与市场监管公开信息：未接入</li>
          <li class="wait">外部法规更新服务：未接入</li>
          <li class="ok">本地批次证据：可离线核验</li>
        </ul>
      </section>
      <section class="card">
        <p class="qr-kicker">当前可用依据</p>
        <h3>仅使用平台内可追溯记录</h3>
        <p class="sub">批次判断以养殖记录、安全检测、健康评价、检测报告和追溯封存为准。</p>
        <div class="djtk-cabin-links">
          <a href="#/screen" class="djtk-cabin-link-card"><span class="djtk-cabin-link-title">核对安全检测</span><span class="djtk-cabin-link-go">打开 →</span></a>
          <a href="#/report" class="djtk-cabin-link-card"><span class="djtk-cabin-link-title">核对检测报告</span><span class="djtk-cabin-link-go">打开 →</span></a>
          <a href="#/qr" class="djtk-cabin-link-card"><span class="djtk-cabin-link-title">核对追溯封存</span><span class="djtk-cabin-link-go">打开 →</span></a>
        </div>
      </section>
    </div>
  `
}

export function bind() {}
