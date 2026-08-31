import './styles/app.css'
import { getState, subscribe, loadBatch, loadPublic, generateReport, generateTrace, chosenBatchId, setChosenBatchId } from './store.js'
import { renderShell, renderPublicShell, renderSkeleton, bindShell, updateChrome, slideNav } from './components/shell.js'
import { parseHash } from './pages/index.js'
import { getUser, hydrateAuth, canWrite } from './auth.js'
import * as loginPage from './pages/login.js'
import * as stage from './pages/stage.js'

const root = document.getElementById('app')
let drawing = false
let queued = false
let staffReady = false
let mode = ''
let lastRouteId = ''

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function onPageAnimEnd(page) {
  const clear = () => page.classList.remove('page-enter', 'page-leave', 'is-animating')
  page.addEventListener('animationend', clear, { once: true })
  setTimeout(clear, 400)
}

async function swapPage(html, animate) {
  const page = root.querySelector('#page')
  if (!page) return
  const reduced = reducedMotion()
  if (animate && !reduced && lastRouteId && !queued) {
    page.classList.add('page-leave', 'is-animating')
    await wait(120)
    page.classList.remove('page-leave')
  }
  page.innerHTML = html
  if (animate && !reduced) {
    page.classList.add('page-enter', 'is-animating')
    onPageAnimEnd(page)
  } else if (animate && reduced) {
    page.classList.add('page-enter')
    onPageAnimEnd(page)
  }
}

function onLogout() {
  staffReady = false
  mode = ''
  lastRouteId = ''
  setChosenBatchId('')
  location.hash = '#/dashboard'
  draw()
}

async function paintStaff(route, animate) {
  const state = getState()
  const inner = route.page.render(state, { publicView: false })
  if (mode !== 'staff') {
    root.innerHTML = renderShell(state, route, inner)
    bindShell(root, onLogout)
    mode = 'staff'
    updateChrome(root, state, route)
    const page = root.querySelector('#page')
    if (page && animate) {
      page.classList.add('page-enter', 'is-animating')
      onPageAnimEnd(page)
    }
  } else {
    updateChrome(root, state, route)
    await swapPage(inner, animate)
  }
  const pageRoot = root.querySelector('#page')
  if (route.page.bind) await route.page.bind(pageRoot, state)
  lastRouteId = route.id
}

async function draw() {
  if (drawing) {
    queued = true
    return
  }
  drawing = true
  try {
    do {
      queued = false
      const route = parseHash()
      const isStage = route.id === 'stage'
      const isPicker = route.id === 'batches'
      const publicRoute = route.id === 'consumer' || !!route.batchFromUrl
      const user = getUser()
      const sameRoute = lastRouteId === route.id && mode !== ''
      const chosen = chosenBatchId()

      if (mode === 'stage' && !isStage) {
        stage.unbind()
      }

      if (isStage) {
        if (mode !== 'stage') {
          root.innerHTML = stage.render()
          await stage.bind(root, route)
          mode = 'stage'
        } else {
          stage.retarget(route)
        }
        lastRouteId = route.id
        continue
      }

      if (!user && !publicRoute) {
        staffReady = false
        if (mode !== 'login') {
          root.innerHTML = loginPage.render()
          loginPage.bind(root, () => {
            staffReady = false
            draw()
          })
          mode = 'login'
          lastRouteId = 'login'
        }
        continue
      }

      if (!user && publicRoute) {
        const batchId = route.batchFromUrl || getState().batchId
        try {
          await loadPublic(batchId)
        } catch {
          /* keep last known / seed */
        }
        const inner = route.page.render(getState(), { publicView: true })
        if (mode !== 'public') {
          root.innerHTML = renderPublicShell(inner)
          mode = 'public'
          const page = root.querySelector('#page')
          if (page && !sameRoute) {
            page.classList.add('page-enter', 'is-animating')
            onPageAnimEnd(page)
          }
        } else {
          await swapPage(inner, !sameRoute)
        }
        lastRouteId = route.id
        continue
      }

      if (user && !isPicker && !chosen) {
        if (location.hash !== '#/batches') location.hash = '#/batches'
        if (isPicker) {
          /* fall through */
        } else {
          continue
        }
      }

      if (!staffReady && !isPicker) {
        if (mode !== 'staff') {
          root.innerHTML = renderShell(getState(), route, renderSkeleton())
          bindShell(root, onLogout)
          mode = 'staff'
          updateChrome(root, getState(), route)
        }
        try {
          await loadBatch(chosen)
          staffReady = true
        } catch {
          staffReady = false
          if (location.hash !== '#/batches') {
            location.hash = '#/batches'
            continue
          }
        }
      }

      if (isPicker) {
        await paintStaff(route, !sameRoute || mode !== 'staff')
        continue
      }

      if (!staffReady) continue

      if (new URLSearchParams(location.search).has('ready')) {
        if (canWrite('report') && !getState().report.generated) await generateReport(false)
        if (canWrite('trace') && !getState().trace.generated) await generateTrace(false)
      }

      await paintStaff(route, !sameRoute || mode !== 'staff')
    } while (queued)
  } finally {
    drawing = false
  }
}

window.addEventListener('hashchange', draw)
subscribe(draw)

window.addEventListener('resize', () => {
  if (mode === 'staff') slideNav(root, lastRouteId)
})

hydrateAuth().then(() => {
  if (!location.hash) location.hash = '#/dashboard'
  else draw()
})
