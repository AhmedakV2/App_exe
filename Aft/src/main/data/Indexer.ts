import { emptyMetrics } from '../scenario/'
import type { RunMetrics, RunResult, StepResult } from '../scenario/'
import type { DataDriver, DataParam } from './driver'
import type { Outbox } from './Outbox'
import {
  flag,
  toContextRow,
  toRunRow,
  toScenarioRow,
  toStepRow,
  type RawContext,
  type RawRun,
  type RawScenario,
  type RawStep
} from './schema'
import {
  DEFAULT_RUN_QUERY,
  type ContextRef,
  type ContextRow,
  type FragileStep,
  type HealthSummary,
  type ReconcileReport,
  type RecordRunInput,
  type RunDetail,
  type RunQuery,
  type RunRow,
  type RunStepRow,
  type ScenarioIndexRow
} from './types'

const INSERT_RUN = `INSERT INTO run
  (id, scenario_id, scenario_title, scenario_version, started_at, finished_at, status, ok,
   steps, passed, failed, mean_confidence, total_ms, metrics_json, failures_json,
   report_json_path, report_text_path, origin, author)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

const INSERT_STEP = `INSERT INTO run_step
  (run_id, step_index, parent_index, step_id, kind, title, status, duration_ms, attempts,
   scanned, descriptor_id, match_state, confidence, ambiguous, healed, quality, winners, context_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

const INSERT_CONTEXT = `INSERT OR REPLACE INTO failure_context
  (id, run_id, scenario_id, step_id, captured_at, bytes, file_path)
  VALUES (?, ?, ?, ?, ?, ?, ?)`

const UPSERT_SCENARIO = `INSERT INTO scenario_index
  (id, title, steps, updated_at, file_name, schema_version, origin, author)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    title = excluded.title,
    steps = excluded.steps,
    updated_at = excluded.updated_at,
    file_name = excluded.file_name,
    schema_version = excluded.schema_version,
    origin = excluded.origin,
    author = excluded.author`

const FRAGILE_STEPS = `SELECT
    s.descriptor_id AS descriptor_id,
    MAX(s.title) AS title,
    COUNT(*) AS attempts,
    SUM(CASE WHEN s.match_state = 'exact' THEN 1 ELSE 0 END) AS exact_hits,
    SUM(CASE WHEN s.match_state = 'low-confidence' THEN 1 ELSE 0 END) AS low_hits,
    SUM(CASE WHEN s.match_state = 'not-found' THEN 1 ELSE 0 END) AS missing_hits,
    SUM(s.healed) AS healed_hits,
    SUM(s.ambiguous) AS ambiguous_hits,
    AVG(s.confidence) AS mean_confidence,
    MAX(r.started_at) AS last_seen
  FROM run_step s
  JOIN run r ON r.id = s.run_id
  WHERE s.descriptor_id <> ''
  GROUP BY s.descriptor_id
  HAVING low_hits + missing_hits > 0
  ORDER BY (low_hits + missing_hits) DESC, mean_confidence ASC
  LIMIT ?`

const HEALTH_SUMMARY = `SELECT
    (SELECT COUNT(*) FROM run) AS runs,
    (SELECT COUNT(*) FROM run_step) AS steps,
    (SELECT COUNT(*) FROM run_step WHERE match_state = 'exact') AS resolved,
    (SELECT COUNT(*) FROM run_step WHERE match_state = 'low-confidence') AS low,
    (SELECT COUNT(*) FROM run_step WHERE match_state = 'not-found') AS missing,
    (SELECT COUNT(*) FROM run_step WHERE healed = 1) AS healed,
    (SELECT AVG(confidence) FROM run_step WHERE descriptor_id <> '') AS mean_confidence,
    (SELECT MAX(started_at) FROM run) AS last_run`

interface FlatStep {
  step: StepResult
  index: number
  parentIndex: number | null
}

interface RawFragile {
  descriptor_id: string
  title: string
  attempts: number
  exact_hits: number
  low_hits: number
  missing_hits: number
  healed_hits: number
  ambiguous_hits: number
  mean_confidence: number | null
  last_seen: number | null
}

interface RawHealth {
  runs: number
  steps: number
  resolved: number
  low: number
  missing: number
  healed: number
  mean_confidence: number | null
  last_run: number | null
}

function collect(steps: readonly StepResult[]): FlatStep[] {
  const out: FlatStep[] = []

  const walk = (list: readonly StepResult[], parentIndex: number | null): void => {
    for (const step of list) {
      const index = out.length
      out.push({ step, index, parentIndex })
      if (step.children.length) walk(step.children, index)
    }
  }

  walk(steps, null)
  return out
}

function numberOf(value: number | null): number {
  return value === null ? 0 : Number(value)
}

function readMetrics(raw: string): RunMetrics {
  try {
    return { ...emptyMetrics(), ...(JSON.parse(raw) as Partial<RunMetrics>) }
  } catch {
    return emptyMetrics()
  }
}

function readFailures(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : []
  } catch {
    return []
  }
}

export class Indexer {
  constructor(
    private readonly driver: DataDriver,
    private readonly outbox: Outbox | null = null
  ) {}

  recordRun(run: RunResult, input: RecordRunInput): void {
    const flat = collect(run.steps)
    const refs = new Map(input.contexts.map((entry) => [entry.id, entry]))
    const owners = new Map<string, string>()

    for (const entry of flat) {
      if (entry.step.contextId) owners.set(entry.step.contextId, entry.step.stepId)
    }

    this.driver.transaction(() => {
      this.driver.run('DELETE FROM run WHERE id = ?', run.id)

      this.driver.run(
        INSERT_RUN,
        run.id,
        run.scenarioId,
        run.scenarioTitle,
        run.scenarioVersion,
        run.startedAt,
        run.finishedAt,
        run.status,
        flag(run.ok),
        run.metrics.steps,
        run.metrics.passed,
        run.metrics.failed,
        run.metrics.meanConfidence,
        run.metrics.totalMs,
        JSON.stringify(run.metrics),
        JSON.stringify(run.failures),
        input.reports.length > 0 ? input.reports[0] : '',
        input.reports.length > 1 ? input.reports[1] : '',
        input.origin,
        input.author
      )

      for (const entry of flat) {
        const resolution = entry.step.resolution

        this.driver.run(
          INSERT_STEP,
          run.id,
          entry.index,
          entry.parentIndex,
          entry.step.stepId,
          entry.step.kind,
          entry.step.title,
          entry.step.status,
          entry.step.durationMs,
          entry.step.attempts,
          flag(entry.step.scanned),
          resolution ? resolution.descriptorId : '',
          resolution ? resolution.state : null,
          resolution ? resolution.confidence : 0,
          flag(resolution ? resolution.ambiguous : false),
          flag(resolution ? resolution.healed : false),
          resolution ? resolution.quality : 0,
          JSON.stringify(resolution ? resolution.winners : []),
          entry.step.contextId
        )
      }

      for (const id of run.contexts) {
        const ref = refs.get(id)
        if (!ref) continue

        this.driver.run(
          INSERT_CONTEXT,
          id,
          run.id,
          run.scenarioId,
          owners.get(id) ?? '',
          ref.capturedAt,
          ref.bytes,
          ref.filePath
        )
      }

      if (input.enqueue && this.outbox) {
        this.outbox.enqueue('run', run.id, {
          path: input.reports.length > 0 ? input.reports[0] : null
        })
      }
    })
  }

  upsertScenario(row: ScenarioIndexRow): void {
    this.driver.run(
      UPSERT_SCENARIO,
      row.id,
      row.title,
      row.steps,
      row.updatedAt,
      row.fileName,
      row.schemaVersion,
      row.origin,
      row.author
    )
  }

  rebuildScenarioIndex(rows: readonly ScenarioIndexRow[]): number {
    return this.driver.transaction(() => {
      this.driver.run('DELETE FROM scenario_index')
      for (const row of rows) this.upsertScenario(row)
      return rows.length
    })
  }

  removeScenario(id: string): boolean {
    return this.driver.run('DELETE FROM scenario_index WHERE id = ?', id).changes > 0
  }

  scenarios(): ScenarioIndexRow[] {
    const rows = this.driver.all<RawScenario>(
      'SELECT * FROM scenario_index ORDER BY updated_at DESC'
    )
    return rows.map(toScenarioRow)
  }

  runs(query: Partial<RunQuery> = {}): RunRow[] {
    const merged: RunQuery = { ...DEFAULT_RUN_QUERY, ...query }
    const params: DataParam[] = []
    const where = this.filter(merged, params)

    const rows = this.driver.all<RawRun>(
      'SELECT * FROM run' + where + ' ORDER BY started_at DESC LIMIT ? OFFSET ?',
      ...params,
      Math.max(1, Math.trunc(merged.limit)),
      Math.max(0, Math.trunc(merged.offset))
    )
    return rows.map(toRunRow)
  }

  runCount(query: Partial<RunQuery> = {}): number {
    const merged: RunQuery = { ...DEFAULT_RUN_QUERY, ...query }
    const params: DataParam[] = []
    const where = this.filter(merged, params)

    const row = this.driver.get<{ total: number }>(
      'SELECT COUNT(*) AS total FROM run' + where,
      ...params
    )
    return row ? Number(row.total) : 0
  }

  run(id: string): RunRow | null {
    const raw = this.driver.get<RawRun>('SELECT * FROM run WHERE id = ?', id)
    return raw ? toRunRow(raw) : null
  }

  steps(runId: string): RunStepRow[] {
    const rows = this.driver.all<RawStep>(
      'SELECT * FROM run_step WHERE run_id = ? ORDER BY step_index ASC',
      runId
    )
    return rows.map(toStepRow)
  }

  contexts(runId: string): ContextRow[] {
    const rows = this.driver.all<RawContext>(
      'SELECT * FROM failure_context WHERE run_id = ? ORDER BY captured_at ASC',
      runId
    )
    return rows.map(toContextRow)
  }

  detail(runId: string): RunDetail | null {
    const raw = this.driver.get<RawRun>('SELECT * FROM run WHERE id = ?', runId)
    if (!raw) return null

    return {
      run: toRunRow(raw),
      metrics: readMetrics(raw.metrics_json),
      failures: readFailures(raw.failures_json),
      steps: this.steps(runId),
      contexts: this.contexts(runId)
    }
  }

  removeRun(id: string): boolean {
    return this.driver.run('DELETE FROM run WHERE id = ?', id).changes > 0
  }

  fragile(limit = 25): FragileStep[] {
    const rows = this.driver.all<RawFragile>(FRAGILE_STEPS, Math.max(1, Math.trunc(limit)))

    return rows.map((row) => ({
      descriptorId: row.descriptor_id,
      title: row.title,
      attempts: Number(row.attempts),
      exact: Number(row.exact_hits),
      low: Number(row.low_hits),
      missing: Number(row.missing_hits),
      healed: Number(row.healed_hits),
      ambiguous: Number(row.ambiguous_hits),
      meanConfidence: numberOf(row.mean_confidence),
      lastSeenAt: numberOf(row.last_seen)
    }))
  }

  health(): HealthSummary {
    const row = this.driver.get<RawHealth>(HEALTH_SUMMARY)

    return {
      runs: row ? Number(row.runs) : 0,
      steps: row ? Number(row.steps) : 0,
      resolved: row ? Number(row.resolved) : 0,
      low: row ? Number(row.low) : 0,
      missing: row ? Number(row.missing) : 0,
      healed: row ? Number(row.healed) : 0,
      meanConfidence: numberOf(row ? row.mean_confidence : null),
      lastRunAt: numberOf(row ? row.last_run : null)
    }
  }

  reconcile(present: readonly ContextRef[]): ReconcileReport {
    const known = this.driver.all<{ id: string }>('SELECT id FROM failure_context')
    const knownIds = new Set(known.map((row) => row.id))
    const presentIds = new Set(present.map((entry) => entry.id))

    const removedRows = this.driver.transaction(() => {
      let removed = 0
      for (const row of known) {
        if (presentIds.has(row.id)) continue
        removed += this.driver.run('DELETE FROM failure_context WHERE id = ?', row.id).changes
      }
      return removed
    })

    const orphanFiles = present
      .filter((entry) => !knownIds.has(entry.id))
      .map((entry) => entry.filePath)

    return { removedRows, orphanFiles }
  }

  counts(): { scenarios: number; runs: number; steps: number; contexts: number; outbox: number } {
    const row = this.driver.get<{
      scenarios: number
      runs: number
      steps: number
      contexts: number
      outbox: number
    }>(`SELECT
        (SELECT COUNT(*) FROM scenario_index) AS scenarios,
        (SELECT COUNT(*) FROM run) AS runs,
        (SELECT COUNT(*) FROM run_step) AS steps,
        (SELECT COUNT(*) FROM failure_context) AS contexts,
        (SELECT COUNT(*) FROM outbox) AS outbox`)

    return {
      scenarios: row ? Number(row.scenarios) : 0,
      runs: row ? Number(row.runs) : 0,
      steps: row ? Number(row.steps) : 0,
      contexts: row ? Number(row.contexts) : 0,
      outbox: row ? Number(row.outbox) : 0
    }
  }

  private filter(query: RunQuery, params: DataParam[]): string {
    const clauses: string[] = []

    if (query.scenarioId) {
      clauses.push('scenario_id = ?')
      params.push(query.scenarioId)
    }

    if (query.status) {
      clauses.push('status = ?')
      params.push(query.status)
    }

    return clauses.length ? ' WHERE ' + clauses.join(' AND ') : ''
  }
}
