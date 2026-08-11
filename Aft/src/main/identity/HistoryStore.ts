import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { StrategyKind, StrategyStat } from './types'

const DECAY = 0.94

const PRIOR_ATTEMPTS = 6

const PRIOR_HITS = 4

const MIN_MULTIPLIER = 0.55

const MAX_MULTIPLIER = 1.25

const FLUSH_DELAY = 1500

interface HistoryFile {
  version: number
  scopes: Record<string, Record<string, StrategyStat>>
}

export class HistoryStore {
  private scopes = new Map<string, Map<StrategyKind, StrategyStat>>()
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private dirty = false

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as HistoryFile
      this.scopes = new Map(
        Object.entries(parsed.scopes ?? {}).map(([scope, stats]) => [
          scope,
          new Map(Object.entries(stats) as [StrategyKind, StrategyStat][])
        ])
      )
    } catch {
      this.scopes = new Map()
    }
  }

  multiplier(scope: string, kind: StrategyKind): number {
    const stat = this.scopes.get(scope)?.get(kind)
    const attempts = (stat?.attempts ?? 0) + PRIOR_ATTEMPTS
    const hits = (stat?.weightedSuccess ?? 0) + PRIOR_HITS
    const ratio = hits / attempts
    return clamp(
      MIN_MULTIPLIER + ratio * (MAX_MULTIPLIER - MIN_MULTIPLIER),
      MIN_MULTIPLIER,
      MAX_MULTIPLIER
    )
  }

  record(scope: string, kind: StrategyKind, hit: boolean): void {
    const bucket = this.bucket(scope)
    const stat = bucket.get(kind) ?? {
      attempts: 0,
      hits: 0,
      weightedSuccess: 0,
      lastSeenAt: 0
    }

    stat.attempts = stat.attempts * DECAY + 1
    stat.weightedSuccess = stat.weightedSuccess * DECAY + (hit ? 1 : 0)
    stat.hits += hit ? 1 : 0
    stat.lastSeenAt = Date.now()

    bucket.set(kind, stat)
    this.dirty = true
    this.schedule()
  }

  stats(scope: string): Record<string, StrategyStat> {
    const bucket = this.scopes.get(scope)
    return bucket ? Object.fromEntries(bucket) : {}
  }

  reset(scope: string): void {
    this.scopes.delete(scope)
    this.dirty = true
    this.schedule()
  }

  async flush(): Promise<void> {
    if (!this.dirty) return
    this.dirty = false

    const payload: HistoryFile = {
      version: 1,
      scopes: Object.fromEntries(
        Array.from(this.scopes, ([scope, stats]) => [scope, Object.fromEntries(stats)])
      )
    }

    await mkdir(dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, JSON.stringify(payload), 'utf8')
  }

  dispose(): void {
    if (!this.flushTimer) return
    clearTimeout(this.flushTimer)
    this.flushTimer = null
  }

  private bucket(scope: string): Map<StrategyKind, StrategyStat> {
    const existing = this.scopes.get(scope)
    if (existing) return existing
    const created = new Map<StrategyKind, StrategyStat>()
    this.scopes.set(scope, created)
    return created
  }

  private schedule(): void {
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      void this.flush().catch(() => undefined)
    }, FLUSH_DELAY)
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
