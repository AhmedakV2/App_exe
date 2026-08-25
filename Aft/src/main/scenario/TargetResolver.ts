import { normalizeText, strategyByKind } from '../identity'
import type { DescriptorStore, IdentityService } from '../identity'
import type { Descriptor, StrategyPayload } from '../identity'
import type { ElementModel, ModelIndex } from '../model'
import { QUERY_STRATEGY, type ResolutionRecord, type StepQuery, type StepTarget } from './types'

export interface TargetResolution {
  ok: boolean
  reason: string
  element: ElementModel | null
  descriptor: Descriptor | null
  record: ResolutionRecord | null
}

export class TargetResolver {
  constructor(
    private readonly identity: IdentityService,
    private readonly descriptors: DescriptorStore | null = null
  ) {}

  resolve(target: StepTarget, index: ModelIndex, allowLowConfidence: boolean): TargetResolution {
    if (target.kind === 'ordinal') return this.byOrdinal(target, index)
    if (target.kind === 'query') return this.byQuery(target, index, allowLowConfidence)

    const descriptor = this.descriptorOf(target)
    if (!descriptor) {
      return {
        ok: false,
        reason: 'Descriptor bulunamadi: ' + target.descriptorId,
        element: null,
        descriptor: null,
        record: null
      }
    }

    const outcome = this.identity.resolve(descriptor, index)
    const resolution = outcome.resolution
    const candidate = resolution.candidate

    if (outcome.healed && this.descriptors)
      this.descriptors.replace(descriptor.id, outcome.descriptor)

    const record: ResolutionRecord = {
      descriptorId: descriptor.id,
      state: resolution.state,
      confidence: resolution.confidence,
      ambiguous: resolution.ambiguous,
      healed: outcome.healed,
      quality: outcome.descriptor.quality.score,
      ref: candidate?.ref ?? '',
      ordinal: candidate?.ordinal ?? -1,
      winners: candidate ? candidate.votes.slice() : [],
      trace: resolution.trace,
      candidates: resolution.candidates,
      durationMs: resolution.durationMs,
      message: resolution.message
    }

    if (!candidate || resolution.state === 'not-found') {
      return {
        ok: false,
        reason: resolution.message || 'eslesme yok',
        element: null,
        descriptor: outcome.descriptor,
        record
      }
    }
    const trusted = allowLowConfidence || outcome.healed

    if (resolution.state === 'low-confidence' && !trusted) {
      return {
        ok: false,
        reason: resolution.message || 'dusuk guvenli eslesme',
        element: null,
        descriptor: outcome.descriptor,
        record
      }
    }
    if (resolution.ambiguous && !trusted) {
      return {
        ok: false,
        reason: 'aday belirsiz, akis durduruldu',
        element: null,
        descriptor: outcome.descriptor,
        record
      }
    }

    const element = index.get(candidate.ref) ?? null
    if (!element) {
      return {
        ok: false,
        reason: 'aday agacta bulunamadi: ' + candidate.ref,
        element: null,
        descriptor: outcome.descriptor,
        record
      }
    }

    return { ok: true, reason: 'cozumlendi', element, descriptor: outcome.descriptor, record }
  }

  count(target: StepTarget, index: ModelIndex, descriptor: Descriptor | null): number {
    if (target.kind === 'ordinal') return index.at(target.ordinal) ? 1 : 0
    if (target.kind === 'query' && target.query) return matchQuery(target.query, index).length
    if (!descriptor) return 0

    const primary = descriptor.strategies
      .filter((entry) => !entry.dynamic)
      .sort((a, b) => b.weight - a.weight)[0]

    if (!primary) return 0

    const strategy = strategyByKind(primary.kind)
    if (!strategy) return 0

    const refs = new Set<string>()
    for (const element of strategy.match(primary, index)) refs.add(element.identity.ref)
    return refs.size
  }

  private byQuery(
    target: StepTarget,
    index: ModelIndex,
    allowLowConfidence: boolean
  ): TargetResolution {
    const query = target.query
    if (!query) {
      return {
        ok: false,
        reason: 'Sorgu tanimi yok',
        element: null,
        descriptor: null,
        record: null
      }
    }

    const started = Date.now()
    const found = matchQuery(query, index)
    const picked = query.nth >= 0 ? (found[query.nth] ?? null) : (found[0] ?? null)
    const ambiguous = query.nth < 0 && found.length > 1
    const state = picked ? (ambiguous ? 'low-confidence' : 'exact') : 'not-found'
    const confidence = picked ? (ambiguous ? round(1 / found.length) : 1) : 0

    const record: ResolutionRecord = {
      descriptorId: '',
      state,
      confidence,
      ambiguous,
      healed: false,
      quality: 0,
      ref: picked?.identity.ref ?? '',
      ordinal: picked?.identity.ordinal ?? -1,
      winners: picked ? [QUERY_STRATEGY[query.kind]] : [],
      trace: [
        {
          kind: QUERY_STRATEGY[query.kind],
          weight: 1,
          matched: found.length,
          skipped: false,
          reason: found.length ? 'sorgu eslesti' : 'sorgu aday uretmedi',
          durationMs: Date.now() - started
        }
      ],
      candidates: found.slice(0, 8).map((element, position) => ({
        ref: element.identity.ref,
        ordinal: element.identity.ordinal,
        score: position === 0 ? confidence : 0,
        voteScore: confidence,
        contextScore: 0,
        geometryScore: 0,
        anchorScore: 0,
        votes: [QUERY_STRATEGY[query.kind]]
      })),
      durationMs: Date.now() - started,
      message: describeQuery(query, found.length)
    }

    if (!picked) {
      return { ok: false, reason: record.message, element: null, descriptor: null, record }
    }
    if (ambiguous && !allowLowConfidence) {
      return { ok: false, reason: record.message, element: null, descriptor: null, record }
    }

    return { ok: true, reason: 'sorgu ile bulundu', element: picked, descriptor: null, record }
  }

  private byOrdinal(target: StepTarget, index: ModelIndex): TargetResolution {
    const element = index.at(target.ordinal) ?? null
    const record: ResolutionRecord = {
      descriptorId: '',
      state: element ? 'exact' : 'not-found',
      confidence: element ? 1 : 0,
      ambiguous: false,
      healed: false,
      quality: 0,
      ref: element?.identity.ref ?? '',
      ordinal: target.ordinal,
      winners: element ? ['ordinal'] : [],
      trace: [],
      candidates: [],
      durationMs: 0,
      message: element ? 'sira ile bulundu' : 'sira bulunamadi'
    }

    return {
      ok: Boolean(element),
      reason: record.message,
      element,
      descriptor: null,
      record
    }
  }

  private descriptorOf(target: StepTarget): Descriptor | null {
    if (target.descriptor) return target.descriptor
    return this.descriptors?.get(target.descriptorId) ?? null
  }
}

export function matchQuery(query: StepQuery, index: ModelIndex): ElementModel[] {
  const strategy = strategyByKind(QUERY_STRATEGY[query.kind])
  if (!strategy) return []

  const found = strategy.match(queryPayload(query), index)
  const filtered = found.filter((element) => {
    if (query.tag && element.tag !== query.tag) return false
    if (query.role && roleOf(element) !== query.role) return false
    return true
  })

  return filtered.sort((a, b) => a.identity.ordinal - b.identity.ordinal)
}

function queryPayload(query: StepQuery): StrategyPayload {
  const kind = QUERY_STRATEGY[query.kind]
  const parts: Record<string, string> = {}

  if (query.kind === 'test-id') {
    parts['name'] = query.attribute || 'data-testid'
    parts['value'] = query.value
  } else if (query.kind === 'element-id') {
    parts['id'] = query.value
  } else if (query.kind === 'field-name') {
    parts['name'] = query.value
    parts['type'] = ''
    parts['tag'] = ''
    parts['form'] = ''
  } else if (query.kind === 'accessible-name') {
    parts['name'] = normalizeText(query.value, 64)
    parts['role'] = ''
  } else {
    parts['text'] = normalizeText(query.value, 64)
    parts['tag'] = query.tag
  }

  return { kind, value: query.value, parts, weight: 1, dynamic: false }
}

function describeQuery(query: StepQuery, found: number): string {
  const label = query.kind + ' "' + query.value + '"'
  if (!found) return 'Sorgu eslesmedi: ' + label
  if (query.nth >= 0 && found <= query.nth) {
    return 'Sorgu sirasi asildi: ' + label + ', bulunan ' + found
  }
  if (query.nth < 0 && found > 1) {
    return 'Sorgu birden fazla eleman buldu: ' + label + ', bulunan ' + found
  }
  return 'Sorgu ile bulundu: ' + label
}

function roleOf(element: ElementModel): string {
  return element.attrs['role'] || element.accessibility?.role || ''
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}
