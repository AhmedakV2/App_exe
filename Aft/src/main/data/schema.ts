import type { MatchState } from '../identity'
import type { RunStatus, StepKind, StepStatus } from '../scenario'
import type { DataDriver } from './driver'
import type {
  ContextRow,
  OutboxItem,
  OutboxKind,
  RunRow,
  RunStepRow,
  ScenarioIndexRow,
  SyncState
} from './types'

export const SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS scenario_index (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    steps INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    file_name TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    origin TEXT,
    author TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS run (
    id TEXT PRIMARY KEY,
    scenario_id TEXT NOT NULL,
    scenario_title TEXT NOT NULL,
    scenario_version TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    finished_at INTEGER NOT NULL,
    status TEXT NOT NULL,
    ok INTEGER NOT NULL,
    steps INTEGER NOT NULL,
    passed INTEGER NOT NULL,
    failed INTEGER NOT NULL,
    mean_confidence REAL NOT NULL,
    total_ms INTEGER NOT NULL,
    metrics_json TEXT NOT NULL,
    failures_json TEXT NOT NULL,
    report_json_path TEXT NOT NULL,
    report_text_path TEXT NOT NULL,
    origin TEXT,
    author TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS run_step (
    run_id TEXT NOT NULL REFERENCES run(id) ON DELETE CASCADE,
    step_index INTEGER NOT NULL,
    parent_index INTEGER,
    step_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    attempts INTEGER NOT NULL,
    scanned INTEGER NOT NULL,
    descriptor_id TEXT NOT NULL,
    match_state TEXT,
    confidence REAL NOT NULL,
    ambiguous INTEGER NOT NULL,
    healed INTEGER NOT NULL,
    quality REAL NOT NULL,
    winners TEXT NOT NULL,
    context_id TEXT NOT NULL,
    PRIMARY KEY (run_id, step_index)
  )`,
  `CREATE TABLE IF NOT EXISTS failure_context (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES run(id) ON DELETE CASCADE,
    scenario_id TEXT NOT NULL,
    step_id TEXT NOT NULL,
    captured_at INTEGER NOT NULL,
    bytes INTEGER NOT NULL,
    file_path TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    ref_id TEXT NOT NULL,
    payload_path TEXT,
    payload_json TEXT,
    created_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL,
    state TEXT NOT NULL,
    last_error TEXT NOT NULL DEFAULT ''
  )`,
  'CREATE INDEX IF NOT EXISTS run_started_idx ON run (started_at DESC)',
  'CREATE INDEX IF NOT EXISTS run_scenario_idx ON run (scenario_id, started_at DESC)',
  'CREATE INDEX IF NOT EXISTS run_step_descriptor_idx ON run_step (descriptor_id)',
  'CREATE INDEX IF NOT EXISTS run_step_state_idx ON run_step (match_state)',
  'CREATE INDEX IF NOT EXISTS context_captured_idx ON failure_context (captured_at DESC)',
  'CREATE INDEX IF NOT EXISTS context_run_idx ON failure_context (run_id)',
  'CREATE INDEX IF NOT EXISTS outbox_state_idx ON outbox (state, next_attempt_at)',
  'CREATE INDEX IF NOT EXISTS outbox_ref_idx ON outbox (kind, ref_id)'
]

export interface RawRun {
  id: string
  scenario_id: string
  scenario_title: string
  scenario_version: string
  started_at: number
  finished_at: number
  status: string
  ok: number
  steps: number
  passed: number
  failed: number
  mean_confidence: number
  total_ms: number
  metrics_json: string
  failures_json: string
  report_json_path: string
  report_text_path: string
  origin: string | null
  author: string | null
}

export interface RawStep {
  run_id: string
  step_index: number
  parent_index: number | null
  step_id: string
  kind: string
  title: string
  status: string
  duration_ms: number
  attempts: number
  scanned: number
  descriptor_id: string
  match_state: string | null
  confidence: number
  ambiguous: number
  healed: number
  quality: number
  winners: string
  context_id: string
}

export interface RawContext {
  id: string
  run_id: string
  scenario_id: string
  step_id: string
  captured_at: number
  bytes: number
  file_path: string
}

export interface RawScenario {
  id: string
  title: string
  steps: number
  updated_at: number
  file_name: string
  schema_version: string
  origin: string | null
  author: string | null
}

export interface RawOutbox {
  id: number
  kind: string
  ref_id: string
  payload_path: string | null
  payload_json: string | null
  created_at: number
  attempts: number
  next_attempt_at: number
  state: string
  last_error: string
}

export function createSchema(driver: DataDriver): void {
  for (const statement of SCHEMA_STATEMENTS) driver.exec(statement)
}

export function flag(value: boolean): number {
  return value ? 1 : 0
}

export function bool(value: number): boolean {
  return Number(value) === 1
}

export function parseList(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : []
  } catch {
    return []
  }
}

export function toRunRow(raw: RawRun): RunRow {
  return {
    id: raw.id,
    scenarioId: raw.scenario_id,
    scenarioTitle: raw.scenario_title,
    scenarioVersion: raw.scenario_version,
    startedAt: raw.started_at,
    finishedAt: raw.finished_at,
    status: raw.status as RunStatus,
    ok: bool(raw.ok),
    steps: raw.steps,
    passed: raw.passed,
    failed: raw.failed,
    meanConfidence: raw.mean_confidence,
    totalMs: raw.total_ms,
    reportJsonPath: raw.report_json_path,
    reportTextPath: raw.report_text_path,
    origin: raw.origin,
    author: raw.author
  }
}

export function toStepRow(raw: RawStep): RunStepRow {
  return {
    runId: raw.run_id,
    stepIndex: raw.step_index,
    parentIndex: raw.parent_index,
    stepId: raw.step_id,
    kind: raw.kind as StepKind,
    title: raw.title,
    status: raw.status as StepStatus,
    durationMs: raw.duration_ms,
    attempts: raw.attempts,
    scanned: bool(raw.scanned),
    descriptorId: raw.descriptor_id,
    matchState: raw.match_state === null ? null : (raw.match_state as MatchState),
    confidence: raw.confidence,
    ambiguous: bool(raw.ambiguous),
    healed: bool(raw.healed),
    quality: raw.quality,
    winners: parseList(raw.winners),
    contextId: raw.context_id
  }
}

export function toContextRow(raw: RawContext): ContextRow {
  return {
    id: raw.id,
    runId: raw.run_id,
    scenarioId: raw.scenario_id,
    stepId: raw.step_id,
    capturedAt: raw.captured_at,
    bytes: raw.bytes,
    filePath: raw.file_path
  }
}

export function toScenarioRow(raw: RawScenario): ScenarioIndexRow {
  return {
    id: raw.id,
    title: raw.title,
    steps: raw.steps,
    updatedAt: raw.updated_at,
    fileName: raw.file_name,
    schemaVersion: raw.schema_version,
    origin: raw.origin,
    author: raw.author
  }
}

export function toOutboxItem(raw: RawOutbox): OutboxItem {
  return {
    id: raw.id,
    kind: raw.kind as OutboxKind,
    refId: raw.ref_id,
    payloadPath: raw.payload_path,
    payloadJson: raw.payload_json,
    createdAt: raw.created_at,
    attempts: raw.attempts,
    nextAttemptAt: raw.next_attempt_at,
    state: raw.state as SyncState,
    lastError: raw.last_error
  }
}
