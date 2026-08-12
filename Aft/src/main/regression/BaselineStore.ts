import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { round } from './Metrics'
import {
  DEFAULT_THRESHOLDS,
  POOL_VERSION,
  type Baseline,
  type BaselineComparison,
  type BaselineDelta,
  type CaseMetrics,
  type CaseResult,
  type Thresholds
} from './types'
type Direction = 'higher-better' | 'lower-better'
const TRACKED: [keyof CaseMetrics, Direction][] = [
  ['interactive', 'higher-better'],
  ['resolutionRate', 'higher-better'],
  ['meanConfidence', 'higher-better'],
  ['meanQuality', 'higher-better'],
  ['falsePositiveRate', 'lower-better'],
  ['ambiguityRate', 'lower-better'],
  ['validationErrors', 'lower-better'],
  ['discoveryMs', 'lower-better']
]
const RATE_FIELDS: ReadonlySet<keyof CaseMetrics> = new Set([
  'resolutionRate',
  'meanConfidence',
  'meanQuality',
  'falsePositiveRate',
  'ambiguityRate'
])
const COUNT_TOLERANCE = 0.05
const DURATION_TOLERANCE = 0.35

export class BaselineStore {
  private current: Baseline | null = null
  constructor(private readonly filePath: string) {}

  async load(): Promise<Baseline | null> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf-8')) as Baseline
      this.current = parsed.version === POOL_VERSION ? parsed : null
    } catch {
      this.current = null
    }
    return this.current
  }
  get(): Baseline | null {
    return this.current
  }
  async write(results: readonly CaseResult[], thresholds: Thresholds): Promise<Baseline> {
    const cases: Record<string, CaseMetrics> = {}
    for (const result of results) {
      if (result.status === 'errored') continue
      cases[result.caseId] = result.metrics
    }
    const baseline: Baseline = {
      version: POOL_VERSION,
      createdAt: Date.now(),
      thresholds: thresholds ?? DEFAULT_THRESHOLDS,
      cases
    }
    await mkdir(dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, JSON.stringify(baseline, null, 2), 'utf8')
    this.current = baseline
    return baseline
  }
  compare(results: readonly CaseResult[], maxDelta: number): BaselineComparison | null {
    const baseline = this.current
    if (!baseline) return null
    const deltas: BaselineDelta[] = []
    for (const result of results) {
      const before = baseline.cases[result.caseId]
      if (!before) continue
      for (const [field, direction] of TRACKED) {
        const previous = before[field]
        const next = result.metrics[field]
        const delta = round(next - previous)
        if (delta === 0) continue
        deltas.push({
          caseId: result.caseId,
          field,
          before: previous,
          after: next,
          delta,
          regressed: regressed(field, direction, previous, next, maxDelta)
        })
      }
    }
    return {
      baselineAt: baseline.createdAt,
      deltas,
      regressions: deltas.filter((entry) => entry.regressed).length
    }
  }
}
function regressed(
  field: keyof CaseMetrics,
  direction: Direction,
  before: number,
  after: number,
  maxDelta: number
): boolean {
  const worse = direction === 'higher-better' ? before - after : after - before
  if (worse <= 0) return false
  if (RATE_FIELDS.has(field)) return worse > maxDelta
  if (field === 'discoveryMs') return worse > Math.max(250, before * DURATION_TOLERANCE)
  if (field === 'validationErrors') return true
  return worse > Math.max(1, before * COUNT_TOLERANCE)
}
