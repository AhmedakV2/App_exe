import type { ChannelResult } from './types'

export async function guard<T>(
  message: string,
  handler: () => T | Promise<T>
): Promise<ChannelResult<T>> {
  try {
    return { ok: true, data: await handler(), message }
  } catch (error) {
    return {
      ok: false,
      data: null,
      message: error instanceof Error ? error.message : String(error)
    }
  }
}
