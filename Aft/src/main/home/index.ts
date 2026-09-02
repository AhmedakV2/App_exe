import { protocol, session } from 'electron'
import { homePage } from './page'
import { HOME_HOST, HOME_SCHEME } from './search'

let theme = 'grafit'
let mounted = false

export function registerHomeScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: HOME_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true }
    }
  ])
}

export function mountHome(partition: string): void {
  if (mounted) return
  const store = session.fromPartition(partition)
  if (store.protocol.isProtocolHandled(HOME_SCHEME)) return

  store.protocol.handle(HOME_SCHEME, (request) => {
    let host = ''
    try {
      host = new URL(request.url).hostname
    } catch {
      host = ''
    }

    if (host !== HOME_HOST) return new Response('', { status: 404 })

    return new Response(homePage(theme), {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
    })
  })

  mounted = true
}

export function setHomeTheme(next: string): boolean {
  if (!next || next === theme) return false
  theme = next
  return true
}

export { HOME_SCHEME, HOME_URL, isHomeUrl, resolveInput, searchUrl } from './search'
