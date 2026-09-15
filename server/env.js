import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))

export function loadEnv() {
  const file = resolve(root, '.env')
  if (!existsSync(file)) return
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 1) continue
    const key = line.slice(0, i).trim()
    let val = line.slice(i + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (process.env[key] == null) process.env[key] = val
  }
}

/**
 * Production must set a real SESSION_SECRET (not the cookie/dev placeholder).
 */
export function assertProductionSecrets() {
  if (process.env.NODE_ENV !== 'production') return
  const s = String(process.env.SESSION_SECRET || '').trim()
  if (!s || s === 'dev-only-change-me') {
    console.error(
      '[fatal] NODE_ENV=production requires a strong SESSION_SECRET (not empty / not "dev-only-change-me"). Set it in Render env.',
    )
    process.exit(1)
  }
}

/**
 * Demo fallback is intentional for the competition booth.
 * Never log the value.
 * @returns {string}
 */
export function sealSecret() {
  const v = process.env.SEAL_SECRET
  return v && String(v).length ? String(v) : 'tihua-demo-seal'
}
