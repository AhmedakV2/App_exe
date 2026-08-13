import type { WebContents } from 'electron'
import type { ActionOutcome, ActionRequest } from '../action'
import type { BrowserController } from '../browser/BrowserController'
import type { ElementGraph, ScanLevel } from '../discovery'
import type { PlaybackHost } from '../scenario'

export class PlaybackAdapter implements PlaybackHost {
  constructor(
    private readonly controller: BrowserController,
    private readonly contents: WebContents | null = null
  ) {}

  execute(request: ActionRequest): Promise<ActionOutcome> {
    return this.controller.dispatch(request)
  }

  scan(level: ScanLevel, force: boolean): Promise<ElementGraph> {
    return this.controller.scanGraph(level, force)
  }

  currentGraph(): ElementGraph | null {
    return this.controller.currentGraph()
  }

  async screenshot(): Promise<string> {
    if (!this.contents || this.contents.isDestroyed()) return ''

    const image = await this.contents.capturePage()
    return image.isEmpty() ? '' : image.toPNG().toString('base64')
  }
}
