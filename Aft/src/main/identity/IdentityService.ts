import type { ElementGraph } from '../discovery'
import { ModelIndex } from '../model'
import { toSnapshot } from '../model'
import { assertSnapshot } from '../model'
import { DescriptorBuilder } from './DescriptorBuilder'
import { DEFAULT_HEALING, Healer, type HealingPolicy } from './Healing'
import { HistoryStore } from './HistoryStore'
import { Resolver } from './Resolver'
import type { Descriptor, HealingProposal, ResolveOptions, Resolution, StrategyStat } from './types'

export interface IdentityOptions {
  historyPath: string
  healing: HealingPolicy
  resolve: Partial<ResolveOptions>
}

export interface CaptureResult {
  descriptor: Descriptor
  index: ModelIndex
}

export interface ResolveResult {
  resolution: Resolution
  descriptor: Descriptor
  proposal: HealingProposal | null
  healed: boolean
}

export class IdentityService {
  private readonly builder = new DescriptorBuilder()
  private readonly history: HistoryStore
  private readonly resolver: Resolver
  private readonly healer: Healer
  private readonly resolveOptions: Partial<ResolveOptions>
  private readonly indexes = new WeakMap<ElementGraph, ModelIndex>()

  constructor(options: IdentityOptions) {
    this.history = new HistoryStore(options.historyPath)
    this.resolver = new Resolver(this.history)
    this.healer = new Healer(options.healing ?? DEFAULT_HEALING)
    this.resolveOptions = options.resolve ?? {}
  }

  load(): Promise<void> {
    return this.history.load()
  }

  index(graph: ElementGraph): ModelIndex {
    const cached = this.indexes.get(graph)
    if (cached) return cached

    const index = new ModelIndex(assertSnapshot(toSnapshot(graph)))
    this.indexes.set(graph, index)
    return index
  }

  captureByRef(graph: ElementGraph, ref: string): CaptureResult {
    const index = this.index(graph)
    return { descriptor: this.builder.build(ref, index), index }
  }

  captureByOrdinal(graph: ElementGraph, ordinal: number): CaptureResult {
    const index = this.index(graph)
    return { descriptor: this.captureFromIndex(index, ordinal), index }
  }

  captureFromIndex(index: ModelIndex, ordinal: number): Descriptor {
    const element = index.at(ordinal)
    if (!element) throw new Error('Descriptor uretilemedi, sira bulunamadi: ' + ordinal)
    return this.builder.fromElement(element, index)
  }

  resolve(descriptor: Descriptor, index: ModelIndex): ResolveResult {
    const resolution = this.resolver.resolve(descriptor, index, this.resolveOptions)
    const proposal = this.healer.propose(descriptor, resolution, index)
    const healed = proposal?.decision === 'auto'

    return {
      resolution,
      descriptor: healed && proposal ? this.healer.apply(proposal) : descriptor,
      proposal,
      healed
    }
  }

  resolveOn(descriptor: Descriptor, graph: ElementGraph): ResolveResult {
    return this.resolve(descriptor, this.index(graph))
  }

  approve(descriptorId: string): Descriptor | null {
    const proposal = this.healer.pendingFor(descriptorId)
    return proposal ? this.healer.apply(proposal) : null
  }

  reject(descriptorId: string): void {
    this.healer.reject(descriptorId)
  }

  pendingApprovals(): HealingProposal[] {
    return this.healer.queue()
  }

  statsFor(scope: string): Record<string, StrategyStat> {
    return this.history.stats(scope)
  }

  async dispose(): Promise<void> {
    this.healer.clear()
    await this.history.flush()
    this.history.dispose()
  }
}
