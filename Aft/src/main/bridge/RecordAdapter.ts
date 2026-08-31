import type { WebContents } from 'electron'
import type { BrowserController } from '../browser/BrowserController'
import { InteractionWatcher } from '../browser/InteractionWatcher'
import type { ElementGraph, ScanLevel, ScanProfileName } from '../discovery'
import type { HighlightMark, RawInteraction, RawSink, RecordHost } from '../record'

export class RecordAdapter implements RecordHost {
  private readonly watcher: InteractionWatcher
  private offNavigate: (() => void) | null = null
  private sink: RawSink | null = null
  private navSeq = 0

  constructor(
    private readonly controller: BrowserController,
    private readonly contents: WebContents | null = null
  ) {
    this.watcher = new InteractionWatcher(controller.transport)
  }

  prepare(): Promise<void> {
    return this.controller.start()
  }

  scan(
    level: ScanLevel,
    force: boolean,
    profile: ScanProfileName = 'record'
  ): Promise<ElementGraph> {
    return this.controller.scanGraph(level, force, profile)
  }

  currentGraph(): ElementGraph | null {
    return this.controller.currentGraph()
  }

  url(): string {
    return this.controller.url()
  }

  title(): string {
    return this.controller.title()
  }

  async watch(sink: RawSink): Promise<void> {
    this.sink = sink
    this.bindNavigation()
    await this.watcher.start(sink)
  }

  async unwatch(): Promise<void> {
    this.offNavigate?.()
    this.offNavigate = null
    this.sink = null
    await this.watcher.stop()
  }

  highlight(mark: HighlightMark): Promise<void> {
    return this.watcher.mark(mark)
  }

  clearHighlight(): Promise<void> {
    return this.watcher.clearMarks()
  }

  private bindNavigation(): void {
    const contents = this.contents
    if (!contents || contents.isDestroyed() || this.offNavigate) return

    const handler = (_event: unknown, url: string): void => {
      if (!this.sink) return
      this.sink([this.navigation(url)])
    }

    contents.on('did-navigate', handler)
    this.offNavigate = (): void => {
      if (!contents.isDestroyed()) contents.removeListener('did-navigate', handler)
    }
  }

  private navigation(url: string): RawInteraction {
    this.navSeq += 1
    return {
      seq: this.navSeq,
      kind: 'navigate',
      at: Date.now(),
      url,
      sessionId: '',
      frameId: '',
      backendNodeId: 0,
      element: null,
      text: '',
      key: '',
      optionValue: '',
      optionLabel: '',
      files: [],
      deltaY: 0,
      scrollY: 0,
      detail: 0
    }
  }
}
