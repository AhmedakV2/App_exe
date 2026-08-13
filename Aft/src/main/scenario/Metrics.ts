import { flatten } from './FlowController'
import type { RunMetrics, StepResult } from './types'

export function emptyMetrics(): RunMetrics {
  return {
    steps: 0,
    executed: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    errored: 0,
    assertions: 0,
    assertionsFailed: 0,
    resolutions: 0,
    resolvedExact: 0,
    resolvedLow: 0,
    resolvedMissing: 0,
    meanConfidence: 0,
    scans: 0,
    retries: 0,
    totalMs: 0
  }
}

export function aggregate(
  steps: readonly StepResult[],
  counters: { scans: number; retries: number },
  totalMs: number
): RunMetrics {
  const metrics = emptyMetrics()
  const confidences: number[] = []

  for (const step of flatten(steps)) {
    if (step.kind === 'group') continue

    metrics.steps++
    if (step.status === 'passed') metrics.passed++
    if (step.status === 'failed') metrics.failed++
    if (step.status === 'errored') metrics.errored++
    if (step.status === 'skipped') metrics.skipped++
    else metrics.executed++

    for (const assertion of step.assertions) {
      metrics.assertions++
      if (!assertion.passed) metrics.assertionsFailed++
    }

    const resolution = step.resolution
    if (!resolution) continue

    metrics.resolutions++
    confidences.push(resolution.confidence)
    if (resolution.state === 'exact') metrics.resolvedExact++
    else if (resolution.state === 'low-confidence') metrics.resolvedLow++
    else metrics.resolvedMissing++
  }

  metrics.meanConfidence = mean(confidences)
  metrics.scans = counters.scans
  metrics.retries = counters.retries
  metrics.totalMs = round(totalMs)
  return metrics
}

export function collectFailures(steps: readonly StepResult[]): string[] {
  return flatten(steps)
    .filter((step) => step.status === 'failed' || step.status === 'errored')
    .filter((step) => step.kind !== 'group')
    .map((step) => step.title + ': ' + step.message)
}

export function mean(values: readonly number[]): number {
  if (!values.length) return 0
  return round(values.reduce((total, value) => total + value, 0) / values.length, 3)
}

export function round(value: number, digits = 0): number {
  const factor = Math.pow(10, digits)
  return Math.round(value * factor) / factor
}
