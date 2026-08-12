import type { ElementModel } from '../model'
import type { CaseMetrics, CaseResult, PoolMetrics } from './types'

const MIN_AREA = 4

export function emptyMetrics(): CaseMetrics {
  return {
    nodes: 0,
    elements: 0,
    interactive: 0,
    inViewport: 0,
    shadowRoots: 0,
    frames: 0,
    framesFailed: 0,
    blindSpots: 0,
    falsePositives: 0,
    falsePositiveRate: 0,
    descriptorsCaptured: 0,
    resolvedExact: 0,
    resolvedLow: 0,
    resolvedMissing: 0,
    resolutionRate: 0,
    ambiguityRate: 0,
    meanConfidence: 0,
    meanQuality: 0,
    discoveryMs: 0,
    resolveMs: 0,
    totalMs: 0,
    validationErrors: 0,
    validationWarnings: 0
  }
}

export function isFalsePositive(element: ElementModel): boolean {
  if (!element.interactivity.interactive) return false
  if (element.visibility.state === 'hidden') return true
  if (element.visibility.pointerEvents === 'none') return true

  const rect = element.geometry.viewport
  if (!rect || rect.w * rect.h < MIN_AREA) return true

  const weak = element.interactivity.reasons.every((reason) => reason === 'listener')
  const anonymous = !element.accessibility?.role && !element.attrs['role']
  return weak && anonymous && !element.interactivity.formControl
}

export function countFalsePositives(elements: readonly ElementModel[]): number {
  let total = 0
  for (const element of elements) if (isFalsePositive(element)) total++
  return total
}

export function ratio(part: number, whole: number): number {
  return whole > 0 ? round(part / whole) : 0
}

export function mean(values: readonly number[]): number {
  if (!values.length) return 0
  return round(values.reduce((total, value) => total + value, 0) / values.length)
}

export function percentile(values: readonly number[], fraction: number): number {
  if (!values.length) return 0
  const sorted = values.slice().sort((a, b) => a - b)
  const position = Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))
  return round(sorted[position])
}

export function aggregate(results: readonly CaseResult[], totalMs: number): PoolMetrics {
  const durations = results.map((result) => result.metrics.discoveryMs)
  const weightedResolution = results.filter((result) => result.metrics.descriptorsCaptured > 0)

  return {
    cases: results.length,
    passed: results.filter((result) => result.status === 'passed').length,
    failed: results.filter((result) => result.status === 'failed').length,
    errored: results.filter((result) => result.status === 'errored').length,
    interactive: results.reduce((total, result) => total + result.metrics.interactive, 0),
    falsePositiveRate: mean(results.map((result) => result.metrics.falsePositiveRate)),
    resolutionRate: mean(weightedResolution.map((result) => result.metrics.resolutionRate)),
    ambiguityRate: mean(weightedResolution.map((result) => result.metrics.ambiguityRate)),
    meanConfidence: mean(weightedResolution.map((result) => result.metrics.meanConfidence)),
    meanQuality: mean(weightedResolution.map((result) => result.metrics.meanQuality)),
    discoveryMsMean: mean(durations),
    discoveryMsP95: percentile(durations, 0.95),
    totalMs
  }
}

export function round(value: number): number {
  return Math.round(value * 10000) / 10000
}
