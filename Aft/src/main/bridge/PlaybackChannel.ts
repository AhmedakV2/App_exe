import { ipcMain } from 'electron'
import { join } from 'node:path'
import type { Indexer } from '../data'
import type { DescriptorStore, IdentityService } from '../identity'
import {
  PlaybackEngine,
  ScenarioStore,
  parseScenario,
  validateScenario,
  writeReport,
  type PlaybackHost,
  type PlaybackOptions,
  type RunResult,
  type Scenario
} from '../scenario'
import type { ChannelResult } from './types'
import {
  PLAYBACK_PROGRESS_EVENT,
  type ContextListPayload,
  type ContextPayload,
  type FolderAddRequest,
  type FolderPayload,
  type FolderRenameRequest,
  type PlaybackChannelName,
  type RunPayload,
  type RunRequest,
  type ScenarioListPayload,
  type ScenarioMoveRequest,
  type ScenarioPayload
} from './playback-types'

const CHANNELS: PlaybackChannelName[] = [
  'aft:playback:list',
  'aft:playback:get',
  'aft:playback:save',
  'aft:playback:remove',
  'aft:playback:validate',
  'aft:playback:run',
  'aft:playback:cancel',
  'aft:playback:last',
  'aft:playback:contexts',
  'aft:playback:context',
  'aft:playback:move',
  'aft:playback:folder-add',
  'aft:playback:folder-rename',
  'aft:playback:folder-remove'
]

const RETENTION_MS = 14 * 24 * 60 * 60 * 1000

export interface PlaybackChannelOptions {
  userDataDir: string
  host: PlaybackHost
  identity: IdentityService
  descriptors?: DescriptorStore | null
  options?: Partial<PlaybackOptions>
  notify?: (channel: string, payload: unknown) => void
}

export class PlaybackChannel {
  private readonly scenarios: ScenarioStore
  private readonly engine: PlaybackEngine
  private readonly notify: ((channel: string, payload: unknown) => void) | null
  private readonly reportDir: string
  private readonly indexFaults: string[] = []
  private indexer: Indexer | null = null
  private registered = false

  constructor(options: PlaybackChannelOptions) {
    this.scenarios = new ScenarioStore(join(options.userDataDir, 'scenarios'))
    this.reportDir = join(options.userDataDir, 'playback', 'reports')
    this.notify = options.notify ?? null

    this.engine = new PlaybackEngine(options.host, options.identity, {
      descriptors: options.descriptors ?? null,
      options: {
        contextDir: join(options.userDataDir, 'playback', 'contexts'),
        reportDir: '',
        ...options.options
      }
    })
  }

  async start(): Promise<void> {
    await this.scenarios.load()
    await this.engine.store().prune(RETENTION_MS)
  }

  library(): ScenarioStore {
    return this.scenarios
  }

  setIndexer(indexer: Indexer | null): void {
    this.indexer = indexer
  }

  faults(): string[] {
    return [...this.indexFaults]
  }

  register(): void {
    if (this.registered) return
    this.registered = true

    ipcMain.handle('aft:playback:list', () =>
      this.guard('Senaryo listesi hazir', (): ScenarioListPayload => ({
        entries: this.scenarios.entries(),
        folders: this.scenarios.folders()
      }))
    )

    ipcMain.handle('aft:playback:get', (_event, id: unknown) =>
      this.guard('Senaryo okundu', () => this.payload(this.require(String(id))))
    )

    ipcMain.handle('aft:playback:save', (_event, raw: unknown, folder: unknown) =>
      this.guard('Senaryo kaydedildi', async () => {
        const scenario = parseScenario(raw)
        await this.scenarios.write(scenario, typeof folder === 'string' ? folder : null)
        return this.payload(scenario)
      })
    )

    ipcMain.handle('aft:playback:remove', (_event, id: unknown) =>
      this.guard('Senaryo silindi', () => this.scenarios.remove(String(id)))
    )

    ipcMain.handle('aft:playback:validate', (_event, raw: unknown) =>
      this.guard('Senaryo dogrulandi', () => this.payload(parseScenario(raw)))
    )

    ipcMain.handle('aft:playback:run', (_event, request: unknown) =>
      this.guard('Kosum tamamlandi', () => this.run(request as Partial<RunRequest>))
    )

    ipcMain.handle('aft:playback:cancel', () =>
      this.guard('Kosum iptal edildi', () => {
        this.engine.cancel()
        return this.engine.isRunning()
      })
    )

    ipcMain.handle('aft:playback:last', () =>
      this.guard('Son kosum okundu', () => this.engine.last())
    )

    ipcMain.handle('aft:playback:contexts', () =>
      this.guard('Baglam listesi hazir', async (): Promise<ContextListPayload> => ({
        contexts: await this.engine.store().list()
      }))
    )

    ipcMain.handle('aft:playback:move', (_event, request: unknown) =>
      this.guard('Senaryo tasindi', async () => {
        const move = (request ?? {}) as Partial<ScenarioMoveRequest>
        await this.scenarios.move(String(move.scenarioId ?? ''), String(move.folder ?? ''))
        return true
      })
    )

    ipcMain.handle('aft:playback:folder-add', (_event, request: unknown) =>
      this.guard('Klasor olusturuldu', async (): Promise<FolderPayload> => {
        const add = (request ?? {}) as Partial<FolderAddRequest>
        return {
          folder: await this.scenarios.createFolder(
            String(add.parentId ?? ''),
            String(add.name ?? '')
          )
        }
      })
    )

    ipcMain.handle('aft:playback:folder-rename', (_event, request: unknown) =>
      this.guard('Klasor yeniden adlandirildi', async (): Promise<FolderPayload> => {
        const patch = (request ?? {}) as Partial<FolderRenameRequest>
        return {
          folder: await this.scenarios.renameFolder(
            String(patch.id ?? ''),
            String(patch.name ?? '')
          )
        }
      })
    )

    ipcMain.handle('aft:playback:folder-remove', (_event, id: unknown) =>
      this.guard('Klasor silindi', () => this.scenarios.removeFolder(String(id)))
    )

    ipcMain.handle('aft:playback:context', (_event, id: unknown) =>
      this.guard('Baglam paketi okundu', async (): Promise<ContextPayload> => {
        const context = await this.engine.store().read(String(id))
        if (!context) throw new Error('Baglam paketi bulunamadi: ' + String(id))
        return { context }
      })
    )
  }

  async dispose(): Promise<void> {
    if (!this.registered) return
    this.registered = false
    this.engine.cancel()
    for (const channel of CHANNELS) ipcMain.removeHandler(channel)
  }

  private async run(request: Partial<RunRequest>): Promise<RunPayload> {
    const scenario = request.scenario
      ? parseScenario(request.scenario)
      : this.require(String(request.scenarioId ?? ''))

    const run = await this.engine.run(scenario, request.options ?? {}, (done, total, step) => {
      this.notify?.(PLAYBACK_PROGRESS_EVENT, { done, total, step })
    })

    const reports = await writeReport(run, this.reportDir).catch(() => [])
    await this.index(run, reports)
    return { run, reports }
  }

  private async index(run: RunResult, reports: readonly string[]): Promise<void> {
    if (!this.indexer) return

    try {
      const refs = await this.engine.store().refs()
      const wanted = new Set(run.contexts)

      this.indexer.recordRun(run, {
        reports,
        contexts: refs.filter((entry) => wanted.has(entry.id)),
        origin: null,
        author: null,
        enqueue: true
      })
    } catch (error) {
      this.indexFaults.push(error instanceof Error ? error.message : String(error))
    }
  }

  private payload(scenario: Scenario): ScenarioPayload {
    return { scenario, report: validateScenario(scenario) }
  }

  private require(id: string): Scenario {
    const scenario = this.scenarios.get(id)
    if (!scenario) throw new Error('Senaryo bulunamadi: ' + id)
    return scenario
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
