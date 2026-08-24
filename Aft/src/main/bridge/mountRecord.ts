import type { WebContents } from 'electron'
import type { BrowserController } from '../browser/BrowserController'
import type { DescriptorStore, IdentityService } from '../identity'
import type { RecordOptions } from '../record'
import type { ScenarioStore } from '../scenario'
import { RecordAdapter } from './RecordAdapter'
import { RecordChannel } from './RecordChannel'

export interface MountRecordOptions {
  identity: IdentityService
  descriptors: DescriptorStore
  scenarios: ScenarioStore
  target: WebContents | null
  renderer: WebContents | null
  options?: Partial<RecordOptions>
}

let channel: RecordChannel | null = null

export function mountRecord(
  controller: BrowserController,
  config: MountRecordOptions
): RecordChannel {
  if (channel) return channel

  const created = new RecordChannel({
    host: new RecordAdapter(controller, config.target),
    identity: config.identity,
    descriptors: config.descriptors,
    scenarios: config.scenarios,
    options: config.options,
    notify: (name, payload) => {
      const renderer = config.renderer
      if (!renderer || renderer.isDestroyed()) return
      renderer.send(name, payload)
    }
  })

  created.register()
  channel = created
  return created
}

export function recordChannel(): RecordChannel | null {
  return channel
}

export async function unmountRecord(): Promise<void> {
  if (!channel) return

  const active = channel
  channel = null
  await active.dispose()
}
