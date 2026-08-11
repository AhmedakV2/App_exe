import { app } from 'electron'
import type { BrowserController } from '../browser/BrowserController'
import { IdentityChannel } from './IdentityChannel'

let channel: IdentityChannel | null = null

export async function mountIdentity(controller: BrowserController): Promise<IdentityChannel> {
  if (channel) return channel

  channel = new IdentityChannel({
    userDataDir: app.getPath('userData'),
    getGraph: () => controller.currentGraph()
  })

  await channel.start()
  channel.register()
  return channel
}

export function identityChannel(): IdentityChannel | null {
  return channel
}

export async function unmountIdentity(): Promise<void> {
  if (!channel) return
  await channel.dispose()
  channel = null
}
