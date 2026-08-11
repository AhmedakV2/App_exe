import type { ModelIndex } from '../model'
import type { ElementModel } from '../model'
import { scopeOf } from './DescriptorBuilder'
import type { HistoryStore } from './HistoryStore'
import { combine, contextScore, describeState, geometryScore, resolveState } from './Scoring'
import { strategyByKind } from './strategies'
import {
  DEFAULT_RESOLVE,
  SUPPORTED_DESCRIPTOR_VERSIONS,
  type Descriptor,
  type ResolveOptions,
  type ResolvedCandidate,
  type Resolution,
  type StrategyKind,
  type StrategyTrace
} from './types'

interface Bucket {
  element: ElementModel
  weight: number
  votes: StrategyKind[]
}

export class DescriptorVersionError extends Error {
  constructor(readonly version: string) {
    super('Desteklenmeyen descriptor surumu: ' + version)
    this.name = 'DescriptorVersionError'
  }
}

export class Resolver {
  constructor(private readonly history: HistoryStore | null = null) {}

  resolve(
    descriptor: Descriptor,
    index: ModelIndex,
    overrides: Partial<ResolveOptions> = {}
  ): Resolution {
    if (!SUPPORTED_DESCRIPTOR_VERSIONS.includes(descriptor.version)) {
      throw new DescriptorVersionError(descriptor.version)
    }

    const started = Date.now()
    const options = { ...DEFAULT_RESOLVE, ...overrides }
    const scope = scopeOf(descriptor)
    const trace: StrategyTrace[] = []
    const buckets = new Map<string, Bucket>()
    let attempted = 0

    for (const payload of descriptor.strategies) {
      const strategy = strategyByKind(payload.kind)
      if (!strategy) {
        trace.push(skipped(payload.kind, payload.weight, 'strateji kayitli degil'))
        continue
      }

      const weight =
        payload.weight *
        (options.useHistory && this.history ? this.history.multiplier(scope, payload.kind) : 1)

      const at = Date.now()
      const matches = strategy.match(payload, index)
      attempted += weight

      trace.push({
        kind: payload.kind,
        weight: round(weight),
        matched: matches.length,
        skipped: false,
        reason: matches.length ? 'eslesme bulundu' : 'aday uretmedi',
        durationMs: Date.now() - at
      })

      for (const element of matches) this.vote(buckets, element, weight, payload.kind)
    }

    const candidates = this.rank(descriptor, index, buckets, attempted, options)
    const best = candidates[0] ?? null
    const runnerUp = candidates[1] ?? null
    const confidence = best?.score ?? 0
    const ambiguous = Boolean(
      best && runnerUp && best.score - runnerUp.score < options.ambiguityMargin
    )
    const state = resolveState(confidence, ambiguous, options)

    if (this.history && options.useHistory) {
      for (const entry of trace) {
        if (entry.skipped) continue
        this.history.record(scope, entry.kind, state !== 'not-found' && entry.matched > 0)
      }
    }

    return {
      descriptorId: descriptor.id,
      state,
      confidence,
      ambiguous,
      candidate: state === 'not-found' ? null : best,
      runnerUp,
      candidates,
      trace,
      durationMs: Date.now() - started,
      message: describeState(state, confidence, ambiguous)
    }
  }

  private vote(
    buckets: Map<string, Bucket>,
    element: ElementModel,
    weight: number,
    kind: StrategyKind
  ): void {
    const ref = element.identity.ref
    const bucket = buckets.get(ref)

    if (bucket) {
      bucket.weight += weight
      bucket.votes.push(kind)
      return
    }
    buckets.set(ref, { element, weight, votes: [kind] })
  }

  private rank(
    descriptor: Descriptor,
    index: ModelIndex,
    buckets: Map<string, Bucket>,
    attempted: number,
    options: ResolveOptions
  ): ResolvedCandidate[] {
    const out: ResolvedCandidate[] = []

    for (const bucket of buckets.values()) {
      const context = contextScore(descriptor, bucket.element, index)
      if (options.requireContext && context < 0.2) continue

      const votes = attempted > 0 ? Math.min(1, bucket.weight / attempted) : 0
      const geometry = geometryScore(descriptor, bucket.element)

      out.push({
        ref: bucket.element.identity.ref,
        ordinal: bucket.element.identity.ordinal,
        score: combine(votes, context, geometry),
        voteScore: round(votes),
        contextScore: context,
        geometryScore: geometry,
        votes: bucket.votes.slice()
      })
    }

    out.sort((a, b) => b.score - a.score || a.ordinal - b.ordinal)
    return out.slice(0, options.maxCandidates)
  }
}

function skipped(kind: StrategyKind, weight: number, reason: string): StrategyTrace {
  return { kind, weight, matched: 0, skipped: true, reason, durationMs: 0 }
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}
