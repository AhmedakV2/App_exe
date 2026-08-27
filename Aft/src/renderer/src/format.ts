export function formatMs(ms: number): string {
  if (!Number.isFinite(ms)) return '—'
  if (ms < 1000) return Math.round(ms) + ' ms'
  if (ms < 60000) return (ms / 1000).toFixed(1).replace('.', ',') + ' sn'
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.round((ms % 60000) / 1000)
  return minutes + ' dk ' + String(seconds).padStart(2, '0') + ' sn'
}

export function formatDate(at: number): string {
  if (!at) return '—'
  const value = new Date(at)
  const pad = (part: number): string => String(part).padStart(2, '0')
  return (
    pad(value.getDate()) +
    '.' +
    pad(value.getMonth() + 1) +
    '.' +
    value.getFullYear() +
    ' ' +
    pad(value.getHours()) +
    ':' +
    pad(value.getMinutes())
  )
}

export function formatShortDate(at: number): string {
  if (!at) return '—'
  const value = new Date(at)
  const pad = (part: number): string => String(part).padStart(2, '0')
  return (
    pad(value.getDate()) +
    '.' +
    pad(value.getMonth() + 1) +
    ' ' +
    pad(value.getHours()) +
    ':' +
    pad(value.getMinutes())
  )
}

export function formatClock(): string {
  const now = new Date()
  const pad = (part: number): string => String(part).padStart(2, '0')
  return pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds())
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1).replace('.', ',') + ' MB'
}

export function percent(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return '%' + Math.round(value * 100)
}

export function ratio(part: number, total: number): number {
  if (!total) return 0
  return part / total
}

export function shortUrl(raw: string): string {
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    const path = parsed.pathname === '/' ? '' : parsed.pathname
    return parsed.host + path + parsed.search
  } catch {
    return raw
  }
}

export function hostOf(raw: string): string {
  if (!raw) return '—'
  try {
    return new URL(raw).host
  } catch {
    return raw
  }
}

export function toUrl(input: string): string {
  const text = input.trim()
  if (!text) return ''
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return text
  if (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/|$)/i.test(text)) return 'http://' + text
  if (/^[^\s/?#]+\.[^\s/?#]{2,}/.test(text)) return 'https://' + text
  return 'https://www.google.com/search?q=' + encodeURIComponent(text)
}

export function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high))
}
