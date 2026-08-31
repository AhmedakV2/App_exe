import type { WebContents } from 'electron'
import { collectAx } from './AxCollector'
import { OcclusionIndex, ambiguous, applyOcclusion, probeListeners } from './Classify'
import { ElementGraph } from './ElementGraph'
import { FrameRegistry } from './FrameRegistry'
import { buildGraph, type BuildResult } from './GraphBuilder'
import { captureSession, type SessionSnap } from './SnapshotCollector'
import { StabilityWaiter } from './StabilityWaiter'
import { Transport } from './Transport'
import {
  scanOptions,
  SCHEMA_VERSION,
  type BlindSpot,
  type CoverageSummary,
  type GraphNode,
  type ScanOptions,
  type Viewport
} from './types'

interface LayoutMetrics {
  cssLayoutViewport?: { clientWidth: number; clientHeight: number }
  cssVisualViewport?: { pageX: number; pageY: number }
  cssContentSize?: { width: number; height: number }
}

const EXPAND_LIMIT = 12

export class DiscoveryEngine {
  private readonly tp: Transport
  private readonly waiter: StabilityWaiter
  private readonly frames: FrameRegistry
  private last: ElementGraph | null = null
  private lastSignal = ''
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly wc: WebContents) {
    this.tp = new Transport(wc)
    this.waiter = new StabilityWaiter(this.tp)
    this.frames = new FrameRegistry(this.tp)
  }

  get transport(): Transport {
    return this.tp
  }

  get current(): ElementGraph | null {
    return this.last
  }

  invalidate(): void {
    this.lastSignal = ''
  }

  reset(): void {
    this.lastSignal = ''
    this.frames.invalidate()
  }

  dispose(): void {
    this.last = null
    this.lastSignal = ''
    this.frames.invalidate()
    this.tp.detach()
  }

  scan(options: Partial<ScanOptions> = {}): Promise<ElementGraph> {
    const task = (): Promise<ElementGraph> => this.run(scanOptions(options))
    const next = this.queue.then(task, task)
    this.queue = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }

  private async run(options: ScanOptions): Promise<ElementGraph> {
    const started = Date.now()
    await this.tp.start()
    await this.frames.refresh()

    for (const sessionId of this.tp.sessions) await this.waiter.install(sessionId)

    const root = this.frames.root()
    const quiet = await this.waiter.waitForQuiet(
      root.sessionId,
      root.frameId,
      options.quietMs,
      options.quietTimeoutMs
    )

    const signal = [
      quiet.reading.url,
      quiet.reading.m,
      quiet.reading.sy,
      options.level,
      options.profile
    ].join('|')
    if (!options.force && this.last && signal === this.lastSignal) {
      this.last.coverage.reused = true
      return this.last
    }

    const usesAx = options.level >= 1
    const results: BuildResult[] = []

    const first = await this.pass(usesAx, options, quiet.reading.dpr)
    results.push(first.result)
    let viewport = first.viewport

    let passes = 1
    if (options.level >= 2) {
      const lazy = await this.lazyPasses(results, usesAx, options, quiet.reading)
      passes += lazy.passes
      viewport = lazy.viewport ?? viewport
    }
    if (options.level >= 3) {
      const expand = await this.expandPasses(results, usesAx, options, quiet.reading.dpr)
      passes += expand.passes
      viewport = expand.viewport ?? viewport
    }

    const merged = mergeResults(results)
    const nodes = merged.nodes

    const listenerTargets = nodes.filter(ambiguous)
    const listener = await probeListeners(this.tp, listenerTargets, options.listenerBudget)

    assignIndexes(nodes)

    const occlusion = await applyOcclusion(
      nodes,
      options.occlusionBudget > 0 ? new OcclusionIndex(nodes, merged.lookup) : null,
      options.occlusionBudget
    )

    const tally = count(nodes)
    const frames = this.frames.all()

    const coverage: CoverageSummary = {
      version: SCHEMA_VERSION,
      level: options.level,
      reused: false,
      passes,
      nodes: nodes.length,
      elements: tally.elements,
      interactive: tally.interactive,
      inViewport: tally.inViewport,
      shadowRoots: tally.shadowRoots,
      frames: frames.length,
      framesFailed: frames.filter((frame) => frame.failed).length + this.frames.failedCount,
      blindSpots: merged.blindSpots.length,
      occlusionChecked: occlusion.checked,
      occlusionSkipped: occlusion.skipped,
      listenersProbed: listener.probed,
      listenersSkipped: listener.skipped,
      quietTimedOut: quiet.timedOut,
      durationMs: Date.now() - started
    }

    const graph = new ElementGraph(
      nodes,
      merged.lookup,
      quiet.reading.ok ? quiet.reading.url : this.wc.getURL(),
      quiet.reading.ok ? quiet.reading.title : this.wc.getTitle(),
      viewport,
      frames,
      merged.blindSpots,
      coverage
    )

    this.last = graph
    this.lastSignal = signal
    return graph
  }

  private async pass(
    usesAx: boolean,
    options: ScanOptions,
    dpr: number
  ): Promise<{ result: BuildResult; viewport: Viewport }> {
    const sessions = this.tp.sessions
    const [captured, ax, viewport] = await Promise.all([
      Promise.all(sessions.map((sessionId) => captureSession(this.tp, sessionId))),
      usesAx ? collectAx(this.tp, sessions) : Promise.resolve(new Map()),
      this.readViewport(this.frames.root().sessionId, dpr)
    ])

    const snaps = captured.filter((snap): snap is SessionSnap => snap !== null)
    return {
      result: await buildGraph(snaps, this.frames, ax, viewport, options.viewportMargin),
      viewport
    }
  }

  private async lazyPasses(
    results: BuildResult[],
    usesAx: boolean,
    options: ScanOptions,
    origin: { sy: number; dpr: number }
  ): Promise<{ passes: number; viewport: Viewport | null }> {
    const root = this.frames.root()
    let done = 0
    let viewport: Viewport | null = null

    for (let i = 0; i < options.lazyPasses; i++) {
      const before = await this.waiter.read(root.sessionId, root.frameId)
      if (!before.ok || before.sy + before.h >= before.ph - 4) break
      await this.waiter.scrollBy(root.sessionId, root.frameId, Math.round(before.h * 0.9))
      await this.waiter.waitForQuiet(
        root.sessionId,
        root.frameId,
        options.quietMs,
        options.quietTimeoutMs
      )
      const next = await this.pass(usesAx, options, origin.dpr)
      results.push(next.result)
      viewport = next.viewport
      done++
    }

    if (done > 0) {
      await this.waiter.scrollTo(root.sessionId, root.frameId, 0, origin.sy)
      await this.waiter.waitForQuiet(
        root.sessionId,
        root.frameId,
        options.quietMs,
        options.quietTimeoutMs
      )
      const restored = await this.pass(usesAx, options, origin.dpr)
      results.push(restored.result)
      viewport = restored.viewport
      done++
    }
    return { passes: done, viewport }
  }

  private async expandPasses(
    results: BuildResult[],
    usesAx: boolean,
    options: ScanOptions,
    dpr: number
  ): Promise<{ passes: number; viewport: Viewport | null }> {
    if (options.expandLimit <= 0) return { passes: 0, viewport: null }

    const latest = results[results.length - 1]
    const targets = latest.nodes
      .filter((node) => node.visible && node.attrs['aria-expanded'] === 'false')
      .slice(0, options.expandLimit)
    if (targets.length === 0) return { passes: 0, viewport: null }

    for (const node of targets) await this.clickNode(node)
    const root = this.frames.root()
    await this.waiter.waitForQuiet(
      root.sessionId,
      root.frameId,
      options.quietMs,
      options.quietTimeoutMs
    )
    const next = await this.pass(usesAx, options, dpr)
    results.push(next.result)
    return { passes: 1, viewport: next.viewport }
  }

  private async clickNode(node: GraphNode): Promise<void> {
    const resolved = await this.tp.trySend<{ object?: { objectId?: string } }>(
      'DOM.resolveNode',
      { backendNodeId: node.backendNodeId },
      node.sessionId
    )
    const objectId = resolved?.object?.objectId
    if (!objectId) return
    await this.tp.trySend(
      'Runtime.callFunctionOn',
      { objectId, functionDeclaration: 'function(){ this.click(); }', silent: true },
      node.sessionId
    )
    await this.tp.trySend('Runtime.releaseObject', { objectId }, node.sessionId)
  }

  private async readViewport(sessionId: string, dpr: number): Promise<Viewport> {
    const metrics = await this.tp.trySend<LayoutMetrics>('Page.getLayoutMetrics', {}, sessionId)
    return {
      width: metrics?.cssLayoutViewport?.clientWidth ?? 0,
      height: metrics?.cssLayoutViewport?.clientHeight ?? 0,
      scrollX: Math.round(metrics?.cssVisualViewport?.pageX ?? 0),
      scrollY: Math.round(metrics?.cssVisualViewport?.pageY ?? 0),
      pageWidth: Math.round(metrics?.cssContentSize?.width ?? 0),
      pageHeight: Math.round(metrics?.cssContentSize?.height ?? 0),
      dpr: dpr || 1
    }
  }
}

function mergeResults(results: BuildResult[]): BuildResult {
  if (results.length === 1) return results[0]
  const authoritative = results[results.length - 1]
  const lookup = new Map(authoritative.lookup)
  const nodes = authoritative.nodes.slice()
  const blindSpots = authoritative.blindSpots.slice()
  const seenSpots = new Set(blindSpots.map(spotKey))

  for (let i = 0; i < results.length - 1; i++) {
    for (const node of results[i].nodes) {
      if (lookup.has(node.key)) continue
      node.inViewport = false
      node.occluded = false
      node.occlusionChecked = false
      lookup.set(node.key, node)
      nodes.push(node)
    }
    for (const spot of results[i].blindSpots) {
      const key = spotKey(spot)
      if (seenSpots.has(key)) continue
      seenSpots.add(key)
      blindSpots.push(spot)
    }
  }

  return { nodes, lookup, blindSpots }
}

function spotKey(spot: BlindSpot): string {
  return spot.kind + '' + spot.key + '' + spot.frameId
}

function count(nodes: GraphNode[]): {
  elements: number
  interactive: number
  inViewport: number
  shadowRoots: number
} {
  let elements = 0
  let interactive = 0
  let inViewport = 0
  let shadowRoots = 0

  for (const node of nodes) {
    if (node.nodeType === 1) elements++
    if (node.interactive) interactive++
    if (node.inViewport) inViewport++
    if (node.isShadowRoot) shadowRoots++
  }
  return { elements, interactive, inViewport, shadowRoots }
}

function assignIndexes(nodes: GraphNode[]): void {
  const ordered = nodes
    .filter((node) => node.interactive && node.visible)
    .sort((a, b) => {
      const ay = a.pageRect?.y ?? 0
      const by = b.pageRect?.y ?? 0
      if (ay !== by) return ay - by
      return (a.pageRect?.x ?? 0) - (b.pageRect?.x ?? 0)
    })
  for (const node of nodes) node.index = -1
  for (let i = 0; i < ordered.length; i++) ordered[i].index = i
}
