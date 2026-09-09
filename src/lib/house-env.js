/**
 * 鸡舍实况：鸡场内控阈值，展示点由序列 + 上海时辰决定。
 * 农场页与指挥舱共用，避免各写一套数。
 */

export const HOUSE_ENV_LIMITS = {
  temp: { min: 18, max: 26, unit: '°C', label: '温度' },
  humidity: { min: 50, max: 70, unit: '%', label: '湿度' },
  nh3: { min: 0, max: 15, unit: 'ppm', label: '氨气' },
  co2: { min: 0, max: 2500, unit: 'ppm', label: '二氧化碳' },
}

/**
 * @param {number} n
 * @returns {number}
 */
function round1(n) {
  return Math.round(n * 10) / 10
}

/**
 * @param {number} n
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n))
}

/**
 * @param {string} key
 * @param {unknown} value
 * @returns {{ ok: boolean, chip: string }}
 */
export function houseEnvBand(key, value) {
  const lim = HOUSE_ENV_LIMITS[key]
  const n = Number(value)
  if (!lim || !Number.isFinite(n)) return { ok: true, chip: '正常' }
  const ok = n >= lim.min && n <= lim.max
  return { ok, chip: ok ? '正常' : '偏高' }
}

/**
 * @param {Date} [now]
 * @returns {number}
 */
export function shanghaiHour(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(now)
  return Number(parts.find((p) => p.type === 'hour')?.value || 0)
}

/**
 * @param {Date} [now]
 * @returns {{ hour: number, minute: number }}
 */
export function shanghaiHourMinute(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const g = (t) => Number(parts.find((p) => p.type === t)?.value || 0)
  return { hour: g('hour'), minute: g('minute') }
}

/**
 * @param {Date} [now]
 * @returns {{ year: string, month: string, day: string, iso: string, compact: string }}
 */
export function shanghaiYmd(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const g = (t) => parts.find((p) => p.type === t)?.value || ''
  const year = g('year')
  const month = g('month')
  const day = g('day')
  return {
    year,
    month,
    day,
    iso: `${year}-${month}-${day}`,
    compact: `${year}-${month}${day}`,
  }
}

/**
 * @param {unknown} at
 * @returns {{ hour: number, minute: number } | null}
 */
function parseClock(at) {
  const m = String(at || '').match(/\b(\d{1,2}):(\d{2})/)
  if (!m) return null
  return { hour: Number(m[1]), minute: Number(m[2]) }
}

/**
 * @param {string} seed
 * @returns {() => number}
 */
function mulberry32(seed) {
  let h = 2166136261 >>> 0
  const s = String(seed)
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  let a = h >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * @param {number} u
 * @returns {number}
 */
function ease(u) {
  const x = clamp(u, 0, 1)
  return x * x * (3 - 2 * x)
}

/**
 * 半小时一条，08:00–19:00 共 23 点。种子 `${day}|${batchId}`，刷新不变。
 * @param {string} [day] YYYY-MM-DD
 * @param {string} [batchId]
 * @returns {{ temp: number, humidity: number, nh3: number, co2: number, series: object[] }}
 */
export function makeDemoHouseEnv(day = '2026-08-11', batchId = '') {
  const rng = mulberry32(`${day}|${batchId}`)
  const ventOffset = Math.floor(rng() * 2)
  const fanDip = 0.2 + rng() * 0.1
  const nh3Vent = 0.72 + rng() * 0.16
  const co2Vent = 48 + rng() * 14
  const n = 23
  let walkT = 0
  let walkH = 0
  let nh3Saw = rng() * 0.06
  let co2Saw = rng() * 4
  const series = []
  for (let i = 0; i < n; i += 1) {
    const minutes = i * 30
    const hour = 8 + Math.floor(minutes / 60)
    const minute = minutes % 60
    const tHours = minutes / 60
    const u = i / (n - 1)
    const vent = i > 0 && (i - ventOffset) % 4 === 0
    const ventAgo = i > 0 && (i - 1 - ventOffset) % 4 === 0

    const tempTrend = tHours <= 5
      ? 22.6 + (25.1 - 22.6) * ease(tHours / 5)
      : 25.1 + (23.1 - 25.1) * ease((tHours - 5) / 6)
    const humTrend = tHours <= 5
      ? 65 + (56 - 65) * ease(tHours / 5)
      : 56 + (63 - 56) * ease((tHours - 5) / 6)

    walkT = walkT * 0.72 + (rng() - 0.5) * 0.08
    walkH = walkH * 0.7 + (rng() - 0.5) * 0.35
    const fan = vent ? fanDip : ventAgo ? fanDip * 0.4 : 0

    if (vent) {
      nh3Saw = Math.max(0, nh3Saw - nh3Vent)
      co2Saw = Math.max(0, co2Saw - co2Vent)
    } else {
      nh3Saw += 0.24 + rng() * 0.08
      co2Saw += 16 + rng() * 6
    }

    const temp = round1(clamp(
      tempTrend + walkT + (rng() - 0.5) * 0.3 - fan,
      18,
      26,
    ))
    const humidity = round1(clamp(
      humTrend + walkH + (rng() - 0.5) * 1.6 + fan * 2.2,
      50,
      70,
    ))
    const nh3 = round1(clamp(
      6.6 + (9.2 - 6.6) * u + nh3Saw + (rng() - 0.5) * 0.16,
      0,
      11.8,
    ))
    const co2 = Math.round(clamp(
      1080 + (1320 - 1080) * u + co2Saw + (rng() - 0.5) * 14,
      0,
      2500,
    ))
    series.push({
      at: `${day} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      temp,
      humidity,
      nh3,
      co2,
    })
  }
  const noon = series.find((p) => {
    const t = parseClock(p.at)
    return t && t.hour === 12 && t.minute === 0
  }) || series[8]
  return {
    temp: noon.temp,
    humidity: noon.humidity,
    nh3: noon.nh3,
    co2: noon.co2,
    series,
  }
}

/**
 * @param {object[]} series
 * @param {number} hour
 * @param {number} minute
 * @returns {object | undefined}
 */
function lastPointAtOrBefore(series, hour, minute) {
  const nowM = hour * 60 + minute
  let last
  for (const p of series) {
    const t = parseClock(p.at)
    if (!t) continue
    if (t.hour * 60 + t.minute <= nowM) last = p
  }
  return last
}

/**
 * 已出证出码的批次钉在 12:00，在养批次跟上海时辰（半小时格）。
 * @param {object[]} series
 * @param {{ listed?: boolean }} [opts]
 * @param {Date} [now]
 * @returns {object | undefined}
 */
export function pickHouseEnvPoint(series, opts = {}, now = new Date()) {
  if (!Array.isArray(series) || !series.length) return undefined
  if (opts.listed) {
    const noon = series.find((p) => {
      const t = parseClock(p.at)
      return t && t.hour === 12 && t.minute === 0
    })
    if (noon) return noon
    return lastPointAtOrBefore(series, 12, 0) || series[0]
  }

  const clock = shanghaiHourMinute(now)
  let hour = clock.hour
  let minute = Number.isFinite(clock.minute) ? clock.minute : 0
  if (Number.isFinite(clock.minute)) {
    if (minute < 15) minute = 0
    else if (minute < 45) minute = 30
    else {
      hour = (hour + 1) % 24
      minute = 0
    }
  } else {
    minute = 0
  }

  const exact = series.find((p) => {
    const t = parseClock(p.at)
    return t && t.hour === hour && t.minute === minute
  })
  if (exact) return exact

  const nowM = clock.hour * 60 + (Number.isFinite(clock.minute) ? clock.minute : 0)
  if (nowM < 8 * 60 || nowM > 19 * 60) return series[series.length - 1]
  return lastPointAtOrBefore(series, clock.hour, clock.minute || 0) || series[series.length - 1]
}

/**
 * 旧演示：12 点小时列，或整列按旧 modulo 生成。
 * @param {object} [houseEnv]
 * @returns {boolean}
 */
export function looksLikeOldHouseEnv(houseEnv) {
  const series = Array.isArray(houseEnv?.series) ? houseEnv.series : []
  if (!series.length) return false
  if (series.length <= 13) return true
  if (series.length === 12 && Number(series[0]?.temp) === 23.6) return true
  const oldTemp = series.every((p, i) => Number(p.temp) === Math.round((23.6 + (i % 5) * 0.4) * 10) / 10)
  const oldHum = series.every((p, i) => Number(p.humidity) === 58 + (i % 7))
  const oldNh3 = series.every((p, i) => Number(p.nh3) === Math.round((7.4 + (i % 5) * 0.3) * 10) / 10)
  const oldCo2 = series.every((p, i) => Number(p.co2) === 1120 + i * 18)
  return oldTemp || oldHum || oldNh3 || oldCo2
}

/**
 * 展示用当前点：上海时辰对齐序列。没有序列则退回存盘值。
 * @param {object} [houseEnv]
 * @param {Date} [now]
 * @returns {{ temp: unknown, humidity: unknown, nh3: unknown, co2: unknown, series: object[] }}
 */
export function resolveHouseEnv(houseEnv, now = new Date(), opts = {}) {
  const raw = houseEnv && typeof houseEnv === 'object' ? houseEnv : {}
  const series = Array.isArray(raw.series) ? raw.series : []
  if (!series.length) {
    return {
      temp: raw.temp ?? '',
      humidity: raw.humidity ?? '',
      nh3: raw.nh3 ?? '',
      co2: raw.co2 ?? '',
      series,
    }
  }
  const listed = !!opts.listed
  const pick = pickHouseEnvPoint(series, { listed }, now) || series[0]
  return {
    temp: pick.temp,
    humidity: pick.humidity,
    nh3: pick.nh3,
    co2: pick.co2,
    series,
  }
}

/**
 * @param {object} [houseEnv]
 * @param {Date} [now]
 * @returns {{ key: string, label: string, unit: string, value: unknown, chip: string, ok: boolean }[]}
 */
export function envMetrics(houseEnv, now = new Date(), opts = {}) {
  const live = resolveHouseEnv(houseEnv, now, opts)
  return ['temp', 'humidity', 'nh3', 'co2'].map((key) => {
    const lim = HOUSE_ENV_LIMITS[key]
    const band = houseEnvBand(key, live[key])
    return {
      key,
      label: lim.label,
      unit: lim.unit,
      value: live[key],
      chip: band.chip,
      ok: band.ok,
    }
  })
}
