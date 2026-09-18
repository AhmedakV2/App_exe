import { app } from 'electron'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { AgentConfig } from './types'

export type { AgentConfig }

export const API_BASE_URL = 'http://10.6.100.134:8092'

export const DEFAULT_CONFIG: AgentConfig = {
  orgId: '',
  deviceKey: '',
  streamPreferred: false,
  requestTimeoutMs: 90_000
}

const FILE_NAME = 'agent-config.json'

function text(source: Record<string, unknown>, key: string): string {
  const value = source[key]
  return typeof value === 'string' ? value.trim() : ''
}

function numberValue(source: Record<string, unknown>, key: string, fallback: number): number {
  const value = source[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function normalize(raw: unknown): AgentConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_CONFIG }
  const source = raw as Record<string, unknown>
  const streamPreferred = source['streamPreferred']
  return {
    orgId: text(source, 'orgId'),
    deviceKey: text(source, 'deviceKey'),
    streamPreferred: typeof streamPreferred === 'boolean' ? streamPreferred : DEFAULT_CONFIG.streamPreferred,
    requestTimeoutMs: numberValue(source, 'requestTimeoutMs', DEFAULT_CONFIG.requestTimeoutMs)
  }
}

export class ConfigStore {
  private cached: AgentConfig | null = null

  constructor(private readonly directory: string = app.getPath('userData')) {}

  baseUrl(): string {
    return API_BASE_URL
  }

  async read(): Promise<AgentConfig> {
    if (this.cached) return this.cached
    try {
      const raw = await readFile(join(this.directory, FILE_NAME), 'utf8')
      this.cached = normalize(JSON.parse(raw))
    } catch {
      this.cached = { ...DEFAULT_CONFIG }
    }
    return this.cached
  }

  async write(patch: Partial<AgentConfig>): Promise<AgentConfig> {
    const current = await this.read()
    const next = normalize({ ...current, ...patch })
    await mkdir(this.directory, { recursive: true })
    await writeFile(join(this.directory, FILE_NAME), JSON.stringify(next, null, 2), 'utf8')
    this.cached = next
    return next
  }

  async clear(): Promise<AgentConfig> {
    this.cached = null
    return this.write({ ...DEFAULT_CONFIG })
  }
}
