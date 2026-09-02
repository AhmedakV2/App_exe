import { ipcMain } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  DataStore,
  DEFAULT_RUN_QUERY,
  FileTransport,
  type Indexer,
  type OutboxTransport,
  type RunQuery,
  type ScenarioIndexRow
} from '../data'
import { ContextStore, SCENARIO_VERSION, type ScenarioStore } from '../scenario'
import type { ChannelResult } from './types'
import type {
  DataChannelName,
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
} from './data-types'

const CHANNELS: DataChannelName[] = [
  'aft:data:runs',
  'aft:data:run',
  'aft:data:report',
  'aft:data:scenarios',
  'aft:data:health',
  'aft:data:fragile',
  'aft:data:outbox',
  'aft:data:flush',
  'aft:data:reconcile',
  'aft:data:sweep',
  'aft:data:stats'
]

const FRAGILE_LIMIT = 25

export interface DataChannelOptions {
  userDataDir: string
  scenarios: ScenarioStore
}

export class DataChannel {
  private readonly store: DataStore
  private readonly scenarios: ScenarioStore
  private readonly contexts: ContextStore
  private registered = false

  constructor(options: DataChannelOptions) {
    this.scenarios = options.scenarios
    this.contexts = new ContextStore(join(options.userDataDir, 'playback', 'contexts'))
    this.store = new DataStore({
      filePath: join(options.userDataDir, 'data', 'aft.db'),
      contexts: this.contexts,
      transport: new FileTransport(join(options.userDataDir, 'data', 'outbox'))
    })
  }

  async start(): Promise<void> {
    this.syncScenarios()
    await this.store.retention.sweep()
  }

  indexer(): Indexer {
    return this.store.indexer
  }

  data(): DataStore {
    return this.store
  }

  setTransport(transport: OutboxTransport): void {
    this.store.outbox.setTransport(transport)
  }

  syncScenarios(): number {
    const rows: ScenarioIndexRow[] = this.scenarios.entries().map((entry) => {
      const scenario = this.scenarios.get(entry.id)
      return {
        id: entry.id,
        title: entry.title,
        steps: entry.steps,
        updatedAt: entry.updatedAt,
        fileName: entry.file,
        schemaVersion: scenario ? scenario.version : SCENARIO_VERSION,
        origin: null,
        author: null
      }
    })

    return this.store.indexer.rebuildScenarioIndex(rows)
  }

  register(): void {
    if (this.registered) return
    this.registered = true

    ipcMain.handle('aft:data:runs', (_event, request: unknown) =>
      this.guard('Kosum listesi hazir', (): RunListPayload => {
        const query = this.query(request)
        return {
          rows: this.store.indexer.runs(query),
          total: this.store.indexer.runCount(query),
          query
        }
      })
    )

    ipcMain.handle('aft:data:run', (_event, id: unknown) =>
      this.guard('Kosum okundu', (): RunDetailPayload => {
        const detail = this.store.indexer.detail(String(id))
        if (!detail) throw new Error('Kosum bulunamadi: ' + String(id))
        return { detail }
      })
    )

    ipcMain.handle('aft:data:report', (_event, id: unknown) =>
      this.guard('Rapor okundu', () => this.report(String(id)))
    )

    ipcMain.handle('aft:data:scenarios', () =>
      this.guard('Senaryo indeksi hazir', (): ScenarioIndexPayload => {
        this.syncScenarios()
        return { rows: this.store.indexer.scenarios() }
      })
    )

    ipcMain.handle('aft:data:health', () =>
      this.guard('Kimlik sagligi hazir', (): HealthPayload => ({
        summary: this.store.indexer.health(),
        fragile: this.store.indexer.fragile(FRAGILE_LIMIT)
      }))
    )

    ipcMain.handle('aft:data:fragile', (_event, limit: unknown) =>
      this.guard('Kirilgan adimlar hazir', () =>
        this.store.indexer.fragile(Number(limit) > 0 ? Number(limit) : FRAGILE_LIMIT)
      )
    )

    ipcMain.handle('aft:data:outbox', () =>
      this.guard('Kuyruk durumu hazir', (): OutboxStatePayload => ({
        summary: this.store.outbox.summary()
      }))
    )

    ipcMain.handle('aft:data:flush', (_event, limit: unknown) =>
      this.guard('Kuyruk bosaltildi', async (): Promise<FlushPayload> => {
        const report = await this.store.outbox.flush(Number(limit) > 0 ? Number(limit) : 20)
        return { report, summary: this.store.outbox.summary() }
      })
    )

    ipcMain.handle('aft:data:reconcile', () =>
      this.guard('Indeks uzlastirildi', async (): Promise<ReconcilePayload> => {
        const scenarios = this.syncScenarios()
        const refs = await this.contexts.refs()
        return { report: this.store.indexer.reconcile(refs), scenarios }
      })
    )

    ipcMain.handle('aft:data:sweep', () =>
      this.guard('Saklama politikasi uygulandi', async (): Promise<SweepPayload> => ({
        report: await this.store.retention.sweep(),
        summary: this.store.outbox.summary()
      }))
    )

    ipcMain.handle('aft:data:stats', () =>
      this.guard('Veri ozeti hazir', async (): Promise<DataStatsPayload> => ({
        stats: await this.store.stats(),
        faults: this.store.driver.fault() ? [this.store.driver.fault()] : []
      }))
    )
  }

  async dispose(): Promise<void> {
    if (this.registered) {
      this.registered = false
      for (const channel of CHANNELS) ipcMain.removeHandler(channel)
    }
    this.store.close()
  }

  private async report(runId: string): Promise<ReportPayload> {
    const row = this.store.indexer.run(runId)
    if (!row) throw new Error('Kosum bulunamadi: ' + runId)
    if (!row.reportTextPath) throw new Error('Rapor dosyasi kayitli degil: ' + runId)

    const text = await readFile(row.reportTextPath, 'utf8')
    return { path: row.reportTextPath, text }
  }

  private query(request: unknown): RunQuery {
    if (!request || typeof request !== 'object') return { ...DEFAULT_RUN_QUERY }

    const raw = request as Partial<RunQuery>
    return {
      scenarioId: typeof raw.scenarioId === 'string' ? raw.scenarioId : '',
      status: raw.status ?? null,
      limit: Number(raw.limit) > 0 ? Number(raw.limit) : DEFAULT_RUN_QUERY.limit,
      offset: Number(raw.offset) > 0 ? Number(raw.offset) : 0
    }
  }

  private async guard<T>(
    message: string,
    handler: () => T | Promise<T>
  ): Promise<ChannelResult<T>> {
    try {
      return { ok: true, data: await handler(), message }
    } catch (error) {
      return {
        ok: false,
        data: null,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  }
}
