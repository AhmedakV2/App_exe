import type { DescriptorStore, IdentityService } from '../identity'
import type { Descriptor } from '../identity'
import type { ElementModel, ModelIndex } from '../model'
import type { ResolutionRecord, StepTarget } from './types'

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
    if (resolution.state === 'low-confidence' && !allowLowConfidence) {
      return {
        ok: false,
        reason: resolution.message || 'dusuk guvenli eslesme',
        element: null,
        descriptor: outcome.descriptor,
        record
      }
    }
    if (resolution.ambiguous && !allowLowConfidence) {
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
