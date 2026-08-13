import { flatten } from './FlowController'
import { mean, round } from './Metrics'
import type { RunResult, StepResult, StepStatus } from './types'

export interface StepConsistency {
  stepId: string
  title: string
  stable: boolean
  statuses: StepStatus[]
  confidences: number[]
  meanConfidence: number
  confidenceSpread: number
  meanMs: number
  reason: string
}

export interface ConsistencyReport {
  runs: number
  stable: boolean
  statuses: string[]
  sameStatus: boolean
  sameStepCount: boolean
  meanConfidence: number
  worstSpread: number
  steps: StepConsistency[]
  reasons: string[]
}

export const CONFIDENCE_SPREAD_LIMIT = 0.1

export function compareRuns(runs: readonly RunResult[]): ConsistencyReport {
  const reasons: string[] = []

  if (runs.length < 2) {
    return {
      runs: runs.length,
      stable: false,
      statuses: runs.map((run) => run.status),
      sameStatus: true,
      sameStepCount: true,
      meanConfidence: runs[0]?.metrics.meanConfidence ?? 0,
      worstSpread: 0,
      steps: [],
      reasons: ['tutarlilik icin en az iki kosum gerekir']
    }
  }

  const sequences = runs.map((run) => flatten(run.steps).filter((step) => step.kind !== 'group'))
  const statuses = runs.map((run) => run.status)
  const sameStatus = statuses.every((status) => status === statuses[0])
  const sameStepCount = sequences.every((steps) => steps.length === sequences[0]!.length)

  if (!sameStatus) reasons.push('kosum sonuclari farkli: ' + statuses.join(', '))
  if (!sameStepCount) {
    reasons.push('adim sayilari farkli: ' + sequences.map((steps) => steps.length).join(', '))
  }

  const steps = sameStepCount
    ? sequences[0]!.map((_, position) => compare(sequences, position))
    : []
  for (const step of steps) {
    if (!step.stable) reasons.push(step.title + ': ' + step.reason)
  }

  const worstSpread = steps.reduce((worst, step) => Math.max(worst, step.confidenceSpread), 0)

  return {
    runs: runs.length,
    stable: sameStatus && sameStepCount && steps.every((step) => step.stable),
    statuses,
    sameStatus,
    sameStepCount,
    meanConfidence: mean(runs.map((run) => run.metrics.meanConfidence)),
    worstSpread: round(worstSpread, 3),
    steps,
    reasons
  }
}

export function renderConsistency(report: ConsistencyReport): string {
  const lines: string[] = []

  lines.push('Tutarlilik: ' + (report.stable ? 'KARARLI' : 'KARARSIZ'))
  lines.push('Kosum ' + report.runs + ' | sonuclar ' + report.statuses.join(', '))
  lines.push(
    'Ortalama guven ' +
      percent(report.meanConfidence) +
      ' | en genis guven sapmasi ' +
      percent(report.worstSpread)
  )
  lines.push('')

  for (const step of report.steps) {
    lines.push(
      (step.stable ? '  KARARLI  ' : '  KARARSIZ ') +
        pad(step.title, 38) +
        pad(step.statuses.join('/'), 26) +
        pad('guven ' + percent(step.meanConfidence), 16) +
        pad('sapma ' + percent(step.confidenceSpread), 16) +
        pad(step.meanMs + ' ms', 10) +
        step.reason
    )
  }

  if (report.reasons.length) {
    lines.push('')
    lines.push('Kararsizlik nedenleri')
    for (const reason of report.reasons) lines.push('  ' + reason)
  }

  return lines.join('\n')
}

function compare(sequences: readonly StepResult[][], position: number): StepConsistency {
  const samples = sequences.map((steps) => steps[position]!)
  const first = samples[0]!
  const statuses = samples.map((step) => step.status)
  const confidences = samples.map((step) => step.resolution?.confidence ?? 0)
  const spread = Math.max(...confidences) - Math.min(...confidences)
  const identity = samples.map((step) => step.stepId)
  const targets = samples.map((step) => String(step.resolution?.ordinal ?? -1))
  const assertions = samples.map((step) =>
    step.assertions.map((entry) => entry.kind + ':' + String(entry.passed)).join('|')
  )

  const reasons: string[] = []
  if (!same(identity)) reasons.push('adim sirasi kaydi')
  if (!same(statuses)) reasons.push('sonuc degisti: ' + statuses.join(', '))
  if (!same(assertions)) reasons.push('dogrulama sonuclari degisti')
  if (!same(targets)) reasons.push('cozumlenen eleman degisti: sira ' + targets.join(', '))
  if (spread > CONFIDENCE_SPREAD_LIMIT) reasons.push('guven sapmasi yuksek')

  return {
    stepId: first.stepId,
    title: first.title,
    stable: reasons.length === 0,
    statuses,
    confidences: confidences.map((value) => round(value, 3)),
    meanConfidence: mean(confidences),
    confidenceSpread: round(spread, 3),
    meanMs: mean(samples.map((step) => step.durationMs)),
    reason: reasons.join('; ')
  }
}

function same(values: readonly string[]): boolean {
  return values.every((value) => value === values[0])
}

function percent(value: number): string {
  return (value * 100).toFixed(1) + '%'
}

function pad(value: string, width: number): string {
  const cut = value.length <= width - 1 ? value : value.slice(0, width - 2) + '.'
  return cut + ' '.repeat(Math.max(1, width - cut.length))
}
