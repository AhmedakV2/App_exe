export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfterMs = 0
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function retryAfterMillis(response: Response, maxMs: number): number {
  const header = response.headers.get('Retry-After')
  if (!header) return 0
  const seconds = Number(header)
  if (!Number.isFinite(seconds) || seconds <= 0) return 0
  return Math.min(seconds * 1000, maxMs)
}
