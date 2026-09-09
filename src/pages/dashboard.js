import '../styles/dashboard.css'
import QRCode from 'qrcode'
import { getVerdict } from '../store.js'
import { humanWhy, threeFacts, residueClear, lowInflammation, hplcOf, inflamStatus, screenStatus, factClass } from '../lib/verdict.js'
import { renderVerdictStrip } from '../components/verdict-strip.js'
import { renderNextBar, bindJourneyActions } from '../components/journey-ui.js'
import { openStage } from '../lib/open-stage.js'
import { val } from '../bind-fields.js'
import { traceUrl } from './qr.js'

export const meta = { id: 'dashboard', title: '产品信息' }

/**
 * @param {number|string} v
 * @param {number|string} c
 * @returns {string}
 */
function barPair(v, c) {
  const vn = Number(v)
  const cn = Number(c)
  const max = Math.max(vn, cn, 1) * 1.15
  return `<div class="bar"><em style="--bar-w:${(cn / max) * 100}%"></em><i style="--bar-w:${(vn / max) * 100}%"></i></div>`
}

/**
 * @param {object} state
 * @returns {{ id: string, src: string, cap: string, alt: string, short: string }[]}
 */
function galleryItems(state) {
  const house = val(state.farm.house) || '密闭鸡舍'
  const additive = val(state.farm.additive) || '大蓟粗提物'
  const target = val(state.screen.target) || '氟苯尼考'
  return [
    { id: 'house', src: './evidence/house.jpg', cap: `${house}现场`, alt: '密闭鸡舍现场', short: house },
    { id: 'flock', src: './evidence/flock.jpg', cap: '本群肉鸡', alt: '肉鸡群', short: '肉鸡群' },
    { id: 'thistle', src: './evidence/thistle.jpg', cap: `${additive}入日粮`, alt: '大蓟粗提物', short: '大蓟入粮' },
    { id: 'lab', src: './evidence/lab.jpg', cap: `现场${target}筛查`, alt: '现场安全检测', short: '安全检测' },
  ]
}

/**
 * @param {boolean} pass
 * @returns {string}
 */
function stampHtml(stamp) {
  const official = stamp === '检验检测专用章'
  const label = official ? '检验检测<br>专用章' : (stamp || '待复核')
  return `<div class="dash-stamp ${official ? '' : 'hold'}" aria-hidden="true"><span>${label}</span></div>`
}

/**
 * @param {object} state
 * @returns {string}
 */
export function render(state) {
  const v = getVerdict()
  const facts = threeFacts(state)
  const why = humanWhy(state, v)
  const photos = galleryItems(state)
  const first = photos[0]
  const f = state.farm
  const s = state.screen
  const e = state.eval
  const residueOk = residueClear(state)
  const inflamOk = lowInflammation(state)
  const residue = `${val(s.target)} ${val(s.result)}`
  const reportNo = state.report.generated && state.report.no
    ? val(state.report.no)
    : '尚未生成'
  const verifyId = state.trace.generated && state.trace.verifyId
    ? val(state.trace.verifyId)
    : '尚未生成'
  const markers = [
    ['IL-1β', e.IL1b, e.IL1bCtrl],
    ['IL-6', e.IL6, e.IL6Ctrl],
    ['TNF-α', e.TNFa, e.TNFaCtrl],
    ['CRP', e.CRP, e.CRPCtrl],
  ]

  const hplc = hplcOf(state)
  const lodText = val(hplc.lod) || val(e.lod)

  return `
    <div class="dash-page">
      ${renderVerdictStrip(state)}
      <section class="dash-hero" aria-label="现场与合规证明">
        <div class="dash-gallery">
          <figure class="dash-gallery-main">
            <img data-gallery-main src="${first.src}" alt="${first.alt}" width="880" height="560">
            <figcaption data-gallery-cap>${first.cap}</figcaption>
          </figure>
          <div class="dash-thumbs" role="list">
            ${photos.map((p, i) => `
              <button type="button" data-thumb data-src="${p.src}" data-cap="${p.cap}" data-alt="${p.alt}" aria-current="${i === 0 ? 'true' : 'false'}">
                <img src="${p.src}" alt="" width="160" height="100">
                <span>${p.short}</span>
              </button>
            `).join('')}
          </div>
        </div>
        <article class="dash-cert ${v.pass ? 'pass' : 'hold'}">
          <p class="dash-cert-kicker">${val(state.productName)}</p>
          <h2 class="dash-cert-headline">食用农产品合规证明</h2>
          <p class="dash-cert-why">${why}</p>
          <ul class="dash-pledges">
            ${facts.map((item) => `<li class="${factClass(item)}">${item.text}</li>`).join('')}
          </ul>
          <dl class="dash-cert-fields">
            <div><dt>产品名称</dt><dd>${val(state.productName)}</dd></div>
            <div><dt>批次</dt><dd>${val(state.batchId)}</dd></div>
            <div><dt>产地主体</dt><dd>${val(f.name)}</dd></div>
            <div><dt>出栏日期</dt><dd>${val(f.plannedSlaughter)}</dd></div>
            <div><dt>质检结果</dt><dd>${residue}</dd></div>
            <div><dt>出栏数量</dt><dd>${val(f.count)} 羽</dd></div>
          </dl>
          ${stampHtml(v.stamp)}
        </article>
      </section>

      <section class="dash-cols" aria-label="从哪来、安不安全、健康、合规验证依据">
        <article class="dash-card">
          <h3>从哪来</h3>
          <p class="dash-card-lead">产地为${val(f.location)} ${val(f.house)}。</p>
          <div class="dash-map">
            <img src="./evidence/map.png" alt="荥阳、郑州一带示意地图，针位在康店镇" width="880" height="520">
          </div>
          <p class="dash-addr"><b>${val(f.name)}</b>${val(f.location)}<br>${val(f.house)} · ${val(f.breed)} · ${val(f.count)} 羽</p>
        </article>
        <article class="dash-card">
          <h3>安不安全</h3>
          <p class="dash-card-lead">${screenStatus(state) === 'pending' ? '安全检测尚未完成。' : residueOk ? '现场与实验室均未检出氟苯尼考。' : '残留筛查或定量未过关，暂不出证。'}</p>
          <div class="dash-lab-photo">
            <img src="./evidence/lab.jpg" alt="现场安全检测" width="640" height="360">
          </div>
          <div class="dash-result ${residueOk ? 'ok' : 'bad'}">
            <b>${residue}</b>
            <span>检出限 ${lodText} μg/kg · 样品 ${val(s.sampleId)}</span>
          </div>
          <a class="text-link" href="#/screen">查看安全检测</a>
        </article>
        <article class="dash-card">
          <h3>健康</h3>
          <p class="dash-card-lead">${inflamStatus(state) === 'pending' ? '尚未评价' : inflamOk ? '血清炎症因子优于同期常规对照。' : '炎症因子尚未达标，须复核。'}</p>
          ${inflamStatus(state) === 'pending' ? '<p class="dash-bar-hint">炎症评价尚未录入。</p>' : `
          <div class="bars dash-mini-bars">
            ${markers.map(([name, vn, cn]) => `
              <div class="bar-row"><span>${name}</span>${barPair(vn, cn)}<span>${val(vn)}</span></div>
            `).join('')}
          </div>
          <p class="dash-bar-hint">浅色为队内对照测定（同期常规日粮组），深色为本批次。深色更短表示炎症更低。</p>`}
          <a class="text-link" href="#/eval">查看健康评价</a>
        </article>
        <article class="dash-card">
          <h3>合规验证依据</h3>
          <p class="dash-card-lead">报告编号、核验号与操作人可核对，方可出证。</p>
          <dl class="dash-trust">
            <div><dt>报告编号</dt><dd>${reportNo}</dd></div>
            <div><dt>核验号</dt><dd>${verifyId}</dd></div>
            <div><dt>操作人</dt><dd>${val(s.operator)}</dd></div>
          </dl>
          <div class="dash-qr ${state.trace.generated ? '' : 'is-empty'}">
            ${state.trace.generated
              ? '<canvas id="dash-qr" width="96" height="96" aria-label="本批追溯码预览"></canvas><span>已出码 · 批次溯源页</span>'
              : '<div class="dash-qr-ph" aria-hidden="true"></div><span>出码后这里会显示追溯码</span>'}
          </div>
        </article>
      </section>

      ${renderNextBar('dashboard', '<button type="button" class="text-link" data-action="open-stage">打开数据大屏</button>')}
      <p class="quiet-batch">${val(state.batchId)} · ${val(f.name)} · ${val(f.count)} 羽 · ${val(f.plannedSlaughter)} 出栏</p>
    </div>
  `
}

/**
 * @param {Element} root
 * @param {object} state
 */
export function bind(root, state) {
  bindJourneyActions(root, state)
  root.querySelector('[data-action="open-stage"]')?.addEventListener('click', () => {
    openStage(state.batchId)
  })

  const main = root.querySelector('[data-gallery-main]')
  const cap = root.querySelector('[data-gallery-cap]')
  root.querySelectorAll('[data-thumb]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!main) return
      root.querySelectorAll('[data-thumb]').forEach((b) => b.setAttribute('aria-current', 'false'))
      btn.setAttribute('aria-current', 'true')
      main.style.opacity = '0'
      window.setTimeout(() => {
        main.src = btn.dataset.src || main.src
        main.alt = btn.dataset.alt || ''
        if (cap) cap.textContent = btn.dataset.cap || ''
        main.style.opacity = '1'
      }, 140)
    })
  })

  const canvas = root.querySelector('#dash-qr')
  if (canvas && state.trace.generated) {
    QRCode.toCanvas(canvas, traceUrl(state.batchId), {
      width: 96,
      margin: 0,
      color: { dark: '#12261c', light: '#fffdf8' },
    })
  }
}
