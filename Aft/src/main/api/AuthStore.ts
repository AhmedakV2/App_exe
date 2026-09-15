import { safeStorage } from 'electron'
import { readFile, writeFile, rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { SessionState } from './types'

export type { SessionState }

export interface Session {
  accessToken: string
  refreshToken: string
  expiresAt: number
  userId: string
  email: string
  displayName: string
}

const FILE_NAME = 'agent-session.bin'
const RENEW_MARGIN_MS = 60_000

export class AuthStore {
  private session: Session | null = null
  constructor(private readonly directory: string) {}

  state(): SessionState {
    return {
      signedIn: this.session !== null,
      email: this.session?.email ?? '',
      displayName: this.session?.displayName ?? '',
      expiresAt: this.session?.expiresAt ?? 0
    }
  }

  current(): Session | null {
    return this.session
  }
  accessToken(): string {
    return this.session?.accessToken ?? ''
  }
  refreshToken(): string {
    return this.session?.refreshToken ?? ''
  }
  needsRenewal(): boolean {
    if (!this.session) return false
    return this.session.expiresAt - RENEW_MARGIN_MS <= Date.now()
  }
  async load(): Promise<SessionState> {
    try {
      const raw = await readFile(join(this.directory, FILE_NAME))
      const json = safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(raw)
        : raw.toString('utf-8')
      this.session = JSON.parse(json) as Session
    } catch {
      this.session = null
    }
    return this.state()
  }
  async save(session: Session): Promise<SessionState> {
    this.session = session
    const json = JSON.stringify(session)
    const payload = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(json)
      : Buffer.from(json, 'utf8')
    await mkdir(this.directory, { recursive: true })
    await writeFile(join(this.directory, FILE_NAME), payload)
    return this.state()
  }
  async clear(): Promise<SessionState> {
    this.session = null
    await rm(join(this.directory, FILE_NAME), { force: true })
    return this.state()
  }
}
