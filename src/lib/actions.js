import { generateReport, generateTrace, getState, setFlash } from '../store.js'

export async function ensureReport(state, force = false) {
  try {
    if (state.report.generated && !force) return
    await generateReport(force)
  } catch (err) {
    setFlash(err.message || '不能生成报告。')
  }
}

export async function ensureTrace(_state, force = false) {
  try {
    await generateTrace(force)
  } catch (err) {
    setFlash(err.message || '不能出追溯码。')
  }
}

export async function jumpReport(state) {
  await ensureReport(state)
  if (getState().report.generated) location.hash = '#/report'
}
