import { WebContentsView } from 'electron'
import { ActionEngine } from '../action'
import type { ActionOutcome, ActionRequest, DescriptorLookup } from '../action'
import { DiscoveryEngine } from '../discovery'
import type { ElementGraph } from '../discovery'
import type { ScanLevel, ScanProfileName, Transport } from '../discovery'
import { Overlay } from './Overlay'
import type { AgentAction, PageState } from './types'

const SYNC_DELAY = 260

export type DescriptorResolver = (descriptorId: string) => DescriptorLookup | null

export interface ActionReport {
  ok: boolean
  result: string
  page: PageState | null
  outcome: ActionOutcome | null
}

export class BrowserController {
  private readonly engine: DiscoveryEngine
  private readonly actions: ActionEngine
  private readonly overlay: Overlay
  private graph: ElementGraph | null = null
  private vision = false
  private level: ScanLevel = 1
  private actionQueue: Promise<void> = Promise.resolve()
  private startQueue: Promise<void> = Promise.resolve()
  private syncTimer: ReturnType<typeof setTimeout> | null = null
  private resolver: DescriptorResolver | null = null

  constructor(private readonly view: WebContentsView) {
    this.engine = new DiscoveryEngine(view.webContents)
    this.overlay = new Overlay(this.engine.transport)
    this.actions = new ActionEngine(this.engine.transport, {
      getGraph: () => this.graph,
      resolveDescriptor: (descriptorId) => this.resolver?.(descriptorId) ?? null
    })
  }

  get transport(): Transport {
    return this.engine.transport
  }

  isVisionOn(): boolean {
    return this.vision
  }

  getLevel(): ScanLevel {
    return this.level
  }

  setLevel(level: ScanLevel): void {
    this.level = level
  }

  setDescriptorResolver(resolver: DescriptorResolver | null): void {
    this.resolver = resolver
  }

  attach(): void {
    void this.ready().catch(() => undefined)
  }

  start(): Promise<void> {
    return this.ready()
  }

  invalidate(): void {
    this.engine.invalidate()
  }

  dispose(): void {
    this.cancelSync()
    this.resolver = null
    this.graph = null
    this.actions.dispose()
    this.engine.dispose()
  }

  currentGraph(): ElementGraph | null {
    return this.graph
  }

  scan(level?: ScanLevel): Promise<PageState> {
    return this.enqueue(() => this.refresh(level ?? this.level, true))
  }

  setVision(on: boolean): Promise<PageState | null> {
    return this.enqueue(async () => {
      this.vision = on
      if (!on) {
        await this.overlay.clear(this.graph)
        return null
      }
      return this.refresh(this.level, true)
    })
  }

  execute(request: AgentAction): Promise<ActionReport> {
    return this.enqueue(() => this.perform(request))
  }

  dispatch(request: ActionRequest): Promise<ActionOutcome> {
    return this.enqueue(() => this.send(request))
  }

  scanGraph(
    level: ScanLevel,
    force: boolean,
    profile: ScanProfileName = 'agent'
  ): Promise<ElementGraph> {
    return this.enqueue(async () => {
      await this.ready()
      this.graph = await this.engine.scan({ level, force, profile })
      return this.graph
    })
  }

  canGoBack(): boolean {
    return this.view.webContents.navigationHistory.canGoBack()
  }

  canGoForward(): boolean {
    return this.view.webContents.navigationHistory.canGoForward()
  }

  isLoading(): boolean {
    return this.view.webContents.isLoading()
  }

  url(): string {
    return this.view.webContents.getURL()
  }

  title(): string {
    return this.view.webContents.getTitle()
  }

  back(): boolean {
    if (!this.canGoBack()) return false
    this.detachGraph()
    this.view.webContents.navigationHistory.goBack()
    return true
  }

  forward(): boolean {
    if (!this.canGoForward()) return false
    this.detachGraph()
    this.view.webContents.navigationHistory.goForward()
    return true
  }

  reload(): boolean {
    this.detachGraph()
    this.view.webContents.reload()
    return true
  }

  stop(): boolean {
    this.view.webContents.stop()
    return true
  }

  home(url: string): boolean {
    this.detachGraph()
    void this.view.webContents.loadURL(url).catch(() => undefined)
    return true
  }

  sync(): void {
    this.engine.invalidate()
    if (!this.vision) return
    this.cancelSync()
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null
      void this.enqueue(() => this.refresh(this.level, true)).catch(() => undefined)
    }, SYNC_DELAY)
  }

  private async send(request: ActionRequest): Promise<ActionOutcome> {
    await this.ready()

    const outcome = await this.actions.execute(request)
    if (request.kind === 'navigate') this.detachGraph()
    else this.engine.invalidate()

    return outcome
  }

  private async perform(request: AgentAction): Promise<ActionReport> {
    if (request.action === 'snapshot') {
      return {
        ok: true,
        result: 'Sayfa tarandı',
        page: await this.refresh(this.level, true),
        outcome: null
      }
    }

    await this.ready()

    const outcome = await this.actions.execute(this.toRequest(request))
    return this.report(request, outcome)
  }

  private async report(request: AgentAction, outcome: ActionOutcome): Promise<ActionReport> {
    if (request.action === 'go_to_url') this.detachGraph()
    else this.engine.invalidate()

    const page = await this.refresh(this.level, request.action === 'go_to_url')

    return {
      ok: outcome.ok,
      result: outcome.ok ? describe(request, outcome) : outcome.message,
      page,
      outcome
    }
  }

  private toRequest(request: AgentAction): ActionRequest {
    const target = {
      ordinal: typeof request.index === 'number' && request.index >= 0 ? request.index : undefined,
      descriptorId: request.descriptorId,
      force: request.force
    }

    switch (request.action) {
      case 'go_to_url':
        return { kind: 'navigate', url: request.url ?? '' }
      case 'click':
        return { kind: 'click', ...target }
      case 'double_click':
        return { kind: 'double-click', ...target }
      case 'right_click':
        return { kind: 'right-click', ...target }
      case 'mouse_move':
        return { kind: 'hover', ...target }
      case 'type':
        return { kind: 'type', text: request.text ?? '', ...target }
      case 'clear_type':
        return { kind: 'clear-type', text: request.text ?? '', ...target }
      case 'select_option':
        return { kind: 'select-option', optionValue: request.optionValue ?? '', ...target }
      case 'upload':
        return { kind: 'upload', files: request.files ?? [], ...target }
      case 'scroll':
        return { kind: 'scroll', deltaY: request.deltaY ?? 0, ...target }
      case 'press_key':
        return { kind: 'press-key', key: request.key ?? '', ...target }
      case 'wait':
        return { kind: 'wait' }
      case 'refresh':
        return { kind: 'refresh' }
      default:
        return { kind: 'wait' }
    }
  }

  private ready(): Promise<void> {
    const task = (): Promise<void> => this.actions.start()
    const next = this.startQueue.then(task, task)
    this.startQueue = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }

  private detachGraph(): void {
    this.cancelSync()
    this.graph = null
    this.engine.reset()
  }

  private cancelSync(): void {
    if (!this.syncTimer) return
    clearTimeout(this.syncTimer)
    this.syncTimer = null
  }

  private async refresh(level: ScanLevel, force: boolean): Promise<PageState> {
    this.graph = await this.engine.scan({ level, force })
    if (this.vision) await this.overlay.draw(this.graph)
    return this.graph.toPageState()
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.actionQueue.then(task, task)
    this.actionQueue = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }
}

function describe(request: AgentAction, outcome: ActionOutcome): string {
  const label = outcome.target ? '[' + outcome.target.ordinal + '] ' + outcome.target.tag : ''
  const detail = label ? ': ' + label : ''

  switch (request.action) {
    case 'go_to_url':
      return 'Açılan sayfa: ' + (outcome.navigation?.url || request.url || '')
    case 'scroll':
      return 'Kaydırıldı: ' + (request.deltaY ?? 0) + 'px'
    case 'press_key':
      return (request.key ?? '') + ' tuşuna basıldı'
    case 'type':
    case 'clear_type':
      return outcome.message + detail + ' "' + (request.text ?? '') + '"'
    default:
      return outcome.message + detail
  }
}
