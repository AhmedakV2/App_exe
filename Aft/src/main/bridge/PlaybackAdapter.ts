import type { WebContents } from 'electron'
import type { ActionOutcome, ActionRequest } from '../action'
import type { BrowserController } from '../browser/BrowserController'
import type { ElementGraph, ScanLevel, ScanProfileName } from '../discovery'
import type { PlaybackHost } from '../scenario'

export class PlaybackAdapter implements PlaybackHost {
  constructor(
    private readonly controller: BrowserController,
    private readonly contents: WebContents | null = null
  ) {}

  prepare(): Promise<void> {
    return this.controller.start()
  }

  execute(request: ActionRequest): Promise<ActionOutcome> {
    return this.controller.dispatch(request)
  }

  scan(
    level: ScanLevel,
    force: boolean,
    profile: ScanProfileName = 'playback'
  ): Promise<ElementGraph> {
    return this.controller.scanGraph(level, force, profile)
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
