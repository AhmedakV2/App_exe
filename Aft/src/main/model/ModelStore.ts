import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { digest } from './hash'
import { migrate } from './migrate'
import { ModelIndex } from './ModelIndex'
import type { GraphSnapshot } from './schema'
import { assertSnapshot } from './validate'

const MEMORY_WINDOW = 2

const FILE_SUFFIX = '.snapshot.json.gz'

export interface StoredSnapshot {
  id: string
  capturedAt: number
  bytes: number
}

export class ModelStore {
  private readonly memory = new Map<string, GraphSnapshot>()
  private readonly order: string[] = []
  private ready: Promise<void> | null = null
  private sequence = 0

  constructor(
    private readonly directory: string,
    private readonly window: number = MEMORY_WINDOW
  ) {}

  async put(snapshot: GraphSnapshot): Promise<string> {
    assertSnapshot(snapshot)
    const id = idFor(snapshot, this.sequence++)

    this.memory.set(id, snapshot)
    this.order.push(id)

    while (this.order.length > this.window) {
      const evicted = this.order.shift()
      if (!evicted) break
      const payload = this.memory.get(evicted)
      this.memory.delete(evicted)
      if (payload) await this.spill(evicted, payload)
    }
    return id
  }

  async get(id: string): Promise<GraphSnapshot | null> {
    const cached = this.memory.get(id)
    if (cached) return cached
    return this.read(id)
  }

  async index(id: string): Promise<ModelIndex | null> {
    const snapshot = await this.get(id)
    return snapshot ? new ModelIndex(snapshot) : null
  }

  latest(): GraphSnapshot | null {
    const id = this.order[this.order.length - 1]
    return id ? (this.memory.get(id) ?? null) : null
  }

  async list(): Promise<StoredSnapshot[]> {
    await this.ensure()
    const files = await readdir(this.directory)
    const out: StoredSnapshot[] = []

    for (const file of files) {
      if (!file.endsWith(FILE_SUFFIX)) continue
      const info = await stat(join(this.directory, file))
      out.push({
        id: file.slice(0, -FILE_SUFFIX.length),
        capturedAt: info.mtimeMs,
        bytes: info.size
      })
    }
    return out.sort((a, b) => b.capturedAt - a.capturedAt)
  }

  async prune(maxAgeMs: number): Promise<number> {
    const threshold = Date.now() - maxAgeMs
    let removed = 0

    for (const entry of await this.list()) {
      if (entry.capturedAt >= threshold) continue
      await rm(join(this.directory, entry.id + FILE_SUFFIX), { force: true })
      removed++
    }
    return removed
  }

  clear(): void {
    this.memory.clear()
    this.order.length = 0
  }

  private async spill(id: string, snapshot: GraphSnapshot): Promise<void> {
    await this.ensure()
    const payload = gzipSync(Buffer.from(JSON.stringify(snapshot), 'utf8'))
    await writeFile(join(this.directory, id + FILE_SUFFIX), payload)
  }

  private async read(id: string): Promise<GraphSnapshot | null> {
    await this.ensure()
    try {
      const raw = await readFile(join(this.directory, id + FILE_SUFFIX))
      const parsed: unknown = JSON.parse(gunzipSync(raw).toString('utf8'))
      return assertSnapshot(migrate(parsed).snapshot)
    } catch {
      return null
    }
  }

  private ensure(): Promise<void> {
    if (!this.ready) this.ready = mkdir(this.directory, { recursive: true }).then(() => undefined)
    return this.ready
  }
}

function idFor(snapshot: GraphSnapshot, sequence: number): string {
  return (
    String(snapshot.capturedAt) +
    '-' +
    digest([snapshot.origin.url, snapshot.elements.length, sequence])
  )
}
