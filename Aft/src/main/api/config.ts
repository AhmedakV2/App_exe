import { app } from 'electron'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { AgentConfig } from './types'

export type { AgentConfig }

export const DEFAULT_CONFIG: AgentConfig = {
  baseUrl: 'http://10.6.100.134:8092',
  orgId: '',
  deviceKey: '',
  autoConnect: false
}

const FILE_NAME = 'agent-config.json'

function text(source: Record<string, unknown>, key: string, fallback: string): string {
  const value = source[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

function normalize(raw: unknown): AgentConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_CONFIG }
  const source = raw as Record<string, unknown>
  return {
    baseUrl: text(source, 'baseUrl', DEFAULT_CONFIG.baseUrl).replace(/\/+$/, '') || DEFAULT_CONFIG.baseUrl,
    orgId: text(source, 'orgId', DEFAULT_CONFIG.orgId),
    deviceKey: text(source, 'deviceKey', DEFAULT_CONFIG.deviceKey),
    autoConnect: source.autoConnect === true
  }
}

function fromEnvironment(base: AgentConfig): AgentConfig {
  return {
    baseUrl: (process.env.AFT_API_URL || base.baseUrl || DEFAULT_CONFIG.baseUrl).replace(
      /\/+$/,
      ''
    ),
    orgId: process.env.AFT_ORG_ID ?? base.orgId,
    deviceKey: process.env.AFT_DEVICE_KEY ?? base.deviceKey,
    autoConnect: process.env.AFT_AUTO_CONNECT === 'true' ? true : base.autoConnect
  }
}

export class ConfigStore {
  private cached: AgentConfig | null = null

  constructor(private readonly directory: string = app.getPath('userData')) {}

  async read(): Promise<AgentConfig> {
    if (this.cached) return this.cached
    try {
      const raw = await readFile(join(this.directory, FILE_NAME), 'utf8')
      this.cached = fromEnvironment(normalize(JSON.parse(raw)))
    } catch {
      this.cached = fromEnvironment({ ...DEFAULT_CONFIG })
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

  async clear(): Promise<void> {
    this.cached = null
    await this.write({ ...DEFAULT_CONFIG })
  }
}
