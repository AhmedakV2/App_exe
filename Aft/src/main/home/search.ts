export const HOME_SCHEME = 'aft'
export const HOME_HOST = 'home'
export const HOME_URL = 'aft://home/'
export const SEARCH_ENDPOINT = 'https://www.google.com/search?q='
export const FAVICON_ENDPOINT = 'https://www.google.com/s2/favicons?sz=64&domain='

export function searchUrl(query: string): string {
  const text = query.trim()
  if (!text) return HOME_URL
  return SEARCH_ENDPOINT + encodeURIComponent(text)
}

export function isHomeUrl(raw: string): boolean {
  if (!raw) return false
  try {
    const parsed = new URL(raw)
    return parsed.protocol === HOME_SCHEME + ':' && parsed.hostname === HOME_HOST
  } catch {
    return false
  }
}

export function resolveInput(input: string): string {
  const text = input.trim()
  if (!text) return ''
  if (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/|$)/i.test(text)) return 'http://' + text
  if (/^(?!javascript:|data:)[a-z][a-z0-9+.-]*:(\/\/|[^0-9])/i.test(text)) return text
  if (/^[^\s/?#]+\.[^\s/?#]{2,}/.test(text)) return 'https://' + text
  return searchUrl(text)
}
