import { renderNextBar } from '../components/journey-ui.js'

export const meta = { id: 'customs', title: '海关中心政务公开数据平台' }

export function render() {
  return `
    <div class="page-head">
      <div>
        <p class="eyebrow">CUSTOMS PUBLIC DATA</p>
        <h2>海关中心政务公开数据平台</h2>
      </div>
      <a class="btn" href="#/stage">返回指挥舱</a>
    </div>
    ${renderNextBar('eval')}
    <div class="card story-lead">
      <strong>公开风险信息驱动检测，批次原始证据形成结论</strong>
      联网时可更新公开风险信息，本地保留最近一次核验数据；网络波动不影响已载入风险排查与批次证据核验。
    </div>
    <div class="health-board mt-14 customs-risk-board">
      <section class="card customs-risk-card">
        <div class="customs-risk-head">
          <div>
            <p class="qr-kicker">实验前风险预警</p>
            <h3>出口鸡肉氟苯尼考残留风险</h3>
          </div>
          <span class="status-badge pending">已进入排查</span>
        </div>
        <p class="sub">某海关中心拦截一批出口鸡肉，兽药残留氟苯尼考超标，请对我基地鸡肉进行风险排查。</p>
        <dl class="customs-risk-facts">
          <div><dt>公开数据来源</dt><dd>海关中心政务公开数据平台</dd></div>
          <div><dt>风险对象</dt><dd>出口鸡肉</dd></div>
          <div><dt>重点指标</dt><dd>氟苯尼考兽药残留</dd></div>
          <div><dt>处置方式</dt><dd>联动焦点批次安全检测</dd></div>
        </dl>
      </section>
      <section class="card">
        <p class="qr-kicker">数据接入策略</p>
        <h3>在线更新，本地保留</h3>
        <p class="sub">比赛现场优先读取已审核的公开信息；联网条件具备时更新风险数据，网络不可用时继续使用最近一次本地核验记录。</p>
        <ul class="plain-facts">
          <li class="ok">不依赖现场网络完成风险排查</li>
          <li class="ok">不展示未经核验的实时信息</li>
          <li class="ok">不以风险信息替代批次检测结论</li>
        </ul>
      </section>
      <section class="card">
        <p class="qr-kicker">证据闭环</p>
        <h3>风险触发排查，检测决定放行</h3>
        <p class="sub">预警负责确定检测重点；最终上市结论仍以当前批次的养殖记录、安全检测、健康评价、检测报告与追溯记录为准。</p>
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
