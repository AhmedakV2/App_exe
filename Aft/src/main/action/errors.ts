import { ProtocolError } from '../discovery'
import type { ActionErrorCode } from './types'

const MESSAGES: Record<ActionErrorCode, string> = {
  'element-not-found': 'Eleman bulunamadi',
  'element-ambiguous': 'Birden fazla aday eslesti',
  'element-not-ready': 'Eleman etkilesime hazir degil',
  'page-not-loaded': 'Sayfa yuklenmedi',
  'navigation-failed': 'Navigasyon tamamlanmadi',
  'dialog-blocked': 'Diyalog akisi engelledi',
  timeout: 'Zaman asimi',
  'protocol-error': 'Protokol hatasi',
  'not-supported': 'Desteklenmeyen eylem',
  'invalid-request': 'Gecersiz istek'
}

export class ActionError extends Error {
  constructor(
    readonly code: ActionErrorCode,
    readonly detail: string
  ) {
    super(MESSAGES[code] + (detail ? ': ' + detail : ''))
    this.name = 'ActionError'
  }
}

export function classify(error: unknown): ActionError {
  if (error instanceof ActionError) return error
  if (error instanceof ProtocolError) return new ActionError('protocol-error', error.message)

  const detail = error instanceof Error ? error.message : String(error)
  if (/timeout|zaman asimi/i.test(detail)) return new ActionError('timeout', detail)
  if (/navigat/i.test(detail)) return new ActionError('navigation-failed', detail)
  return new ActionError('protocol-error', detail)
}

export function describeCode(code: ActionErrorCode): string {
  return MESSAGES[code]
}
