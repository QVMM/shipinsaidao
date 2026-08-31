/**
 * 同源 API。cookie 随请求走，不在前端存 token。
 */
export async function api(path, opts = {}) {
  const { method = 'GET', body, silent } = opts
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body == null ? {} : { 'Content-Type': 'application/json' },
    body: body == null ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { message: text || res.statusText }
  }
  if (!res.ok) {
    const err = new Error(data?.message || '请求失败')
    err.status = res.status
    err.payload = data
    if (!silent) console.warn('api', method, path, res.status)
    throw err
  }
  return data
}

export const get = (path, opts) => api(path, { ...opts, method: 'GET' })
export const post = (path, body, opts) => api(path, { ...opts, method: 'POST', body })
export const patch = (path, body, opts) => api(path, { ...opts, method: 'PATCH', body })
