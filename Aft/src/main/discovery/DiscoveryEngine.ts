import type { WebContents } from 'electron'
import { collectAx } from './AxCollector'
import { OcclusionIndex, ambiguous, applyOcclusion, probeListeners } from './Classify'
import { ElementGraph } from './ElementGraph'
import { FrameRegistry } from './FrameRegistry'
import { buildGraph, type BuildResult } from './GraphBuilder'
import { captureSession, type SessionSnap } from './SnapshotCollector'
import { StabilityWaiter, delay } from './StabilityWaiter'
import { Transport } from './Transport'
import {
  DEFAULT_SCAN,
  SCHEMA_VERSION,
  type CoverageSummary,
  type GraphNode,
  type ScanOptions,
  type Viewport
} from './types'

interface LayoutMetrics {
  cssLayoutViewport: { clientWidth: number; clientHeight: number }
  cssVisualViewport: { pageX: number; pageY: number }
  cssContentSize: { width: number; height: number }
}

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

  dispose(): void {
    this.last = null
    this.lastSignal = ''
    this.tp.detach()
  }

  scan(options: Partial<ScanOptions> = {}): Promise<ElementGraph> {
    const task = (): Promise<ElementGraph> => this.run({ ...DEFAULT_SCAN, ...options })
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
    await delay(50)
    await this.frames.refresh()

    for (const sessionId of this.tp.sessions) await this.waiter.install(sessionId)

    const root = this.frames.root()
    const quiet = await this.waiter.waitForQuiet(
      root.sessionId,
      root.frameId,
      options.quietMs,
      options.quietTimeoutMs
    )

    const signal = [quiet.reading.url, quiet.reading.m, quiet.reading.sy, options.level].join('|')
    if (!options.force && this.last && signal === this.lastSignal) {
      this.last.coverage.reused = true
      return this.last
    }

    const viewport = await this.readViewport(root.sessionId, quiet.reading.dpr)
    const usesAx = options.level >= 1
    const results: BuildResult[] = []

    const first = await this.pass(viewport, usesAx, options)
    results.push(first)

    let passes = 1
    if (options.level >= 2) {
      passes += await this.lazyPasses(results, viewport, usesAx, options, quiet.reading.sy)
    }
    if (options.level >= 3) {
      passes += await this.expandPasses(results, viewport, usesAx, options)
    }

    const merged = mergeResults(results)
    const nodes = merged.nodes

    const listenerTargets = nodes.filter(ambiguous)
    const listener = await probeListeners(this.tp, listenerTargets, options.listenerBudget)

    assignIndexes(nodes)

    const occlusion = applyOcclusion(
      nodes,
      new OcclusionIndex(nodes, merged.lookup),
      options.occlusionBudget
    )

    const coverage: CoverageSummary = {
      version: SCHEMA_VERSION,
      level: options.level,
      reused: false,
      passes,
      nodes: nodes.length,
      elements: nodes.filter((node) => node.nodeType === 1).length,
      interactive: nodes.filter((node) => node.interactive).length,
      inViewport: nodes.filter((node) => node.inViewport).length,
      shadowRoots: nodes.filter((node) => node.isShadowRoot).length,
      frames: this.frames.all().length,
      framesFailed:
        this.frames.all().filter((frame) => frame.failed).length + this.frames.failedCount,
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
      this.frames.all(),
      merged.blindSpots,
      coverage
    )

    this.last = graph
    this.lastSignal = signal
    return graph
  }

  private async pass(
    viewport: Viewport,
    usesAx: boolean,
    options: ScanOptions
  ): Promise<BuildResult> {
    const snaps: SessionSnap[] = []
    for (const sessionId of this.tp.sessions) {
      const snap = await captureSession(this.tp, sessionId)
      if (snap) snaps.push(snap)
    }
    const ax = usesAx ? await collectAx(this.tp, this.tp.sessions) : new Map()
    return buildGraph(snaps, this.frames, ax, viewport, options.viewportMargin)
  }

  private async lazyPasses(
    results: BuildResult[],
    viewport: Viewport,
    usesAx: boolean,
    options: ScanOptions,
    originalScrollY: number
  ): Promise<number> {
    const root = this.frames.root()
    let done = 0
    for (let i = 0; i < options.lazyPasses; i++) {
      const before = await this.waiter.read(root.sessionId, root.frameId)
      if (before.sy + before.h >= before.ph - 4) break
      await this.waiter.scrollBy(root.sessionId, root.frameId, Math.round(before.h * 0.9))
      await this.waiter.waitForQuiet(
        root.sessionId,
        root.frameId,
        options.quietMs,
        options.quietTimeoutMs
      )
      results.push(await this.pass(viewport, usesAx, options))
      done++
    }
    if (done > 0) {
      await this.waiter.scrollTo(root.sessionId, root.frameId, 0, originalScrollY)
      await this.waiter.waitForQuiet(
        root.sessionId,
        root.frameId,
        options.quietMs,
        options.quietTimeoutMs
      )
      results.push(await this.pass(viewport, usesAx, options))
      done++
    }
    return done
  }

  private async expandPasses(
    results: BuildResult[],
    viewport: Viewport,
    usesAx: boolean,
    options: ScanOptions
  ): Promise<number> {
    const latest = results[results.length - 1]
    const targets = latest.nodes
      .filter((node) => node.visible && node.attrs['aria-expanded'] === 'false')
      .slice(0, 12)
    if (targets.length === 0) return 0

    for (const node of targets) await this.clickNode(node)
    const root = this.frames.root()
    await this.waiter.waitForQuiet(
      root.sessionId,
      root.frameId,
      options.quietMs,
      options.quietTimeoutMs
    )
    results.push(await this.pass(viewport, usesAx, options))
    return 1
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
      width: metrics?.cssLayoutViewport.clientWidth ?? 0,
      height: metrics?.cssLayoutViewport.clientHeight ?? 0,
      scrollX: Math.round(metrics?.cssVisualViewport.pageX ?? 0),
      scrollY: Math.round(metrics?.cssVisualViewport.pageY ?? 0),
      pageWidth: Math.round(metrics?.cssContentSize.width ?? 0),
      pageHeight: Math.round(metrics?.cssContentSize.height ?? 0),
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
      if (!blindSpots.some((item) => item.kind === spot.kind && item.key === spot.key)) {
        blindSpots.push(spot)
      }
    }
  }

  return { nodes, lookup, blindSpots }
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
