import type {
  DataStats,
  FlushReport,
  FragileStep,
  HealthSummary,
  OutboxSummary,
  ReconcileReport,
  RetentionReport,
  RunDetail,
  RunQuery,
  RunRow,
  ScenarioIndexRow
} from '../data'

export type DataChannelName =
  | 'aft:data:runs'
  | 'aft:data:run'
  | 'aft:data:report'
  | 'aft:data:scenarios'
  | 'aft:data:health'
  | 'aft:data:fragile'
  | 'aft:data:outbox'
  | 'aft:data:flush'
  | 'aft:data:reconcile'
  | 'aft:data:sweep'
  | 'aft:data:stats'

export interface RunListPayload {
  rows: RunRow[]
  total: number
  query: RunQuery
}
export interface RunDetailPayload {
  detail: RunDetail
}
export interface ReportPayload {
  path: string
  text: string
}
export interface ScenarioIndexPayload {
  rows: ScenarioIndexRow[]
}
export interface HealthPayload {
  summary: HealthSummary
  fragile: FragileStep[]
}
export interface OutboxStatePayload {
  summary: OutboxSummary
}
export interface FlushPayload {
  report: FlushReport
  summary: OutboxSummary
}
export interface ReconcilePayload {
  report: ReconcileReport
  scenarios: number
}
export interface SweepPayload {
  report: RetentionReport
  summary: OutboxSummary
}
export interface DataStatsPayload {
  stats: DataStats
  faults: string[]
}
