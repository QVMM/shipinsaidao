import '../styles/dashboard.css'
import { bindFields, val } from '../bind-fields.js'
import { fedThistle, noFeedAntibiotic } from '../lib/verdict.js'
import { renderNextBar } from '../components/journey-ui.js'
import { iconPlus } from '../icons.js'

export const meta = { id: 'farm', title: '养殖过程' }

/**
 * @param {unknown} s
 * @returns {string}
 */
function day(s) {
  return String(s || '').slice(0, 10)
}

/**
 * 日粮里第一次写大蓟的日期，没有就用进苗日。
 * @param {object} state
 * @returns {string}
 */
function thistleFeedDate(state) {
  const row = (state.farm.medLog || []).find((r) => /蓟/.test(r.item || ''))
  return day(row?.date || state.farm.stockDate)
}

/**
 * @param {object} state
 * @returns {string}
 */
export function render(state) {
  const f = state.farm
  const s = state.screen
  const e = state.eval
  const thistle = fedThistle(state)
  const noAbx = noFeedAntibiotic(state)
  const story = [
    { src: './evidence/flock.jpg', title: '进苗', date: day(f.stockDate), note: `${val(f.breed)} 入舍` },
    { src: './evidence/thistle.jpg', title: '喂大蓟', date: thistleFeedDate(state), note: `${val(f.additive)} ${val(f.dose)}` },
    { src: './evidence/meat.jpg', title: '出栏', date: day(f.plannedSlaughter), note: `${val(f.count)} 羽计划出栏` },
    { src: './evidence/lab.jpg', title: '安全检测', date: day(s.sampleDate), note: `${val(s.target)} ${val(s.result)}` },
    { src: './evidence/lab.jpg', title: '健康评价', date: day(e.testDate), note: val(e.valueText) },
  ]
  return `
    <div class="page-head">
      <h2>养殖过程</h2>
    </div>
    ${renderNextBar('farm')}
    <div class="card story-lead">
      ${thistle ? `本批次日粮添加 <strong>大蓟粗提物</strong>（${val(f.additive)} ${val(f.dose)}）。` : '日粮尚未记录大蓟。'}
      ${noAbx ? '用药记录：<strong>饲用抗生素未使用</strong>。' : '用药记录中饲用抗生素尚未清零。'}
      疫苗按规程执行，不属于饲用抗生素。
    </div>
    <section class="dash-story" aria-label="本批次日程">
      <h3>本批次日程</h3>
      <ol>
        ${story.map((n) => `
          <li>
            <img src="${n.src}" alt="" width="72" height="72">
            <b>${n.title}</b>
            <time>${n.date}</time>
            <span>${n.note}</span>
          </li>
        `).join('')}
      </ol>
    </section>
    <div class="grid g-12 mt-14">
      <div class="card">
        <h3>批次与基地</h3>
        <div class="form two">
          <div class="field"><label>批次号</label><input data-field="batchId" value="${val(state.batchId)}"></div>
          <div class="field"><label>鸡群编号</label><input data-field="farm.flockId" value="${val(f.flockId)}"></div>
          <div class="field span2"><label>养殖基地</label><input data-field="farm.name" value="${val(f.name)}"></div>
          <div class="field span2"><label>共建单位</label><input data-field="farm.partners" value="${val(f.partners)}"></div>
          <div class="field span2"><label>地址</label><input data-field="farm.location" value="${val(f.location)}"></div>
          <div class="field"><label>鸡舍</label><input data-field="farm.house" value="${val(f.house)}"></div>
          <div class="field"><label>品种</label><input data-field="farm.breed" value="${val(f.breed)}"></div>
          <div class="field"><label>入孵</label><input data-field="farm.hatchDate" value="${val(f.hatchDate)}"></div>
          <div class="field"><label>进苗</label><input data-field="farm.stockDate" value="${val(f.stockDate)}"></div>
          <div class="field"><label>计划出栏</label><input data-field="farm.plannedSlaughter" value="${val(f.plannedSlaughter)}"></div>
          <div class="field"><label>本群羽数</label><input data-field="farm.count" value="${val(f.count)}"></div>
          <div class="field"><label>密度</label><input data-field="farm.density" value="${val(f.density)}"></div>
        </div>
      </div>
      <div class="card">
        <h3>喂了什么</h3>
        <div class="form">
          <div class="field"><label>日粮</label><input data-field="farm.feedBrand" value="${val(f.feedBrand)}"></div>
          <div class="field"><label>添加物</label><input data-field="farm.additive" value="${val(f.additive)}"></div>
          <div class="field"><label>添加量</label><input data-field="farm.dose" value="${val(f.dose)}"></div>
          <div class="field"><label>起始日龄</label><input data-field="farm.doseStartDay" value="${val(f.doseStartDay)}"></div>
          <div class="field"><label>料肉比</label><input data-field="farm.fcr" value="${val(f.fcr)}"></div>
          <div class="field"><label>死淘率 %</label><input data-field="farm.mortality" value="${val(f.mortality)}"></div>
          <div class="field"><label>备注</label><textarea data-field="farm.feedNote">${val(f.feedNote)}</textarea></div>
        </div>
        <p class="sub mt-10">对照料肉比 ${val(f.fcrControl)} · 对照死淘 ${val(f.mortalityControl)}% · 队内对照测定（同期常规日粮组）</p>
      </div>
    </div>
    <div class="card mt-14 farm-cam">
      <h3>合作鸡场监控</h3>
      <div class="cam-crossfade" aria-label="合作鸡场监控（待接入实时流）">
        <img src="./evidence/house.jpg" alt="合作鸡场鸡舍" width="880" height="360">
        <img src="./evidence/flock.jpg" alt="合作鸡场鸡群" width="880" height="360">
      </div>
      <p class="sub mt-10">合作鸡场监控（待接入实时流）</p>
    </div>
    <div class="card mt-14">
      <div class="card-head">
        <h3>用药与添加记录</h3>
        <button type="button" class="btn line" data-action="add-med">${iconPlus}<span>增一行</span></button>
      </div>
      <div class="table-wrap">
      <table class="table">
        <thead><tr><th>日期</th><th>项目</th><th class="num">剂量</th><th>目的</th><th>结果</th></tr></thead>
        <tbody>
          ${(f.medLog || []).map((row, i) => `
            <tr>
              <td><input data-med="${i}" data-key="date" value="${val(row.date)}"></td>
              <td><input data-med="${i}" data-key="item" value="${val(row.item)}"></td>
              <td class="num"><input data-med="${i}" data-key="dose" value="${val(row.dose)}"></td>
              <td><input data-med="${i}" data-key="purpose" value="${val(row.purpose)}"></td>
              <td><input data-med="${i}" data-key="result" value="${val(row.result)}"></td>
            </tr>`).join('')}
        </tbody>
      </table>
      </div>
    </div>
  `
}

/**
 * @param {Element} root
 */
export function bind(root) {
  bindFields(root)
}
