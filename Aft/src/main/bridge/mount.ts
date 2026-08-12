import { app } from 'electron'
import type { BrowserController } from '../browser/BrowserController'
import { IdentityChannel } from './IdentityChannel'

let channel: IdentityChannel | null = null

let bound: BrowserController | null = null

export async function mountIdentity(controller: BrowserController): Promise<IdentityChannel> {
  if (channel) return channel

  const created = new IdentityChannel({
    userDataDir: app.getPath('userData'),
    getGraph: () => controller.currentGraph()
  })

  await created.start()
  created.register()
  controller.setDescriptorResolver((descriptorId) => created.lookup(descriptorId))

  channel = created
  bound = controller
  return created
}

export function identityChannel(): IdentityChannel | null {
  return channel
}

export async function unmountIdentity(): Promise<void> {
  if (!channel) return
  bound?.setDescriptorResolver(null)
  bound = null

  const active = channel
  channel = null
  await active.dispose()
}
