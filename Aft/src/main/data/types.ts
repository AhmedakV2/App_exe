import type { MatchState } from '../identity'
import type { RunMetrics, RunStatus, StepKind, StepStatus } from '../scenario'

export const DATA_VERSION = 'aftdata/1.0.0'
export const DATA_USER_VERSION = 1
export type SyncState = 'pending' | 'sending' | 'sent' | 'failed'
export type OutboxKind = 'run' | 'context'
export const ACTIVE_SYNC_STATES: readonly SyncState[] = ['pending', 'sending', 'failed']

export interface ScenarioIndexRow {
  id: string
  title: string
  steps: number
  updatedAt: number
  fileName: string
  schemaVersion: string
  origin: string | null
  author: string | null
}

export interface RunRow {
  id: string
  scenarioId: string
  scenarioTitle: string
  scenarioVersion: string
  startedAt: number
  finishedAt: number
  status: RunStatus
  ok: boolean
  steps: number
  passed: number
  failed: number
  meanConfidence: number
  totalMs: number
  reportJsonPath: string
  reportTextPath: string
  origin: string | null
  author: string | null
}

export interface RunStepRow {
  runId: string
  stepIndex: number
  parentIndex: number | null
  stepId: string
  kind: StepKind
  title: string
  status: StepStatus
  durationMs: number
  attempts: number
  scanned: boolean
  descriptorId: string
  matchState: MatchState | null
  confidence: number
  ambiguous: boolean
  healed: boolean
  quality: number
  winners: string[]
  contextId: string
}

export interface ContextRow {
  id: string
  runId: string
  scenarioId: string
  stepId: string
  capturedAt: number
  bytes: number
  filePath: string
}

export interface RunDetail {
  run: RunRow
  metrics: RunMetrics
  failures: string[]
  steps: RunStepRow[]
  contexts: ContextRow[]
}

export interface OutboxItem {
  id: number
  kind: OutboxKind
  refId: string
  payloadPath: string | null
  payloadJson: string | null
  createdAt: number
  attempts: number
  nextAttemptAt: number
  state: SyncState
  lastError: string
}

export interface OutboxPayload {
  path?: string | null
  json?: string | null
}

export interface RunQuery {
  scenarioId: string
  status: RunStatus | null
  limit: number
  offset: number
}

export const DEFAULT_RUN_QUERY: RunQuery = {
  scenarioId: '',
  status: null,
  limit: 50,
  offset: 0
}

export interface ContextRef {
  id: string
  bytes: number
  capturedAt: number
  filePath: string
}

export interface RecordRunInput {
  reports: readonly string[]
  contexts: readonly ContextRef[]
  origin: string | null
  author: string | null
  enqueue: boolean
}

export interface FragileStep {
  descriptorId: string
  title: string
  attempts: number
  exact: number
  low: number
  missing: number
  healed: number
  ambiguous: number
  meanConfidence: number
  lastSeenAt: number
}

export interface HealthSummary {
  runs: number
  steps: number
  resolved: number
  low: number
  missing: number
  healed: number
  meanConfidence: number
  lastRunAt: number
}

export interface OutboxSummary {
  pending: number
  sending: number
  sent: number
  failed: number
  oldestPendingAt: number
}

export interface FlushReport {
  claimed: number
  sent: number
  failed: number
  errors: string[]
}

export interface ReconcileReport {
  removedRows: number
  orphanFiles: string[]
}

export interface RetentionPolicy {
  runRetentionMs: number
  contextRetentionMs: number
  keepRuns: number
}

export const DEFAULT_RETENTION: RetentionPolicy = {
  runRetentionMs: 30 * 24 * 60 * 60 * 1000,
  contextRetentionMs: 14 * 24 * 60 * 60 * 1000,
  keepRuns: 500
}

export interface RetentionReport {
  runsRemoved: number
  reportsRemoved: number
  contextsRemoved: number
  skippedPending: number
}

export interface DataStats {
  filePath: string
  bytes: number
  userVersion: number
  journalMode: string
  scenarios: number
  runs: number
  steps: number
  contexts: number
  outbox: number
}
