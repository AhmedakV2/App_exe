import type { IdentityService } from '../identity'
import { digest } from '../model'
import { BaselineStore } from './BaselineStore'
import { CaseRunner } from './CaseRunner'
import { aggregate } from './Metrics'
import { POOL } from './pool'
import {
  DEFAULT_RUN,
  POOL_VERSION,
  type CaseResult,
  type Harness,
  type PoolCase,
  type PoolRun,
  type RunOptions
} from './types'

export type ProgressHandler = (done: number, total: number, result: CaseResult) => void

export class PoolRunner {
  private readonly runner: CaseRunner
  private readonly baselines: BaselineStore

  constructor(harness: Harness, identity: IdentityService, baselinePath: string) {
    this.runner = new CaseRunner(harness, identity)
    this.baselines = new BaselineStore(baselinePath)
  }

  async run(overrides: Partial<RunOptions> = {}, onProgress?: ProgressHandler): Promise<PoolRun> {
    const options = { ...DEFAULT_RUN, ...overrides }
    const selected = select(options)
    const startedAt = Date.now()
    const results: CaseResult[] = []

    await this.baselines.load()

    for (const entry of selected) {
      const result = await this.runner.run(entry)
      results.push(result)
      onProgress?.(results.length, selected.length, result)
      if (options.stopOnFailure && result.status !== 'passed') break
    }

    const finishedAt = Date.now()
    const metrics = aggregate(results, finishedAt - startedAt)
    const comparison = this.baselines.compare(results, options.thresholds.maxRegressionDelta)
    const failures = collectFailures(results, metrics, options, comparison?.regressions ?? 0)

    if (options.updateBaseline && !failures.length) {
      await this.baselines.write(results, options.thresholds)
    }

    return {
      id: String(startedAt) + '-' + digest([selected.length, POOL_VERSION]),
      version: POOL_VERSION,
      startedAt,
      finishedAt,
      ok: failures.length === 0,
      cases: results,
      metrics,
      comparison,
      failures
    }
  }
}

function select(options: RunOptions): PoolCase[] {
  let selected = POOL.slice()
  if (options.only.length) selected = selected.filter((entry) => options.only.includes(entry.id))
  if (options.kinds.length)
    selected = selected.filter((entry) => options.kinds.includes(entry.kind))
  return selected
}

function collectFailures(
  results: readonly CaseResult[],
  metrics: ReturnType<typeof aggregate>,
  options: RunOptions,
  regressions: number
): string[] {
  const failures: string[] = []
  const thresholds = options.thresholds

  for (const result of results) {
    if (result.status === 'passed') continue
    failures.push(result.caseId + ': ' + result.failures.join(', '))
  }

  if (metrics.resolutionRate < thresholds.minResolutionRate) {
    failures.push('cozumleme basari orani esigin altinda: ' + metrics.resolutionRate)
  }
  if (metrics.falsePositiveRate > thresholds.maxFalsePositiveRate) {
    failures.push('yanlis pozitif orani esigin ustunde: ' + metrics.falsePositiveRate)
  }
  if (metrics.ambiguityRate > thresholds.maxAmbiguityRate) {
    failures.push('belirsizlik orani esigin ustunde: ' + metrics.ambiguityRate)
  }
  if (metrics.discoveryMsP95 > thresholds.maxDiscoveryMsP95) {
    failures.push('kesif suresi esigin ustunde: ' + metrics.discoveryMsP95)
  }
  if (regressions > 0) {
    failures.push('referans olcume gore gerileme: ' + regressions)
  }
  return failures
}
