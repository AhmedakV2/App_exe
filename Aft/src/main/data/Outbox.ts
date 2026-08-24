import type { DataDriver } from './driver'
import { toOutboxItem, type RawOutbox } from './schema'
import {
  ACTIVE_SYNC_STATES,
  type FlushReport,
  type OutboxItem,
  type OutboxKind,
  type OutboxPayload,
  type OutboxSummary
} from './types'

export interface OutboxTransport {
  send(item: OutboxItem): Promise<void>
}

export class NullTransport implements OutboxTransport {
  async send(): Promise<void> {
    throw new Error('Gonderim hedefi yapilandirilmadi')
  }
}

export const MAX_ATTEMPTS = 8

const BACKOFF_STEP = 30000

const BACKOFF_CEILING = 3600000

const INSERT_OUTBOX = `INSERT INTO outbox
  (kind, ref_id, payload_path, payload_json, created_at, attempts, next_attempt_at, state, last_error)
  VALUES (?, ?, ?, ?, ?, 0, ?, 'pending', '')`

const CLAIM_OUTBOX = `SELECT * FROM outbox
  WHERE state IN ('pending', 'failed') AND next_attempt_at <= ? AND attempts < ?
  ORDER BY created_at ASC, id ASC
  LIMIT ?`

const SUMMARY_OUTBOX = `SELECT
  SUM(CASE WHEN state = 'pending' THEN 1 ELSE 0 END) AS pending,
  SUM(CASE WHEN state = 'sending' THEN 1 ELSE 0 END) AS sending,
  SUM(CASE WHEN state = 'sent' THEN 1 ELSE 0 END) AS sent,
  SUM(CASE WHEN state = 'failed' THEN 1 ELSE 0 END) AS failed,
  MIN(CASE WHEN state = 'pending' THEN created_at ELSE NULL END) AS oldest
  FROM outbox`

export function backoffFor(attempts: number): number {
  const scaled = BACKOFF_STEP * Math.pow(2, Math.max(0, attempts - 1))
  return Math.min(scaled, BACKOFF_CEILING)
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function count(value: number | null): number {
  return value === null ? 0 : Number(value)
}

export class Outbox {
  private transport: OutboxTransport

  constructor(
    private readonly driver: DataDriver,
    transport?: OutboxTransport
  ) {
    this.transport = transport ?? new NullTransport()
  }

  setTransport(transport: OutboxTransport): void {
    this.transport = transport
  }

  enqueue(kind: OutboxKind, refId: string, payload: OutboxPayload = {}): number {
    const now = Date.now()
    const outcome = this.driver.run(
      INSERT_OUTBOX,
      kind,
      refId,
      payload.path ?? null,
      payload.json ?? null,
      now,
      now
    )
    return outcome.lastInsertRowid
  }

  claim(limit = 20): OutboxItem[] {
    const rows = this.driver.all<RawOutbox>(
      CLAIM_OUTBOX,
      Date.now(),
      MAX_ATTEMPTS,
      Math.max(1, Math.trunc(limit))
    )
    return rows.map(toOutboxItem)
  }

  markSending(id: number): void {
    this.driver.run('UPDATE outbox SET state = ? WHERE id = ?', 'sending', id)
  }

  markSent(id: number): void {
    this.driver.run(
      'UPDATE outbox SET state = ?, last_error = ?, attempts = attempts + 1 WHERE id = ?',
      'sent',
      '',
      id
    )
  }

  markFailed(id: number, error: string): void {
    const row = this.driver.get<{ attempts: number }>(
      'SELECT attempts FROM outbox WHERE id = ?',
      id
    )
    const attempts = (row ? Number(row.attempts) : 0) + 1

    this.driver.run(
      'UPDATE outbox SET state = ?, attempts = ?, next_attempt_at = ?, last_error = ? WHERE id = ?',
      'failed',
      attempts,
      Date.now() + backoffFor(attempts),
      error,
      id
    )
  }

  activeFor(refId: string): number {
    const holes = ACTIVE_SYNC_STATES.map(() => '?').join(', ')
    const row = this.driver.get<{ total: number }>(
      'SELECT COUNT(*) AS total FROM outbox WHERE ref_id = ? AND state IN (' + holes + ')',
      refId,
      ...ACTIVE_SYNC_STATES
    )
    return row ? Number(row.total) : 0
  }

  activeRefs(kind: OutboxKind): string[] {
    const holes = ACTIVE_SYNC_STATES.map(() => '?').join(', ')
    const rows = this.driver.all<{ ref_id: string }>(
      'SELECT DISTINCT ref_id FROM outbox WHERE kind = ? AND state IN (' + holes + ')',
      kind,
      ...ACTIVE_SYNC_STATES
    )
    return rows.map((row) => row.ref_id)
  }

  summary(): OutboxSummary {
    const row = this.driver.get<{
      pending: number | null
      sending: number | null
      sent: number | null
      failed: number | null
      oldest: number | null
    }>(SUMMARY_OUTBOX)

    return {
      pending: count(row ? row.pending : null),
      sending: count(row ? row.sending : null),
      sent: count(row ? row.sent : null),
      failed: count(row ? row.failed : null),
      oldestPendingAt: count(row ? row.oldest : null)
    }
  }

  async flush(limit = 20): Promise<FlushReport> {
    const items = this.claim(limit)
    const report: FlushReport = { claimed: items.length, sent: 0, failed: 0, errors: [] }

    for (const item of items) {
      this.markSending(item.id)

      try {
        await this.transport.send(item)
        this.markSent(item.id)
        report.sent += 1
      } catch (error) {
        const message = reason(error)
        this.markFailed(item.id, message)
        report.failed += 1
        report.errors.push(message)
      }
    }

    return report
  }
}
