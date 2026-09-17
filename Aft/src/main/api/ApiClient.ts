import type { AuthStore, Session } from './AuthStore'
import type { ConfigStore } from './config'
import type { DeviceInfo, Profile } from './types'
import { ApiError, retryAfterMillis } from './ApiError'

export type { DeviceInfo, Profile }
export { ApiError }

export interface LoginInput {
  email: string
  password: string
}

export interface RegisterInput {
  email: string
  password: string
  displayName: string
}

export interface TokenResponse {
  accessToken: string
  refreshToken: string
  tokenType: string
  expiresIn: number
}

const MAX_RETRY_AFTER_MS = 60_000

interface ProblemDetail {
  title?: string
  detail?: string
  code?: string
}

export class ApiClient {
  constructor(
    private readonly config: ConfigStore,
    private readonly auth: AuthStore
  ) {}

  async login(input: LoginInput): Promise<Profile> {
    const tokens = await this.call<TokenResponse>('POST', '/api/v1/auth/login', input, false)
    await this.persist(tokens, { id: '', email: input.email, displayName: '' })

    const profile = await this.me()
    await this.persist(tokens, profile)
    return profile
  }

  async register(input: RegisterInput): Promise<Profile> {
    const tokens = await this.call<TokenResponse>('POST', '/api/v1/auth/register', input, false)
    await this.persist(tokens, { id: '', email: input.email, displayName: input.displayName })

    const profile = await this.me()
    await this.persist(tokens, profile)
    return profile
  }

  async logout(): Promise<void> {
    const refreshToken = this.auth.refreshToken()
    if (refreshToken) {
      await this.call('POST', '/api/v1/auth/logout', { refreshToken }, true).catch(() => undefined)
    }
    await this.auth.clear()
  }

  async me(): Promise<Profile> {
    return this.call<Profile>('GET', '/api/v1/auth/me', null, true)
  }

  async registerDevice(hostname: string, os: string, appVersion: string): Promise<DeviceInfo> {
    const settings = await this.config.read()
    return this.call<DeviceInfo>(
      'POST',
      '/api/v1/devices/register',
      { hostname, os, appVersion },
      false,
      { 'X-Aft-Key': settings.deviceKey }
    )
  }

  async heartbeat(deviceId: string): Promise<void> {
    const settings = await this.config.read()
    await this.call('POST', '/api/v1/devices/' + deviceId + '/heartbeat', {}, false, {
      'X-Aft-Key': settings.deviceKey
    })
  }

  private async ensureToken(): Promise<void> {
    if (!this.auth.needsRenewal()) return
    const refreshToken = this.auth.refreshToken()
    if (!refreshToken) return

    const tokens = await this.call<TokenResponse>(
      'POST',
      '/api/v1/auth/refresh',
      { refreshToken },
      false
    )
    const current = this.auth.current()
    await this.persist(tokens, {
      id: current?.userId ?? '',
      email: current?.email ?? '',
      displayName: current?.displayName ?? ''
    })
  }

  private async persist(
    tokens: TokenResponse,
    who: { id: string; email: string; displayName: string }
  ): Promise<void> {
    const session: Session = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: Date.now() + tokens.expiresIn * 1000,
      userId: who.id,
      email: who.email,
      displayName: who.displayName
    }
    await this.auth.save(session)
  }

  private async call<T>(
    method: string,
    path: string,
    body: unknown,
    authorized: boolean,
    extraHeaders: Record<string, string> = {}
  ): Promise<T> {
    if (authorized) await this.ensureToken()

    const settings = await this.config.read()
    const headers: Record<string, string> = { ...extraHeaders }
    if (body !== null && body !== undefined) headers['Content-Type'] = 'application/json'
    if (authorized) headers.Authorization = 'Bearer ' + this.auth.accessToken()

    const response = await fetch(settings.baseUrl + path, {
      method,
      headers,
      body: body === null || body === undefined ? undefined : JSON.stringify(body)
    })

    if (!response.ok) throw await this.toError(response)
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  private async toError(response: Response): Promise<ApiError> {
    let problem: ProblemDetail = {}
    try {
      problem = (await response.json()) as ProblemDetail
    } catch {
      problem = {}
    }
    const message = problem.detail ?? problem.title ?? 'Istek basarisiz: ' + response.status
    return new ApiError(
      response.status,
      problem.code ?? 'UNKNOWN',
      message,
      retryAfterMillis(response, MAX_RETRY_AFTER_MS)
    )
  }
}
