import { app } from 'electron'
import type { WebContents } from 'electron'
import type { BrowserController } from '../browser/BrowserController'
import type { DescriptorStore, IdentityService } from '../identity'
import type { PlaybackOptions } from '../scenario'
import { PlaybackAdapter } from './PlaybackAdapter'
import { PlaybackChannel } from './PlaybackChannel'

export interface MountPlaybackOptions {
  identity: IdentityService
  descriptors: DescriptorStore
  target: WebContents | null
  renderer: WebContents | null
  options?: Partial<PlaybackOptions>
}

let channel: PlaybackChannel | null = null

export async function mountPlayback(
  controller: BrowserController,
  config: MountPlaybackOptions
): Promise<PlaybackChannel> {
  if (channel) return channel

  const created = new PlaybackChannel({
    userDataDir: app.getPath('userData'),
    host: new PlaybackAdapter(controller, config.target),
    identity: config.identity,
    descriptors: config.descriptors,
    options: config.options,
    notify: (name, payload) => {
      const renderer = config.renderer
      if (!renderer || renderer.isDestroyed()) return
      renderer.send(name, payload)
    }
  })

  await created.start()
  created.register()

  channel = created
  return created
}

export function playbackChannel(): PlaybackChannel | null {
  return channel
}

export async function unmountPlayback(): Promise<void> {
  if (!channel) return

  const active = channel
  channel = null
  await active.dispose()
}
