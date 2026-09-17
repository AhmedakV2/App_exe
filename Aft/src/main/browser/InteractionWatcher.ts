import type { Transport } from '../discovery'
import type { HighlightMark, RawInteraction, RawSink } from '../record'
import { DEFAULT_TUNING, DRAIN, sourceFor, type WatchTuning } from './recordScript'

const WORLD = 'aft_record'

const BINDING = '__aftRecordSend'

const POLL_MS = 500

const SAFETY_EVERY = 10

const PROBE_LIMIT = 16

const HANDLE_GROUP = 'aft-record-handles'

interface WorldRef {
  sessionId: string
  frameId: string
  contextId: number
}

interface EvalResult {
  result?: { value?: unknown; objectId?: string }
}

interface FrameNode {
  frame?: { id?: string }
  childFrames?: FrameNode[]
}

export class InteractionWatcher {
  private readonly worlds = new Map<string, WorldRef>()
  private readonly scripts = new Map<string, string>()
  private readonly offs: (() => void)[] = []
  private readonly bindings = new Set<string>()
  private readonly probes = new Map<string, Promise<number>>()
  private timer: ReturnType<typeof setInterval> | null = null
  private source = sourceFor(DEFAULT_TUNING)
  private sink: RawSink | null = null
  private relay: Promise<void> = Promise.resolve()
  private draining = false
  private active = false
  private ticks = 0

  constructor(private readonly tp: Transport) {}

  async start(sink: RawSink, tuning: WatchTuning = DEFAULT_TUNING): Promise<void> {
    this.sink = sink
    if (this.active) return
    this.active = true
    this.source = sourceFor(tuning)

    this.offs.push(
      this.tp.on('Runtime.executionContextCreated', (params, sessionId) => {
        const context = params['context'] as
          | { id?: number; name?: string; auxData?: { frameId?: string } }
          | undefined
        if (!context || context.name !== WORLD || typeof context.id !== 'number') return
        this.remember(sessionId, String(context.auxData?.frameId ?? ''), context.id)
      })
    )

    this.offs.push(
      this.tp.on('Runtime.executionContextDestroyed', (params, sessionId) => {
        const id = Number(params['executionContextId'])
        if (Number.isFinite(id)) this.worlds.delete(key(sessionId, id))
      })
    )

    this.offs.push(
      this.tp.on('Runtime.executionContextsCleared', (_params, sessionId) => {
        for (const ref of Array.from(this.worlds.values())) {
          if (ref.sessionId === sessionId) this.worlds.delete(key(ref.sessionId, ref.contextId))
        }
      })
    )

    this.offs.push(
      this.tp.on('Runtime.bindingCalled', (params, sessionId) => {
        if (String(params['name'] ?? '') !== BINDING) return
        const contextId = Number(params['executionContextId'])
        const ref = this.worlds.get(key(sessionId, contextId))
        if (!ref) return
        this.accept(ref, String(params['payload'] ?? ''))
      })
    )

    this.offs.push(
      this.tp.on('Target.attachedToTarget', (params) => {
        const attached = String((params['sessionId'] as string | undefined) ?? '')
        if (attached) void this.install(attached).catch(() => undefined)
      })
    )

    for (const sessionId of this.tp.sessions) await this.install(sessionId)
    this.timer = setInterval(() => void this.drain(), POLL_MS)
  }

  async stop(): Promise<void> {
    if (!this.active) return
    this.active = false
    this.sink = null

    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.ticks = 0

    for (const off of this.offs.splice(0)) off()

    for (const [sessionId, identifier] of Array.from(this.scripts.entries())) {
      await this.tp.trySend('Page.removeScriptToEvaluateOnNewDocument', { identifier }, sessionId)
    }
    this.scripts.clear()

    for (const sessionId of Array.from(this.bindings)) {
      await this.tp.trySend('Runtime.removeBinding', { name: BINDING }, sessionId)
    }
    this.bindings.clear()

    for (const ref of Array.from(this.worlds.values())) {
      await this.evaluate(ref, 'window.__aftRecord && window.__aftRecord.stop()')
    }
    this.worlds.clear()
    this.probes.clear()
  }

  async mark(highlight: HighlightMark): Promise<void> {
    if (!highlight.rect) return

    const ref = this.worldFor(highlight.sessionId, highlight.frameId)
    if (!ref) return

    const call =
      'window.__aftRecord && window.__aftRecord.mark(' +
      JSON.stringify(highlight.rect) +
      ',' +
      JSON.stringify(highlight.label) +
      ',' +
      JSON.stringify(highlight.tone) +
      ')'

    await this.evaluate(ref, call)
  }

  async clearMarks(): Promise<void> {
    for (const ref of Array.from(this.worlds.values())) {
      await this.evaluate(ref, 'window.__aftRecord && window.__aftRecord.clear()')
    }
  }

  private async install(sessionId: string): Promise<void> {
    if (!this.active) return

    const page = await this.tp.trySend('Page.enable', {}, sessionId)
    if (page === null) return
    await this.tp.trySend('Runtime.enable', {}, sessionId)
    await this.tp.trySend('DOM.enable', {}, sessionId)

    if (!this.bindings.has(sessionId)) {
      const bound = await this.tp.trySend(
        'Runtime.addBinding',
        { name: BINDING, executionContextName: WORLD },
        sessionId
      )
      if (bound !== null) this.bindings.add(sessionId)
    }

    if (!this.scripts.has(sessionId)) {
      const added = await this.tp.trySend<{ identifier?: string }>(
        'Page.addScriptToEvaluateOnNewDocument',
        { source: this.source, worldName: WORLD, runImmediately: true },
        sessionId
      )
      if (added?.identifier) this.scripts.set(sessionId, added.identifier)
    }

    const tree = await this.tp.trySend<{ frameTree?: FrameNode }>(
      'Page.getFrameTree',
      {},
      sessionId
    )
    if (!tree?.frameTree) return

    for (const frameId of frameIds(tree.frameTree)) {
      const world = await this.tp.trySend<{ executionContextId?: number }>(
        'Page.createIsolatedWorld',
        { frameId, worldName: WORLD, grantUniveralAccess: false },
        sessionId
      )
      if (typeof world?.executionContextId !== 'number') continue

      const ref = this.remember(sessionId, frameId, world.executionContextId)
      await this.evaluate(ref, this.source)
    }
  }

  private accept(ref: WorldRef, payload: string): void {
    if (!payload) return

    const item = single(payload)
    if (!item) return

    const seq = Number(item['seq'] ?? 0)

    if (item['kind'] === 'probe') {
      if (seq) this.rememberProbe(ref, seq)
      return
    }

    const pending = this.hydrate(ref, item)

    const task = async (): Promise<void> => {
      const raw = await pending
      if (this.active && this.sink) this.sink([raw])
    }

    const next = this.relay.then(task, task)
    this.relay = next.then(
      () => undefined,
      () => undefined
    )
  }

  private async drain(): Promise<void> {
    if (this.draining || !this.active) return
    this.draining = true

    try {
      const batch: RawInteraction[] = []
      const touched = new Set<string>()
      this.ticks++
      const sweep = this.ticks % SAFETY_EVERY === 0

      for (const ref of Array.from(this.worlds.values())) {
        if (!sweep && this.bindings.has(ref.sessionId)) continue

        const raw = await this.evaluate(ref, DRAIN, true)
        if (raw === null) {
          this.worlds.delete(key(ref.sessionId, ref.contextId))
          continue
        }

        const value = raw.result?.value
        if (typeof value !== 'string' || value.length < 3) continue

        touched.add(ref.sessionId)
        const hydrated = await Promise.all(parse(value).map((item) => this.hydrate(ref, item)))
        for (const item of hydrated) batch.push(item)
      }

      for (const sessionId of touched) {
        void this.tp.trySend('Runtime.releaseObjectGroup', { objectGroup: HANDLE_GROUP }, sessionId)
      }

      if (batch.length && this.sink) {
        const sink = this.sink
        const task = async (): Promise<void> => {
          sink(batch)
        }
        const next = this.relay.then(task, task)
        this.relay = next.then(
          () => undefined,
          () => undefined
        )
      }
    } finally {
      this.draining = false
    }
  }

  private rememberProbe(ref: WorldRef, seq: number): void {
    this.probes.set(key(ref.sessionId, seq), this.resolve(ref, seq))

    while (this.probes.size > PROBE_LIMIT) {
      const oldest = this.probes.keys().next().value
      if (oldest === undefined) break
      this.probes.delete(oldest)
    }
  }

  private claim(ref: WorldRef, probeSeq: number): Promise<number> {
    if (!probeSeq) return Promise.resolve(0)

    const pending = this.probes.get(key(ref.sessionId, probeSeq))
    return pending ? pending.catch(() => 0) : Promise.resolve(0)
  }

  private async hydrate(ref: WorldRef, item: Record<string, unknown>): Promise<RawInteraction> {
    const seq = Number(item['seq'] ?? 0)
    const element = item['element'] as RawInteraction['element']
    const probed = element ? await this.claim(ref, Number(item['probeSeq'] ?? 0)) : 0
    const backendNodeId = element ? probed || (await this.resolve(ref, seq)) : 0

    return {
      seq,
      kind: item['kind'] as RawInteraction['kind'],
      at: Number(item['at'] ?? Date.now()),
      url: String(item['url'] ?? ''),
      sessionId: ref.sessionId,
      frameId: ref.frameId,
      backendNodeId,
      element,
      text: String(item['text'] ?? ''),
      key: String(item['key'] ?? ''),
      optionValue: String(item['optionValue'] ?? ''),
      optionLabel: String(item['optionLabel'] ?? ''),
      files: Array.isArray(item['files']) ? (item['files'] as string[]) : [],
      deltaY: Number(item['deltaY'] ?? 0),
      dwellMs: Number(item['dwellMs'] ?? 0),
      scrollY: Number(item['scrollY'] ?? 0),
      detail: Number(item['detail'] ?? 0)
    }
  }

  private async resolve(ref: WorldRef, seq: number): Promise<number> {
    const handle = await this.tp.trySend<EvalResult>(
      'Runtime.evaluate',
      {
        expression:
          '(function(){ var n = window.__aftRecord && window.__aftRecord.node(' +
          seq +
          '); if (window.__aftRecord) window.__aftRecord.release(' +
          seq +
          '); return n; })()',
        contextId: ref.contextId,
        returnByValue: false,
        awaitPromise: false,
        objectGroup: HANDLE_GROUP
      },
      ref.sessionId
    )
    const objectId = handle?.result?.objectId
    if (!objectId) return 0

    const described = await this.tp.trySend<{ node?: { backendNodeId?: number } }>(
      'DOM.describeNode',
      { objectId },
      ref.sessionId
    )

    return described?.node?.backendNodeId ?? 0
  }

  private evaluate(ref: WorldRef, expression: string, byValue = false): Promise<EvalResult | null> {
    return this.tp.trySend<EvalResult>(
      'Runtime.evaluate',
      { expression, contextId: ref.contextId, returnByValue: byValue, awaitPromise: false },
      ref.sessionId
    )
  }

  private remember(sessionId: string, frameId: string, contextId: number): WorldRef {
    const ref: WorldRef = { sessionId, frameId, contextId }
    this.worlds.set(key(sessionId, contextId), ref)
    return ref
  }

  private worldFor(sessionId: string, frameId: string): WorldRef | null {
    for (const ref of this.worlds.values()) {
      if (ref.sessionId === sessionId && ref.frameId === frameId) return ref
    }
    for (const ref of this.worlds.values()) {
      if (ref.sessionId === sessionId) return ref
    }
    return null
  }
}

function key(sessionId: string, contextId: number): string {
  return sessionId + '|' + contextId
}

function frameIds(node: FrameNode): string[] {
  const out: string[] = []
  const id = node.frame?.id
  if (id) out.push(id)
  for (const child of node.childFrames ?? []) out.push(...frameIds(child))
  return out
}

function single(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function parse(value: string): Record<string, unknown>[] {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : []
  } catch {
    return []
  }
}
