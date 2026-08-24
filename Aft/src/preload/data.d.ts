import type { ChannelResult } from '../main/bridge'
import type {
  DataStatsPayload,
  FlushPayload,
  HealthPayload,
  OutboxStatePayload,
  ReconcilePayload,
  ReportPayload,
  RunDetailPayload,
  RunListPayload,
  ScenarioIndexPayload,
  SweepPayload
} from '../main/bridge'
import type { FragileStep, RunQuery } from '../main/data'

declare global {
  interface Window {
    aftData: {
      runs: (query: Partial<RunQuery>) => Promise<ChannelResult<RunListPayload>>
      run: (id: string) => Promise<ChannelResult<RunDetailPayload>>
      report: (id: string) => Promise<ChannelResult<ReportPayload>>
      scenarios: () => Promise<ChannelResult<ScenarioIndexPayload>>
      health: () => Promise<ChannelResult<HealthPayload>>
      fragile: (limit: number) => Promise<ChannelResult<FragileStep[]>>
      outbox: () => Promise<ChannelResult<OutboxStatePayload>>
      flush: (limit: number) => Promise<ChannelResult<FlushPayload>>
      reconcile: () => Promise<ChannelResult<ReconcilePayload>>
      sweep: () => Promise<ChannelResult<SweepPayload>>
      stats: () => Promise<ChannelResult<DataStatsPayload>>
    }
  }
}
export {}
