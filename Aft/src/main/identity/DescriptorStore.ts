import { readFile } from 'node:fs/promises'
import { quarantine, writeFileAtomic } from '../atomic'
import {
  DESCRIPTOR_VERSION,
  SUPPORTED_DESCRIPTOR_VERSIONS,
  type Descriptor,
  type QualityTier
} from './types'

const FLUSH_DELAY = 1200

interface CatalogFile {
  version: string
  savedAt: number
  descriptors: Descriptor[]
}

export interface DescriptorSummary {
  id: string
  tag: string
  role: string
  name: string
  urlPattern: string
  tier: QualityTier
  score: number
  capturedAt: number
}

function catalogFault(error: unknown, moved: string): string {
  const detail = error instanceof Error ? error.message : String(error)
  return 'Katalog bozuk: ' + detail + (moved ? ' | yedek: ' + moved : '')
}

export class DescriptorStore {
  private readonly items = new Map<string, Descriptor>()
  private readonly problems: string[] = []
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private dirty = false

  constructor(private readonly filePath: string) {}

  async load(): Promise<number> {
    this.items.clear()

    let raw = ''
    try {
      raw = await readFile(this.filePath, 'utf8')
    } catch {
      return 0
    }

    try {
      const parsed = JSON.parse(raw) as CatalogFile
      for (const descriptor of parsed.descriptors ?? []) {
        if (!SUPPORTED_DESCRIPTOR_VERSIONS.includes(descriptor.version)) continue
        this.items.set(descriptor.id, descriptor)
      }
    } catch (error) {
      this.items.clear()
      const moved = await quarantine(this.filePath).catch(() => '')
      this.problems.push(catalogFault(error, moved))
    }

    return this.items.size
  }

  faults(): string[] {
    return [...this.problems]
  }

  save(descriptor: Descriptor): Descriptor {
    this.items.set(descriptor.id, descriptor)
    this.touch()
    return descriptor
  }

  replace(previousId: string, descriptor: Descriptor): Descriptor {
    if (previousId !== descriptor.id) this.items.delete(previousId)
    return this.save(descriptor)
  }

  get(id: string): Descriptor | undefined {
    return this.items.get(id)
  }

  remove(id: string): boolean {
    const removed = this.items.delete(id)
    if (removed) this.touch()
    return removed
  }

  all(): Descriptor[] {
    return Array.from(this.items.values())
  }

  byUrlPattern(pattern: string): Descriptor[] {
    return this.all().filter((descriptor) => descriptor.context.urlPattern === pattern)
  }

  weak(): Descriptor[] {
    return this.all().filter((descriptor) => descriptor.quality.tier === 'weak')
  }

  summaries(): DescriptorSummary[] {
    return this.all()
      .map((descriptor) => ({
        id: descriptor.id,
        tag: descriptor.target.tag,
        role: descriptor.target.role,
        name: descriptor.target.name,
        urlPattern: descriptor.context.urlPattern,
        tier: descriptor.quality.tier,
        score: descriptor.quality.score,
        capturedAt: descriptor.capture.capturedAt
      }))
      .sort((a, b) => b.capturedAt - a.capturedAt)
  }

  async flush(): Promise<void> {
    if (!this.dirty) return
    this.dirty = false

    const payload: CatalogFile = {
      version: DESCRIPTOR_VERSION,
      savedAt: Date.now(),
      descriptors: this.all()
    }

    try {
      await writeFileAtomic(this.filePath, JSON.stringify(payload))
    } catch (error) {
      this.dirty = true
      throw error
    }
  }

  dispose(): void {
    if (!this.flushTimer) return
    clearTimeout(this.flushTimer)
    this.flushTimer = null
  }

  private touch(): void {
    this.dirty = true
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      void this.flush().catch(() => undefined)
    }, FLUSH_DELAY)
  }
}
