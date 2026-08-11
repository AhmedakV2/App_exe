import type { ModelIndex } from '../model'
import { DescriptorBuilder } from './DescriptorBuilder'
import type {
  Descriptor,
  HealingDecision,
  HealingProposal,
  Resolution,
  StrategyKind
} from './types'

const AUTO_THRESHOLD = 0.7

const BLOCK_THRESHOLD = 0.4

const CRITICAL_KINDS: ReadonlySet<StrategyKind> = new Set(['test-attribute', 'element-id'])

export interface HealingPolicy {
  autoThreshold: number
  blockThreshold: number
  autoOnCriticalLoss: boolean
  maxPending: number
}

export const DEFAULT_HEALING: HealingPolicy = {
  autoThreshold: AUTO_THRESHOLD,
  blockThreshold: BLOCK_THRESHOLD,
  autoOnCriticalLoss: false,
  maxPending: 200
}

export class Healer {
  private readonly pending = new Map<string, HealingProposal>()
  private readonly builder = new DescriptorBuilder()

  constructor(private readonly policy: HealingPolicy = DEFAULT_HEALING) {}

  propose(
    descriptor: Descriptor,
    resolution: Resolution,
    index: ModelIndex
  ): HealingProposal | null {
    if (resolution.state !== 'low-confidence' || !resolution.candidate) return null

    const element = index.get(resolution.candidate.ref)
    if (!element) return null

    const next = this.builder.fromElement(element, index)
    const previousKinds = new Set(descriptor.strategies.map((strategy) => strategy.kind))
    const nextKinds = new Set(next.strategies.map((strategy) => strategy.kind))

    const gained = [...nextKinds].filter((kind) => !previousKinds.has(kind))
    const lost = [...previousKinds].filter((kind) => !nextKinds.has(kind))
    const criticalLoss = lost.some((kind) => CRITICAL_KINDS.has(kind))

    const proposal: HealingProposal = {
      descriptorId: descriptor.id,
      decision: this.decide(resolution, next, criticalLoss),
      confidence: resolution.confidence,
      createdAt: Date.now(),
      previous: descriptor,
      next,
      gained,
      lost,
      reason: reasonOf(resolution, criticalLoss, next.quality.tier)
    }

    if (proposal.decision === 'approval') this.enqueue(proposal)
    return proposal
  }

  apply(proposal: HealingProposal): Descriptor {
    this.pending.delete(proposal.descriptorId)
    return proposal.next
  }

  reject(descriptorId: string): void {
    this.pending.delete(descriptorId)
  }

  queue(): HealingProposal[] {
    return Array.from(this.pending.values()).sort((a, b) => a.createdAt - b.createdAt)
  }

  pendingFor(descriptorId: string): HealingProposal | undefined {
    return this.pending.get(descriptorId)
  }

  clear(): void {
    this.pending.clear()
  }

  private decide(resolution: Resolution, next: Descriptor, criticalLoss: boolean): HealingDecision {
    if (resolution.ambiguous) return 'approval'
    if (resolution.confidence < this.policy.blockThreshold) return 'blocked'
    if (criticalLoss && !this.policy.autoOnCriticalLoss) return 'approval'
    if (next.quality.tier === 'weak') return 'approval'
    return resolution.confidence >= this.policy.autoThreshold ? 'auto' : 'approval'
  }

  private enqueue(proposal: HealingProposal): void {
    if (this.pending.size >= this.policy.maxPending) {
      const oldest = this.queue()[0]
      if (oldest) this.pending.delete(oldest.descriptorId)
    }
    this.pending.set(proposal.descriptorId, proposal)
  }
}

function reasonOf(resolution: Resolution, criticalLoss: boolean, tier: string): string {
  if (resolution.ambiguous) return 'Adaylar birbirine cok yakin, onay gerekiyor'
  if (criticalLoss) return 'Kararli tanimlayici kayboldu, onay gerekiyor'
  if (tier === 'weak') return 'Yeni descriptor zayif, onay gerekiyor'
  return 'Kimlik yenilendi'
}
