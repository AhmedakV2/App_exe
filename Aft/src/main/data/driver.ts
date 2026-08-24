import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { StatementSync } from 'node:sqlite'

export const MEMORY_PATH = ':memory:'
export type DataParam = string | number | null

export interface RunOutcome {
  changes: number
  lastInsertRowid: number
}
export interface DataDriver {
  exec(sql: string): void
  run(sql: string, ...params: DataParam[]): RunOutcome
  get<T>(sql: string, ...params: DataParam[]): T | null
  all<T>(sql: string, ...params: DataParam[]): T[]
  transaction<T>(work: () => T): T
  userVersion(): number
  setUserVersion(value: number): void
  journalMode(): string
  path(): string
  fault(): string
  close(): void
}
export class DriverError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DriverError'
  }
}
const PRAGMAS: readonly string[] = [
  'PRAGMA journal_mode = WAL',
  'PRAGMA synchronous = NORMAL',
  'PRAGMA foreign_keys = ON',
  'PRAGMA busy_timeout = 5000'
]
function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
function toNumber(value: number | bigint): number {
  return typeof value === 'bigint' ? Number(value) : value
}
class SqliteDriver implements DataDriver {
  private readonly db: DatabaseSync
  private readonly cache = new Map<string, StatementSync>()
  private depth = 0
  private lastFault = ''
  constructor(private readonly filePath: string) {
    this.db = new DatabaseSync(filePath, { enableForeignKeyConstraints: true })
    for (const pragma of PRAGMAS) this.db.exec(pragma)
  }
  exec(sql: string): void {
    this.db.exec(sql)
  }
  run(sql: string, ...params: DataParam[]): RunOutcome {
    const outcome = this.statement(sql).run(...params)
    return {
      changes: toNumber(outcome.changes),
      lastInsertRowid: toNumber(outcome.lastInsertRowid)
    }
  }
  get<T>(sql: string, ...params: DataParam[]): T | null {
    const row = this.statement(sql).get(...params)
    return row === undefined ? null : (row as unknown as T)
  }
  all<T>(sql: string, ...params: DataParam[]): T[] {
    return this.statement(sql).all(...params) as unknown as T[]
  }
  transaction<T>(work: () => T): T {
    if (this.depth > 0) return work()
    this.depth = 1
    this.db.exec('BEGIN TRANSACTION')
    try {
      const out = work()
      this.db.exec('COMMIT')
      this.depth = 0
      return out
    } catch (error) {
      this.abort()
      throw error
    }
  }
  userVersion(): number {
    const row = this.get<{ user_version: number }>('PRAGMA user_version')
    return row ? Number(row.user_version) : 0
  }
  setUserVersion(value: number): void {
    this.db.exec('PRAGMA user_version = ' + Math.trunc(value))
  }
  journalMode(): string {
    const row = this.get<{ journal_mode: string }>('PRAGMA journal_mode')
    return row ? String(row.journal_mode) : ''
  }
  path(): string {
    return this.filePath
  }
  fault(): string {
    return this.lastFault
  }
  close(): void {
    this.cache.clear()
    this.db.close()
  }
  private abort(): void {
    this.depth = 0
    try {
      this.db.exec('ROLLBACK')
    } catch (error) {
      this.lastFault = 'Geri alma basarisiz: ' + reason(error)
    }
  }
  private statement(sql: string): StatementSync {
    const cached = this.cache.get(sql)
    if (cached) return cached
    const made = this.db.prepare(sql)
    this.cache.set(sql, made)
    return made
  }
}
export function openDatabase(filePath: string): DataDriver {
  try {
    if (filePath !== MEMORY_PATH) mkdirSync(dirname(filePath), { recursive: true })
    return new SqliteDriver(filePath)
  } catch (error) {
    throw new DriverError('Veritabani acilmadi: ' + filePath + '|' + reason(error))
  }
}
