import type { ChannelResult } from './types'

interface ErrorDetail {
  status?: unknown
  code?: unknown
  retryAfterMs?: unknown
}

export async function guard<T>(
  message: string,
  handler: () => T | Promise<T>
): Promise<ChannelResult<T>> {
  try {
    return { ok: true, data: await handler(), message }
  } catch (error) {
    const detail = (error ?? {}) as ErrorDetail
    const result: ChannelResult<T> = {
      ok: false,
      data: null,
      message: error instanceof Error ? error.message : String(error)
    }
    if (typeof detail.status === 'number') result.status = detail.status
    if (typeof detail.code === 'string') result.code = detail.code
    if (typeof detail.retryAfterMs === 'number' && detail.retryAfterMs > 0) {
      result.retryAfterMs = detail.retryAfterMs
    }
    return result
  }
}
