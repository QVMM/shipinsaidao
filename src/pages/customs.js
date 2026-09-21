import { renderNextBar } from '../components/journey-ui.js'

export const meta = { id: 'customs', title: '风险情报' }

export function render() {
  return `
    <div class="page-head">
      <h2>风险情报</h2>
    </div>
    ${renderNextBar('eval')}
    <div class="card story-lead">
      <strong>监管信息与批次证据分层管理</strong>
      风险情报用于识别检测重点；批次结论仍由养殖、检测、评价、报告与追溯记录共同形成。
    </div>
    <div class="health-board mt-14">
      <section class="card">
        <p class="qr-kicker">监管风险情报</p>
        <h3>氟苯尼考残留风险排查</h3>
        <p class="sub">某海关中心近期查验出口鸡肉时发现氟苯尼考残留风险。平台据此将氟苯尼考列为当前批次重点筛查项目。</p>
        <ul class="plain-facts">
          <li class="ok">情报来源：监管公开信息离线快照</li>
          <li class="ok">排查对象：当前焦点批次</li>
          <li class="ok">重点指标：氟苯尼考筛查与定量结果</li>
        </ul>
      </section>
      <section class="card">
        <p class="qr-kicker">判定边界</p>
        <h3>情报触发排查，证据形成结论</h3>
        <p class="sub">风险情报不直接决定批次是否上市；最终结论以本批次检测与复核记录为准。</p>
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
