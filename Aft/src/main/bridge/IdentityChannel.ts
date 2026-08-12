import { ipcMain } from 'electron'
import { join } from 'node:path'
import type { DescriptorLookup } from '../action'
import type { ElementGraph } from '../discovery'
import { DescriptorStore } from '../identity'
import { DEFAULT_HEALING, type HealingPolicy } from '../identity'
import { IdentityService } from '../identity'
import { scopeOf } from '../identity'
import type { Descriptor, ResolveOptions } from '../identity'
import { ModelIndex } from '../model'
import { ModelStore } from '../model'
import { project } from '../model'
import type { ConsumerKind } from '../model'
import { toSnapshot } from '../model'
import { validateSnapshot } from '../model'
import type {
  CapturePayload,
  ChannelResult,
  IdentityChannelName,
  ProjectionPayload,
  ResolvePayload,
  StatsPayload
} from './types'

const CHANNELS: IdentityChannelName[] = [
  'aft:identity:capture',
  'aft:identity:resolve',
  'aft:identity:project',
  'aft:identity:validate',
  'aft:identity:list',
  'aft:identity:remove',
  'aft:identity:approvals',
  'aft:identity:approve',
  'aft:identity:reject',
  'aft:identity:stats'
]

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000

export interface IdentityChannelOptions {
  userDataDir: string
  getGraph: () => ElementGraph | null
  healing?: HealingPolicy
  resolve?: Partial<ResolveOptions>
}

export class IdentityChannel {
  private readonly service: IdentityService
  private readonly descriptors: DescriptorStore
  private readonly snapshots: ModelStore
  private readonly getGraph: () => ElementGraph | null
  private cachedGraph: ElementGraph | null = null
  private cachedIndex: ModelIndex | null = null
  private registered = false

  constructor(options: IdentityChannelOptions) {
    this.getGraph = options.getGraph
    this.descriptors = new DescriptorStore(join(options.userDataDir, 'identity', 'catalog.json'))
    this.snapshots = new ModelStore(join(options.userDataDir, 'identity', 'snapshots'))
    this.service = new IdentityService({
      historyPath: join(options.userDataDir, 'identity', 'history.json'),
      healing: options.healing ?? DEFAULT_HEALING,
      resolve: options.resolve ?? {}
    })
  }

  async start(): Promise<void> {
    await this.service.load()
    await this.descriptors.load()
    await this.snapshots.prune(RETENTION_MS)
  }

  register(): void {
    if (this.registered) return
    this.registered = true

    ipcMain.handle('aft:identity:capture', (_event, ordinal: unknown) =>
      this.guard('Descriptor uretildi', () => this.capture(Number(ordinal)))
    )

    ipcMain.handle('aft:identity:resolve', (_event, descriptorId: unknown) =>
      this.guard('Cozumleme tamam', () => this.resolve(String(descriptorId)))
    )

    ipcMain.handle('aft:identity:project', (_event, kind: unknown) =>
      this.guard('Projeksiyon hazir', () => this.project(normalizeKind(kind)))
    )

    ipcMain.handle('aft:identity:validate', () =>
      this.guard('Model dogrulandi', () => validateSnapshot(this.snapshotOf(this.requireGraph())))
    )

    ipcMain.handle('aft:identity:list', () =>
      this.guard('Katalog okundu', () => this.descriptors.summaries())
    )

    ipcMain.handle('aft:identity:remove', (_event, descriptorId: unknown) =>
      this.guard('Descriptor silindi', () => this.descriptors.remove(String(descriptorId)))
    )

    ipcMain.handle('aft:identity:approvals', () =>
      this.guard('Onay kuyrugu okundu', () => this.service.pendingApprovals())
    )

    ipcMain.handle('aft:identity:approve', (_event, descriptorId: unknown) =>
      this.guard('Onarim uygulandi', () => this.approve(String(descriptorId)))
    )

    ipcMain.handle('aft:identity:reject', (_event, descriptorId: unknown) =>
      this.guard('Onarim reddedildi', () => {
        this.service.reject(String(descriptorId))
        return true
      })
    )

    ipcMain.handle('aft:identity:stats', (_event, descriptorId: unknown) =>
      this.guard('Istatistik hazir', () => this.stats(String(descriptorId)))
    )
  }

  invalidate(): void {
    this.cachedGraph = null
    this.cachedIndex = null
  }

  lookup(descriptorId: string): DescriptorLookup | null {
    const descriptor = this.descriptors.get(descriptorId)
    const graph = this.getGraph()
    if (!descriptor || !graph) return null

    const outcome = this.service.resolve(descriptor, this.indexOf(graph))
    if (outcome.healed) this.descriptors.replace(descriptorId, outcome.descriptor)

    const candidate = outcome.resolution.candidate
    if (!candidate) return null

    return {
      ref: candidate.ref,
      confidence: outcome.resolution.confidence,
      ambiguous: outcome.resolution.ambiguous
    }
  }

  async dispose(): Promise<void> {
    if (this.registered) {
      for (const channel of CHANNELS) ipcMain.removeHandler(channel)
      this.registered = false
    }
    this.invalidate()
    this.snapshots.clear()
    await this.descriptors.flush()
    this.descriptors.dispose()
    await this.service.dispose()
  }

  private async capture(ordinal: number): Promise<CapturePayload> {
    if (!Number.isInteger(ordinal) || ordinal < 0) throw new Error('Gecersiz sira: ' + ordinal)

    const index = this.indexOf(this.requireGraph())
    const descriptor = this.service.captureFromIndex(index, ordinal)
    this.descriptors.save(descriptor)
    await this.snapshots.put(index.snapshot)

    const summary = this.descriptors.summaries().find((entry) => entry.id === descriptor.id)
    if (!summary) throw new Error('Descriptor kataloga yazilamadi')

    return { descriptor, summary, warnings: descriptor.quality.reasons }
  }

  private resolve(descriptorId: string): ResolvePayload {
    const descriptor = this.requireDescriptor(descriptorId)
    const index = this.indexOf(this.requireGraph())
    const outcome = this.service.resolve(descriptor, index)

    if (outcome.healed) this.descriptors.replace(descriptorId, outcome.descriptor)

    return {
      resolution: outcome.resolution,
      descriptor: outcome.descriptor,
      proposal: outcome.proposal,
      healed: outcome.healed,
      ordinal: outcome.resolution.candidate?.ordinal ?? -1
    }
  }

  private project(kind: ConsumerKind): ProjectionPayload {
    const index = this.indexOf(this.requireGraph())
    return {
      projection: project(index, kind),
      validation: validateSnapshot(index.snapshot)
    }
  }

  private approve(descriptorId: string): Descriptor {
    const healed = this.service.approve(descriptorId)
    if (!healed) throw new Error('Bekleyen onarim yok: ' + descriptorId)
    return this.descriptors.replace(descriptorId, healed)
  }

  private stats(descriptorId: string): StatsPayload {
    const descriptor = this.requireDescriptor(descriptorId)
    const scope = scopeOf(descriptor)

    return {
      scope,
      strategies: this.service.statsFor(scope),
      descriptors: this.descriptors.all().length,
      weak: this.descriptors.weak().length
    }
  }

  private indexOf(graph: ElementGraph): ModelIndex {
    if (this.cachedGraph === graph && this.cachedIndex) return this.cachedIndex
    const index = new ModelIndex(this.snapshotOf(graph))
    this.cachedGraph = graph
    this.cachedIndex = index
    return index
  }

  private snapshotOf(graph: ElementGraph): ReturnType<typeof toSnapshot> {
    return this.indexOf(graph).snapshot
  }

  private requireGraph(): ElementGraph {
    const graph = this.getGraph()
    if (!graph) throw new Error('Aktif tarama yok, once sayfa taranmali')
    return graph
  }

  private requireDescriptor(descriptorId: string): Descriptor {
    const descriptor = this.descriptors.get(descriptorId)
    if (!descriptor) throw new Error('Descriptor bulunamadi: ' + descriptorId)
    return descriptor
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

function normalizeKind(value: unknown): ConsumerKind {
  return value === 'agent' || value === 'record' || value === 'playback' ? value : 'record'
}
