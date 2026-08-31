import { delay } from '../discovery'
import type { ElementGraph } from '../discovery'
import type { Transport } from '../discovery'
import type { GraphNode, Point } from '../discovery'
import { Actionability, type ActionabilityTarget } from './Actionability'
import { DialogManager, FILE_CHOOSER_TIMEOUT_MS } from './DialogManager'
import { InputDispatcher } from './InputDispatcher'
import { NavigationWaiter } from './NavigationWaiter'
import { ActionError, classify } from './errors'
import {
  DEFAULT_ACTION,
  NAVIGATION_GRACE,
  type ActionOptions,
  type ActionOutcome,
  type ActionRequest,
  type ActionTarget,
  type ActionabilityReport,
  type InputMode,
  type NavigationReport
} from './types'

const FALLBACK_VIEWPORT = { width: 1280, height: 800 }

const WHEEL_SETTLE_MS = 80

export interface DescriptorLookup {
  ref: string
  confidence: number
  ambiguous: boolean
}

export interface ActionEngineOptions {
  getGraph: () => ElementGraph | null
  resolveDescriptor?: (descriptorId: string) => DescriptorLookup | null
  options?: Partial<ActionOptions>
}

export class ActionEngine {
  private readonly actionability: Actionability
  private readonly input: InputDispatcher
  private readonly navigation: NavigationWaiter
  private readonly dialogs: DialogManager
  private readonly settings: ActionOptions
  private readonly getGraph: () => ElementGraph | null
  private readonly lookup: ((descriptorId: string) => DescriptorLookup | null) | null
  private queue: Promise<unknown> = Promise.resolve()
  private started: Promise<void> | null = null

  constructor(
    private readonly tp: Transport,
    config: ActionEngineOptions
  ) {
    this.actionability = new Actionability(tp)
    this.input = new InputDispatcher(tp)
    this.navigation = new NavigationWaiter(tp)
    this.dialogs = new DialogManager(tp)
    this.settings = { ...DEFAULT_ACTION, ...config.options }
    this.getGraph = config.getGraph
    this.lookup = config.resolveDescriptor ?? null
  }

  start(): Promise<void> {
    if (!this.started) this.started = this.install()
    return this.started
  }

  private async install(): Promise<void> {
    try {
      await this.tp.start()
      await this.navigation.enable()
      await this.dialogs.install(
        this.settings.dialogPolicy,
        this.settings.promptText,
        this.settings.downloadPath
      )
    } catch (error) {
      this.started = null
      throw error
    }
  }

  execute(request: ActionRequest): Promise<ActionOutcome> {
    const task = (): Promise<ActionOutcome> => this.perform(request)
    const next = this.queue.then(task, task)
    this.queue = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }

  dispose(): void {
    this.started = null
    this.navigation.dispose()
    this.dialogs.dispose()
  }

  private async perform(request: ActionRequest): Promise<ActionOutcome> {
    const started = Date.now()
    const deadline = request.timeoutMs && request.timeoutMs > 0 ? started + request.timeoutMs : 0
    let target: ActionTarget | null = null
    let report: ActionabilityReport | null = null
    let mode: InputMode | null = null

    try {
      if (request.kind === 'navigate') {
        const navigation = await this.navigate(request, deadline)
        return this.done(request, null, null, null, navigation, started, 'Navigasyon tamam')
      }
      if (request.kind === 'wait') {
        const navigation = await this.navigation.observe(
          async () => undefined,
          this.navigationFor(request, deadline)
        )
        return this.done(request, null, null, null, navigation, started, 'Bekleme tamam')
      }
      if (request.kind === 'refresh') {
        const navigation = await this.refresh(deadline)
        return this.done(request, null, null, null, navigation, started, 'Sayfa yenilendi')
      }
      if (request.kind === 'scroll' && !targeted(request)) {
        const navigation = await this.scrollPage(request, deadline)
        return this.done(request, null, null, null, navigation, started, 'Kaydirma tamam')
      }
      if (request.kind === 'press-key' && !targeted(request)) {
        const key = requireKey(request)
        const navigation = await this.navigation.observe(
          () => this.input.press(key),
          this.navigationFor(request, deadline)
        )
        return this.done(request, null, null, null, navigation, started, 'Tus gonderildi: ' + key)
      }

      const located = this.locate(request)
      target = located.target
      const probe: ActionabilityTarget = located.probe

      const lenient = request.force || directOnly(request.kind, located.node)
      const budget = this.actionabilityFor(deadline)

      report = lenient
        ? await this.actionability.wait(probe, budget)
        : await this.actionability.require(probe, budget)

      const point = report.point
      if (!point && !lenient) throw new ActionError('element-not-ready', report.reason)

      const outcome = await this.dispatch(request, located.node, point, deadline)
      mode = outcome.mode

      return this.done(request, target, report, mode, outcome.navigation, started, outcome.message)
    } catch (error) {
      const failure = classify(error)
      return {
        ok: false,
        kind: request.kind,
        target,
        mode,
        message: failure.message,
        code: failure.code,
        actionability: report,
        navigation: null,
        dialogs: this.dialogs.consumeDialogs(),
        downloads: this.dialogs.consumeDownloads(),
        durationMs: Date.now() - started
      }
    }
  }

  private navigationFor(
    request: ActionRequest,
    deadline: number
  ): Partial<ActionOptions['navigation']> {
    const base = this.settings.navigation
    const grace = NAVIGATION_GRACE[request.kind]
    const options = {
      ...base,
      inDocumentGraceMs: grace === undefined ? base.inDocumentGraceMs : grace
    }
    if (!deadline) return options

    const left = Math.max(0, deadline - Date.now())
    return {
      ...options,
      inDocumentGraceMs: Math.min(options.inDocumentGraceMs, left),
      lifecycleTimeoutMs: Math.min(options.lifecycleTimeoutMs, left),
      networkTimeoutMs: Math.min(options.networkTimeoutMs, left)
    }
  }

  private actionabilityFor(deadline: number): Partial<ActionOptions['actionability']> {
    const base = this.settings.actionability
    if (!deadline) return base

    const left = Math.max(0, deadline - Date.now())
    return { ...base, timeoutMs: Math.min(base.timeoutMs, Math.round(left * 0.7)) }
  }

  private async dispatch(
    request: ActionRequest,
    node: GraphNode,
    point: Point | null,
    deadline: number
  ): Promise<{ mode: InputMode; navigation: NavigationReport; message: string }> {
    const preferred: InputMode = request.mode ?? 'real-input'
    const objectId = await this.objectOf(node)

    const run = async (): Promise<{ mode: InputMode; message: string }> => {
      switch (request.kind) {
        case 'click':
          return this.clickLike(point, objectId, node, preferred, 'left', 1)
        case 'double-click':
          return this.doubleClick(point, objectId, node, preferred)
        case 'right-click':
          return this.clickLike(point, objectId, node, preferred, 'right', 1)
        case 'hover':
          if (!point) throw new ActionError('element-not-ready', 'nokta hesaplanamadi')
          await this.input.move(point)
          return { mode: 'real-input', message: 'Isaretlendi' }
        case 'type':
          return this.type(request, objectId, node, point, preferred, false)
        case 'clear-type':
          return this.type(request, objectId, node, point, preferred, true)
        case 'select-option':
          return this.select(request, objectId, node)
        case 'upload':
          return this.upload(request, node, point)
        case 'press-key':
          return this.pressOn(request, objectId, node, point, preferred)
        case 'scroll':
          return this.scrollOn(request, objectId, node, point)
        default:
          throw new ActionError('not-supported', request.kind)
      }
    }

    let message = ''
    let mode: InputMode = preferred

    try {
      const navigation = await this.navigation.observe(
        async () => {
          const result = await run()
          mode = result.mode
          message = result.message
        },
        this.navigationFor(request, deadline)
      )

      return { mode, navigation, message }
    } finally {
      await this.release(node.sessionId, objectId)
    }
  }

  private async clickLike(
    point: Point | null,
    objectId: string,
    node: GraphNode,
    preferred: InputMode,
    button: 'left' | 'right',
    clicks: number
  ): Promise<{ mode: InputMode; message: string }> {
    if (preferred === 'real-input' && point) {
      try {
        await this.input.click(point, button, clicks)
        return { mode: 'real-input', message: button === 'right' ? 'Sag tiklandi' : 'Tiklandi' }
      } catch (error) {
        if (!this.settings.fallbackToDirect) throw error
      }
    } else if (preferred === 'real-input' && !this.settings.fallbackToDirect) {
      throw new ActionError('element-not-ready', 'girdi olayi gonderilemedi')
    }

    if (button === 'right') {
      await this.input.directContextMenu(node.sessionId, objectId)
      return { mode: 'direct-call', message: 'Dogrudan cagri ile sag tiklandi' }
    }

    await this.input.directClick(node.sessionId, objectId)
    return { mode: 'direct-call', message: 'Dogrudan cagri ile tiklandi' }
  }

  private async doubleClick(
    point: Point | null,
    objectId: string,
    node: GraphNode,
    preferred: InputMode
  ): Promise<{ mode: InputMode; message: string }> {
    if (preferred === 'real-input' && point) {
      try {
        await this.input.doubleClick(point)
        return { mode: 'real-input', message: 'Cift tiklandi' }
      } catch (error) {
        if (!this.settings.fallbackToDirect) throw error
      }
    }
    await this.input.directDoubleClick(node.sessionId, objectId)
    return { mode: 'direct-call', message: 'Dogrudan cagri ile cift tiklandi' }
  }

  private async pressOn(
    request: ActionRequest,
    objectId: string,
    node: GraphNode,
    point: Point | null,
    preferred: InputMode
  ): Promise<{ mode: InputMode; message: string }> {
    const key = requireKey(request)
    const focus = await this.focusOn(objectId, node, point, preferred)

    await this.input.press(key, node.sessionId)
    return { mode: focus.mode, message: focus.message + ', tus gonderildi: ' + key }
  }

  private async scrollOn(
    request: ActionRequest,
    objectId: string,
    node: GraphNode,
    point: Point | null
  ): Promise<{ mode: InputMode; message: string }> {
    const deltaY = request.deltaY ?? 0

    if (point) {
      const before = await this.input.readScrollTop(node.sessionId, objectId)
      await this.input.scroll(point, deltaY)
      await delay(WHEEL_SETTLE_MS)
      const after = await this.input.readScrollTop(node.sessionId, objectId)

      if (before === null || after === null || after !== before) {
        return { mode: 'real-input', message: 'Kaydirildi: ' + deltaY + ' px' }
      }
    }

    const done = await this.input.directScroll(node.sessionId, objectId, deltaY)
    if (!done) throw new ActionError('element-not-ready', 'eleman kaydirilamadi')
    return { mode: 'direct-call', message: 'Dogrudan cagri ile kaydirildi: ' + deltaY + ' px' }
  }

  private async focusOn(
    objectId: string,
    node: GraphNode,
    point: Point | null,
    preferred: InputMode
  ): Promise<{ mode: InputMode; message: string }> {
    if (await this.input.focusInto(node.sessionId, objectId)) {
      return { mode: 'direct-call', message: 'Odaklandi' }
    }
    if (point && preferred === 'real-input') {
      await this.input.click(point)
      if (await this.input.focusInto(node.sessionId, objectId)) {
        return { mode: 'real-input', message: 'Tiklanarak odaklandi' }
      }
      return { mode: 'real-input', message: 'Tiklandi, odak alinamadi' }
    }
    return { mode: 'direct-call', message: 'Odak alinamadi' }
  }

  private async type(
    request: ActionRequest,
    objectId: string,
    node: GraphNode,
    point: Point | null,
    preferred: InputMode,
    clearFirst: boolean
  ): Promise<{ mode: InputMode; message: string }> {
    const text = request.text ?? ''
    if (!text && !clearFirst) throw new ActionError('invalid-request', 'metin bos')

    await this.focusOn(objectId, node, point, preferred)
    if (clearFirst) await this.input.clear(node.sessionId, objectId)

    const before = clearFirst ? '' : ((await this.input.readValue(node.sessionId, objectId)) ?? '')

    if (preferred === 'real-input') {
      try {
        await this.input.typeText(text, this.settings.typeDelayMs)
        const landed = await this.input.readValue(node.sessionId, objectId)
        if (landed === null || landed === before + text) {
          return { mode: 'real-input', message: 'Metin yazildi' }
        }
        if (!this.settings.fallbackToDirect) {
          throw new ActionError('element-not-ready', 'girdi olaylari metne donusmedi')
        }
      } catch (error) {
        if (!this.settings.fallbackToDirect) throw error
      }
    }

    await this.input.directSetValue(node.sessionId, objectId, before + text)
    return { mode: 'direct-call', message: 'Dogrudan cagri ile yazildi' }
  }

  private async select(
    request: ActionRequest,
    objectId: string,
    node: GraphNode
  ): Promise<{ mode: InputMode; message: string }> {
    const value = request.optionValue ?? ''
    if (!value) throw new ActionError('invalid-request', 'secenek degeri bos')

    const outcome = await this.input.selectOption(node.sessionId, objectId, value)
    if (outcome === 'no-select') {
      throw new ActionError('not-supported', 'hedef bir liste degil: ' + node.tag)
    }
    if (outcome !== 'ok') throw new ActionError('element-not-found', 'secenek bulunamadi: ' + value)
    return { mode: 'direct-call', message: 'Secenek secildi: ' + value }
  }

  private async upload(
    request: ActionRequest,
    node: GraphNode,
    point: Point | null
  ): Promise<{ mode: InputMode; message: string }> {
    const files = request.files ?? []
    if (!files.length) throw new ActionError('invalid-request', 'dosya listesi bos')

    if (fileInput(node)) {
      await this.input.setFiles(node.sessionId, node.backendNodeId, files)
      return { mode: 'direct-call', message: 'Dosya atandi: ' + files.join(', ') }
    }

    if (!point) throw new ActionError('element-not-ready', 'nokta hesaplanamadi')

    const since = Date.now()
    this.dialogs.expectFiles(files)
    await this.input.click(point)

    const chooser = await this.dialogs.awaitChooser(since, FILE_CHOOSER_TIMEOUT_MS)
    if (!chooser) throw new ActionError('dialog-blocked', 'dosya secici acilmadi')
    return { mode: 'real-input', message: 'Dosya secici karsilandi' }
  }

  private async navigate(request: ActionRequest, deadline: number): Promise<NavigationReport> {
    const url = request.url ?? ''
    if (!/^https?:\/\//i.test(url)) throw new ActionError('invalid-request', 'gecersiz adres')

    return this.navigation.observe(
      async () => {
        await this.tp.send('Page.navigate', { url })
      },
      this.navigationFor(request, deadline)
    )
  }

  private async scrollPage(request: ActionRequest, deadline: number): Promise<NavigationReport> {
    const deltaY = request.deltaY ?? 0
    const point = await this.viewportCenter()

    return this.navigation.observe(
      () => this.input.scroll(point, deltaY),
      this.navigationFor(request, deadline)
    )
  }

  private async viewportCenter(): Promise<Point> {
    const graph = this.getGraph()
    if (graph) return { x: graph.viewport.width / 2, y: graph.viewport.height / 2 }

    const metrics = await this.tp.trySend<{
      cssLayoutViewport?: { clientWidth?: number; clientHeight?: number }
    }>('Page.getLayoutMetrics', {})

    const width = metrics?.cssLayoutViewport?.clientWidth ?? 0
    const height = metrics?.cssLayoutViewport?.clientHeight ?? 0

    return {
      x: (width || FALLBACK_VIEWPORT.width) / 2,
      y: (height || FALLBACK_VIEWPORT.height) / 2
    }
  }

  private async refresh(deadline: number): Promise<NavigationReport> {
    return this.navigation.observe(
      async () => {
        await this.tp.send('Page.reload', { ignoreCache: false })
      },
      this.navigationFor({ kind: 'refresh' }, deadline)
    )
  }

  private locate(request: ActionRequest): {
    node: GraphNode
    target: ActionTarget
    probe: ActionabilityTarget
  } {
    const graph = this.requireGraph()
    const ordinal = typeof request.ordinal === 'number' ? request.ordinal : -1
    let confidence = 1
    let node: GraphNode | undefined

    if (request.descriptorId) {
      if (!this.lookup) throw new ActionError('not-supported', 'kimlik cozumleyici bagli degil')
      const found = this.lookup(request.descriptorId)
      if (!found) throw new ActionError('element-not-found', request.descriptorId)
      if (found.ambiguous) throw new ActionError('element-ambiguous', request.descriptorId)
      confidence = found.confidence
      node = graph.get(found.ref)
    }

    if (!node && request.ref) node = graph.get(request.ref)
    if (!node && ordinal >= 0) node = graph.at(ordinal)

    if (!node) {
      const asked = request.descriptorId || request.ref || (ordinal >= 0 ? '#' + ordinal : '')
      throw new ActionError(
        'element-not-found',
        asked ? 'hedef taramada bulunamadi: ' + asked : 'hedef belirtilmedi'
      )
    }

    const frame = graph.frames.find((entry) => entry.frameId === node.frameId)

    return {
      node,
      target: {
        ref: node.key,
        ordinal: node.index,
        sessionId: node.sessionId,
        backendNodeId: node.backendNodeId,
        frameId: node.frameId,
        tag: node.tag,
        confidence
      },
      probe: {
        sessionId: node.sessionId,
        backendNodeId: node.backendNodeId,
        frameOffset: frame?.offset ?? { x: 0, y: 0 },
        viewport: graph.viewport
      }
    }
  }

  private async objectOf(node: GraphNode): Promise<string> {
    const resolved = await this.tp.trySend<{ object?: { objectId?: string } }>(
      'DOM.resolveNode',
      { backendNodeId: node.backendNodeId },
      node.sessionId
    )
    const objectId = resolved?.object?.objectId
    if (!objectId) throw new ActionError('element-not-found', 'dugum cozumlenemedi')
    return objectId
  }

  private async release(sessionId: string, objectId: string): Promise<void> {
    await this.tp.trySend('Runtime.releaseObject', { objectId }, sessionId)
  }

  private requireGraph(): ElementGraph {
    const graph = this.getGraph()
    if (!graph) throw new ActionError('page-not-loaded', 'aktif tarama yok')
    return graph
  }

  private done(
    request: ActionRequest,
    target: ActionTarget | null,
    actionability: ActionabilityReport | null,
    mode: InputMode | null,
    navigation: NavigationReport | null,
    started: number,
    message: string
  ): ActionOutcome {
    return {
      ok: true,
      kind: request.kind,
      target,
      mode,
      message,
      code: null,
      actionability,
      navigation,
      dialogs: this.dialogs.consumeDialogs(),
      downloads: this.dialogs.consumeDownloads(),
      durationMs: Date.now() - started
    }
  }
}

function targeted(request: ActionRequest): boolean {
  if (request.descriptorId) return true
  if (request.ref) return true
  return typeof request.ordinal === 'number' && request.ordinal >= 0
}

function requireKey(request: ActionRequest): string {
  const key = (request.key ?? '').trim()
  if (!key) throw new ActionError('invalid-request', 'tus degeri bos')
  return key
}

function directOnly(kind: ActionRequest['kind'], node: GraphNode): boolean {
  if (kind === 'press-key' || kind === 'scroll' || kind === 'select-option') return true
  if (kind === 'upload') return fileInput(node)
  return false
}

function fileInput(node: GraphNode): boolean {
  return node.tag === 'input' && (node.attrs['type'] ?? '').toLowerCase() === 'file'
}
