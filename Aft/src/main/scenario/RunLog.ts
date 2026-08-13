import type { LogEntry, LogLevel, ResolutionRecord, AssertionRecord, StateCheck } from './types'

const MAX_ENTRIES = 5000

export class RunLog {
  private readonly entries: LogEntry[] = []

  push(level: LogLevel, stepId: string, message: string, detail: string[] = []): LogEntry {
    const entry: LogEntry = { at: Date.now(), level, stepId, message, detail }
    this.entries.push(entry)
    if (this.entries.length > MAX_ENTRIES) this.entries.shift()
    return entry
  }

  resolution(stepId: string, record: ResolutionRecord): void {
    const detail = record.trace
      .filter((trace) => !trace.skipped)
      .map(
        (trace) =>
          trace.kind +
          ' agirlik ' +
          trace.weight +
          ' aday ' +
          trace.matched +
          ' sure ' +
          trace.durationMs +
          ' ms'
      )

    if (record.winners.length) detail.push('tutan strateji: ' + record.winners.join(', '))
    if (record.healed) detail.push('descriptor onarildi')
    if (record.ambiguous) detail.push('adaylar birbirine yakin')

    this.push(
      'resolve',
      stepId,
      'Cozumleme ' +
        record.state +
        ', guven ' +
        percent(record.confidence) +
        ', sira ' +
        record.ordinal,
      detail
    )
  }

  assertion(stepId: string, record: AssertionRecord): void {
    this.push('assert', stepId, (record.passed ? 'Dogrulandi ' : 'Dogrulanamadi ') + record.kind, [
      'beklenen: ' + record.expected,
      'gerceklesen: ' + record.actual,
      record.message
    ])
  }

  state(stepId: string, check: StateCheck, strict: boolean): void {
    this.push(
      check.ok || !strict ? 'state' : 'warn',
      stepId,
      check.ok ? 'Sayfa durumu kayit aniyla uyumlu' : 'Sayfa durumu kayit anindan farkli',
      check.reasons
    )
  }

  all(): LogEntry[] {
    return this.entries.slice()
  }

  clear(): void {
    this.entries.length = 0
  }
}

export function renderLog(entries: readonly LogEntry[]): string {
  const lines: string[] = []
  for (const entry of entries) {
    lines.push(stamp(entry.at) + ' ' + pad(entry.level, 8) + entry.message)
    for (const row of entry.detail) if (row) lines.push('                   ' + row)
  }
  return lines.join('\n')
}

function percent(value: number): string {
  return (value * 100).toFixed(1) + '%'
}

function stamp(at: number): string {
  const date = new Date(at)
  const unit = (value: number): string => String(value).padStart(2, '0')
  return unit(date.getHours()) + ':' + unit(date.getMinutes()) + ':' + unit(date.getSeconds())
}

function pad(value: string, width: number): string {
  return value.length >= width ? value + ' ' : value + ' '.repeat(width - value.length)
}
