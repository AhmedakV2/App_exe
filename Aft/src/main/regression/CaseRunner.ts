import type { ElementGraph } from '../discovery'
import type { IdentityService } from '../identity'
import type { Descriptor } from '../identity'
import { ModelIndex } from '../model'
import { toSnapshot } from '../model'
import { validateSnapshot } from '../model'
import type { ElementModel } from '../model'
import { countFalsePositives, emptyMetrics, mean, ratio, round } from './Metrics'
import type { CaseMetrics, CaseResult, CaseStatus, Harness, PoolCase } from './types'

export class CaseRunner {
  constructor(
    private readonly harness: Harness,
    private readonly identity: IdentityService
  ) {}

  async run(entry: PoolCase): Promise<CaseResult> {
    const startedAt = Date.now()

    try {
      const metrics = await this.measure(entry)
      const failures = this.check(entry, metrics)
      return this.result(entry, failures.length ? 'failed' : 'passed', failures, metrics, startedAt)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      return this.result(entry, 'errored', [detail], emptyMetrics(), startedAt)
    }
  }

  private async measure(entry: PoolCase): Promise<CaseMetrics> {
    const metrics = emptyMetrics()
    const url = entry.source === 'frozen' ? this.harness.urlOf(entry.location) : entry.location

    await this.harness.goto(url, entry.timeoutMs)

    const discoveryStart = Date.now()
    const first = await this.harness.scan(entry.scanLevel)
    metrics.discoveryMs = Date.now() - discoveryStart

    const snapshot = toSnapshot(first)
    const report = validateSnapshot(snapshot)
    const index = new ModelIndex(snapshot)

    this.applyCoverage(metrics, first, index)
    metrics.validationErrors = report.errors.length
    metrics.validationWarnings = report.warnings.length

    const descriptors = this.capture(index, entry.sampleSize)
    metrics.descriptorsCaptured = descriptors.length
    metrics.meanQuality = mean(descriptors.map((descriptor) => descriptor.quality.score))

    await this.harness.reset()
    const second = await this.harness.scan(entry.scanLevel)
    const target = new ModelIndex(toSnapshot(second))

    const resolveStart = Date.now()
    this.resolveAll(metrics, descriptors, target)
    metrics.resolveMs = Date.now() - resolveStart
    metrics.totalMs = metrics.discoveryMs + metrics.resolveMs

    return metrics
  }

  private applyCoverage(metrics: CaseMetrics, graph: ElementGraph, index: ModelIndex): void {
    const coverage = graph.coverage
    const elements = index.elements()

    metrics.nodes = coverage.nodes
    metrics.elements = coverage.elements
    metrics.interactive = coverage.interactive
    metrics.inViewport = coverage.inViewport
    metrics.shadowRoots = coverage.shadowRoots
    metrics.frames = coverage.frames
    metrics.framesFailed = coverage.framesFailed
    metrics.blindSpots = coverage.blindSpots
    metrics.falsePositives = countFalsePositives(elements)
    metrics.falsePositiveRate = ratio(metrics.falsePositives, Math.max(1, coverage.interactive))
  }

  private capture(index: ModelIndex, sampleSize: number): Descriptor[] {
    const pool = index
      .addressable()
      .filter((element: ElementModel) => element.interactivity.interactive)

    if (!pool.length) return []

    const stride = Math.max(1, Math.floor(pool.length / sampleSize))
    const out: Descriptor[] = []

    for (let position = 0; position < pool.length && out.length < sampleSize; position += stride) {
      const element = pool[position]
      try {
        out.push(this.identity.captureFromIndex(index, element.identity.ordinal))
      } catch {
        continue
      }
    }
    return out
  }

  private resolveAll(metrics: CaseMetrics, descriptors: Descriptor[], target: ModelIndex): void {
    if (!descriptors.length) return

    const confidences: number[] = []
    let ambiguous = 0

    for (const descriptor of descriptors) {
      const outcome = this.identity.resolve(descriptor, target)
      const resolution = outcome.resolution

      confidences.push(resolution.confidence)
      if (resolution.ambiguous) ambiguous++

      if (resolution.state === 'exact') metrics.resolvedExact++
      else if (resolution.state === 'low-confidence') metrics.resolvedLow++
      else metrics.resolvedMissing++
    }

    metrics.resolutionRate = ratio(metrics.resolvedExact, descriptors.length)
    metrics.ambiguityRate = ratio(ambiguous, descriptors.length)
    metrics.meanConfidence = mean(confidences)
  }

  private check(entry: PoolCase, metrics: CaseMetrics): string[] {
    const expected = entry.expected
    const failures: string[] = []

    if (metrics.interactive < expected.minInteractive) {
      failures.push('etkilesilebilir eleman az: ' + metrics.interactive)
    }
    if (metrics.interactive > expected.maxInteractive) {
      failures.push('etkilesilebilir eleman fazla: ' + metrics.interactive)
    }
    if (metrics.frames < expected.minFrames) {
      failures.push('cerceve sayisi az: ' + metrics.frames)
    }
    if (metrics.shadowRoots < expected.minShadowRoots) {
      failures.push('shadow kok sayisi az: ' + metrics.shadowRoots)
    }
    if (metrics.blindSpots > expected.maxBlindSpots) {
      failures.push('kor nokta fazla: ' + metrics.blindSpots)
    }
    if (metrics.framesFailed > expected.maxFramesFailed) {
      failures.push('erisilemeyen cerceve: ' + metrics.framesFailed)
    }
    if (metrics.validationErrors > 0) {
      failures.push('model dogrulama hatasi: ' + metrics.validationErrors)
    }
    if (metrics.descriptorsCaptured === 0) {
      failures.push('descriptor uretilemedi')
    }
    return failures
  }

  private result(
    entry: PoolCase,
    status: CaseStatus,
    failures: string[],
    metrics: CaseMetrics,
    startedAt: number
  ): CaseResult {
    return {
      caseId: entry.id,
      kind: entry.kind,
      status,
      failures,
      metrics: { ...metrics, totalMs: round(Date.now() - startedAt) },
      startedAt,
      finishedAt: Date.now()
    }
  }
}
