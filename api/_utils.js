export function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export function normalizePhone(value = '') {
  const digits = String(value).replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('55')) return `+${digits}`
  return `+55${digits}`
}

export function siteBase(req) {
  const configured = process.env.SITE_URL?.replace(/\/$/, '')
  if (configured) return configured
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const host = req.headers['x-forwarded-host'] || req.headers.host
  return `${proto}://${host}`
}

export function randomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}
