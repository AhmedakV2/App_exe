import type { ConsumerKind } from '../model'
import type { ConsumerProjection } from '../model'
import type { ValidationReport } from '../model'
import type { DescriptorSummary } from '../identity'
import type { Descriptor, HealingProposal, Resolution, StrategyStat } from '../identity'

export type IdentityChannelName =
  | 'aft:identity:capture'
  | 'aft:identity:resolve'
  | 'aft:identity:project'
  | 'aft:identity:validate'
  | 'aft:identity:list'
  | 'aft:identity:remove'
  | 'aft:identity:approvals'
  | 'aft:identity:approve'
  | 'aft:identity:reject'
  | 'aft:identity:stats'

export interface ChannelResult<T> {
  ok: boolean
  data: T | null
  message: string
}

export interface CapturePayload {
  descriptor: Descriptor
  summary: DescriptorSummary
  warnings: string[]
}

export interface ResolvePayload {
  resolution: Resolution
  descriptor: Descriptor
  proposal: HealingProposal | null
  healed: boolean
  ordinal: number
}

export interface ProjectionPayload {
  projection: ConsumerProjection
  validation: ValidationReport
}

export interface StatsPayload {
  scope: string
  strategies: Record<string, StrategyStat>
  descriptors: number
  weak: number
}

export interface ProjectionRequest {
  kind: ConsumerKind
}
