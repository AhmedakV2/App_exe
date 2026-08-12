import type { ElementGraph } from '../discovery'
import type { Transport } from '../discovery'
import type { GraphNode, Point } from '../discovery'
import { Actionability, type ActionabilityTarget } from './Actionability'
import { DialogManager } from './DialogManager'
import { InputDispatcher } from './InputDispatcher'
import { NavigationWaiter } from './NavigationWaiter'
import { ActionError, classify } from './errors'
import {
  DEFAULT_ACTION,
  type ActionOptions,
  type ActionOutcome,
  type ActionRequest,
  type ActionTarget,
  type ActionabilityReport,
  type InputMode,
  type NavigationReport
} from './types'

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

  async start(): Promise<void> {
    await this.tp.start()
    await this.navigation.enable()
    await this.dialogs.install(
      this.settings.dialogPolicy,
      this.settings.promptText,
      this.settings.downloadPath
    )
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
    this.navigation.dispose()
    this.dialogs.dispose()
  }

  private async perform(request: ActionRequest): Promise<ActionOutcome> {
    const started = Date.now()
    let target: ActionTarget | null = null
    let report: ActionabilityReport | null = null
    let mode: InputMode | null = null

    try {
      if (request.kind === 'navigate') {
        const navigation = await this.navigate(request)
        return this.done(request, null, null, null, navigation, started, 'Navigasyon tamam')
      }
      if (request.kind === 'wait') {
        const navigation = await this.navigation.observe(
          async () => undefined,
          this.settings.navigation
        )
        return this.done(request, null, null, null, navigation, started, 'Bekleme tamam')
      }
      if (request.kind === 'scroll') {
        const navigation = await this.scroll(request)
        return this.done(request, null, null, null, navigation, started, 'Kaydirma tamam')
      }
      if (request.kind === 'press-key') {
        const navigation = await this.navigation.observe(
          () => this.input.press(request.key ?? ''),
          this.settings.navigation
        )
        return this.done(request, null, null, null, navigation, started, 'Tus gonderildi')
      }

      const located = this.locate(request)
      target = located.target
      const probe: ActionabilityTarget = located.probe

      report = request.force
        ? await this.actionability.wait(probe, this.settings.actionability)
        : await this.actionability.require(probe, this.settings.actionability)

      const point = report.point
      if (!point && !request.force) throw new ActionError('element-not-ready', report.reason)

      const outcome = await this.dispatch(request, located.node, point)
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

  private async dispatch(
    request: ActionRequest,
    node: GraphNode,
    point: Point | null
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
        default:
          throw new ActionError('not-supported', request.kind)
      }
    }

    let message = ''
    let mode: InputMode = preferred

    const navigation = await this.navigation.observe(async () => {
      const result = await run()
      mode = result.mode
      message = result.message
    }, this.settings.navigation)

    await this.release(node.sessionId, objectId)
    return { mode, navigation, message }
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
        return { mode: 'real-input', message: 'Tiklandi' }
      } catch (error) {
        if (!this.settings.fallbackToDirect || button === 'right') throw error
      }
    }
    if (!this.settings.fallbackToDirect)
      throw new ActionError('element-not-ready', 'girdi olayi gonderilemedi')

    await this.input.directClick(node.sessionId, objectId)
    return { mode: 'direct-call', message: 'Yedek yol ile tiklandi' }
  }

  private async doubleClick(
    point: Point | null,
    objectId: string,
    node: GraphNode,
    preferred: InputMode
  ): Promise<{ mode: InputMode; message: string }> {
    if (preferred === 'real-input' && point) {
      await this.input.doubleClick(point)
      return { mode: 'real-input', message: 'Cift tiklandi' }
    }
    await this.input.directClick(node.sessionId, objectId)
    return { mode: 'direct-call', message: 'Yedek yol ile tiklandi' }
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

    if (point) await this.input.click(point)
    await this.input.focus(node.sessionId, objectId)
    if (clearFirst) await this.input.clear(node.sessionId, objectId)

    if (preferred === 'real-input') {
      try {
        await this.input.typeText(text, this.settings.typeDelayMs)
        return { mode: 'real-input', message: 'Metin yazildi' }
      } catch (error) {
        if (!this.settings.fallbackToDirect) throw error
      }
    }

    await this.input.directSetValue(node.sessionId, objectId, text)
    return { mode: 'direct-call', message: 'Yedek yol ile yazildi' }
  }

  private async select(
    request: ActionRequest,
    objectId: string,
    node: GraphNode
  ): Promise<{ mode: InputMode; message: string }> {
    const value = request.optionValue ?? ''
    if (!value) throw new ActionError('invalid-request', 'secenek degeri bos')

    const done = await this.input.selectOption(node.sessionId, objectId, value)
    if (!done) throw new ActionError('element-not-found', 'secenek bulunamadi: ' + value)
    return { mode: 'direct-call', message: 'Secenek secildi' }
  }

  private async upload(
    request: ActionRequest,
    node: GraphNode,
    point: Point | null
  ): Promise<{ mode: InputMode; message: string }> {
    const files = request.files ?? []
    if (!files.length) throw new ActionError('invalid-request', 'dosya listesi bos')

    if (node.tag === 'input') {
      await this.input.setFiles(node.sessionId, node.backendNodeId, files)
      return { mode: 'direct-call', message: 'Dosya atandi' }
    }

    this.dialogs.expectFiles(files)
    if (!point) throw new ActionError('element-not-ready', 'nokta hesaplanamadi')
    await this.input.click(point)

    const chooser = this.dialogs.chooserRequest()
    if (!chooser) throw new ActionError('dialog-blocked', 'dosya secici acilmadi')
    return { mode: 'real-input', message: 'Dosya secici karsilandi' }
  }

  private async navigate(request: ActionRequest): Promise<NavigationReport> {
    const url = request.url ?? ''
    if (!/^https?:\/\//i.test(url)) throw new ActionError('invalid-request', 'gecersiz adres')

    return this.navigation.observe(async () => {
      await this.tp.send('Page.navigate', { url })
    }, this.settings.navigation)
  }

  private async scroll(request: ActionRequest): Promise<NavigationReport> {
    const graph = this.requireGraph()
    const deltaY = request.deltaY ?? 0
    const point: Point = { x: graph.viewport.width / 2, y: graph.viewport.height / 2 }

    return this.navigation.observe(() => this.input.scroll(point, deltaY), this.settings.navigation)
  }

  private locate(request: ActionRequest): {
    node: GraphNode
    target: ActionTarget
    probe: ActionabilityTarget
  } {
    const graph = this.requireGraph()
    let confidence = 1
    let node: GraphNode | undefined

    if (request.descriptorId) {
      if (!this.lookup) throw new ActionError('not-supported', 'kimlik cozumleyici bagli degil')
      const found = this.lookup(request.descriptorId)
      if (!found) throw new ActionError('element-not-found', request.descriptorId)
      if (found.ambiguous) throw new ActionError('element-ambiguous', request.descriptorId)
      confidence = found.confidence
      node = graph.get(found.ref)
    } else if (request.ref) {
      node = graph.get(request.ref)
    } else if (typeof request.ordinal === 'number') {
      node = graph.at(request.ordinal)
    }

    if (!node) throw new ActionError('element-not-found', 'hedef belirtilmedi')

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
