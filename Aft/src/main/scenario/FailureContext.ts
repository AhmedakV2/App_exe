import { readFile, readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import type { ActionOutcome } from '../action'
import { writeFileAtomic } from '../atomic'
import type { ElementGraph } from '../discovery'
import { digest } from '../model'
import type { ModelIndex } from '../model'
import {
  CONTEXT_VERSION,
  type AssertionRecord,
  type ElementDump,
  type FailureContext,
  type ResolutionRecord,
  type StateCheck,
  type StoredContext
} from './types'

const FILE_SUFFIX = '.context.json.gz'

const ELEMENT_CAP = 400

const TEXT_CAP = 120

export interface StoredContextRef extends StoredContext {
  filePath: string
}

export interface ContextInput {
  runId: string
  scenarioId: string
  stepId: string
  stepTitle: string
  message: string
  graph: ElementGraph | null
  index: ModelIndex | null
  resolution: ResolutionRecord | null
  assertions: AssertionRecord[]
  stateCheck: StateCheck | null
  outcome: ActionOutcome | null
  screenshot: string
}

export function buildContext(input: ContextInput): FailureContext {
  const origin = input.index?.snapshot.origin ?? null

  return {
    version: CONTEXT_VERSION,
    id: digest([input.runId, input.stepId, Date.now()]),
    runId: input.runId,
    scenarioId: input.scenarioId,
    stepId: input.stepId,
    stepTitle: input.stepTitle,
    capturedAt: Date.now(),
    url: origin?.url ?? '',
    title: origin?.title ?? '',
    scanLevel: origin?.scanLevel ?? 1,
    coverage: input.graph?.coverage ?? null,
    blindSpots: input.graph ? input.graph.blindSpots.slice() : [],
    elements: input.index ? dumpElements(input.index) : [],
    resolution: input.resolution,
    assertions: input.assertions,
    stateCheck: input.stateCheck,
    outcome: input.outcome,
    message: input.message,
    screenshot: input.screenshot
  }
}

export function dumpElements(index: ModelIndex): ElementDump[] {
  return index
    .addressable()
    .slice(0, ELEMENT_CAP)
    .map((element) => ({
      ordinal: element.identity.ordinal,
      ref: element.identity.ref,
      tag: element.tag,
      role: element.attrs['role'] || element.accessibility?.role || '',
      name: (element.accessibility?.name || element.attrs['aria-label'] || '').slice(0, TEXT_CAP),
      text: element.text.slice(0, TEXT_CAP),
      rect: element.geometry.viewport,
      visible: element.visibility.state === 'visible',
      interactive: element.interactivity.interactive
    }))
}

export class ContextStore {
  constructor(private readonly directory: string) {}

  enabled(): boolean {
    return Boolean(this.directory)
  }

  async write(context: FailureContext): Promise<string> {
    if (!this.directory) return ''

    const payload = gzipSync(Buffer.from(JSON.stringify(context), 'utf8'))
    await writeFileAtomic(join(this.directory, context.id + FILE_SUFFIX), payload)
    return context.id
  }

  async refs(): Promise<StoredContextRef[]> {
    const stored = await this.list()
    return stored.map((entry) => ({
      ...entry,
      filePath: join(this.directory, entry.id + FILE_SUFFIX)
    }))
  }

  async read(id: string): Promise<FailureContext | null> {
    try {
      const raw = await readFile(join(this.directory, id + FILE_SUFFIX))
      return JSON.parse(gunzipSync(raw).toString('utf8')) as FailureContext
    } catch {
      return null
    }
  }

  async list(): Promise<StoredContext[]> {
    let names: string[] = []
    try {
      names = await readdir(this.directory)
    } catch {
      return []
    }

    const out: StoredContext[] = []
    for (const name of names) {
      if (!name.endsWith(FILE_SUFFIX)) continue
      const info = await stat(join(this.directory, name))
      out.push({
        id: name.slice(0, -FILE_SUFFIX.length),
        bytes: info.size,
        capturedAt: info.mtimeMs
      })
    }
    return out.sort((a, b) => b.capturedAt - a.capturedAt)
  }

  async prune(retentionMs: number): Promise<number> {
    const limit = Date.now() - retentionMs
    let removed = 0

    for (const entry of await this.list()) {
      if (entry.capturedAt >= limit) continue
      await rm(join(this.directory, entry.id + FILE_SUFFIX), { force: true })
      removed++
    }
    return removed
  }
}
