import type { DescriptorSummary } from '../main/identity/DescriptorStore'
import type { HealingProposal } from '../main/identity/types'
import type { ValidationReport } from '../main/model/validate'
import type { ConsumerKind } from '../main/model/schema'
import type {
  CapturePayload,
  ChannelResult,
  ProjectionPayload,
  ResolvePayload,
  StatsPayload
} from '../main/bridge/types'

declare global {
  interface Window {
    aftIdentity: {
      capture: (ordinal: number) => Promise<ChannelResult<CapturePayload>>
      resolve: (descriptorId: string) => Promise<ChannelResult<ResolvePayload>>
      project: (kind: ConsumerKind) => Promise<ChannelResult<ProjectionPayload>>
      validate: () => Promise<ChannelResult<ValidationReport>>
      list: () => Promise<ChannelResult<DescriptorSummary[]>>
      remove: (descriptorId: string) => Promise<ChannelResult<boolean>>
      approvals: () => Promise<ChannelResult<HealingProposal[]>>
      approve: (descriptorId: string) => Promise<ChannelResult<unknown>>
      reject: (descriptorId: string) => Promise<ChannelResult<boolean>>
      stats: (descriptorId: string) => Promise<ChannelResult<StatsPayload>>
    }
  }
}

export {}
