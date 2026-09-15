import { app, type WebContents } from 'electron'
import { ApiChannel, type ApiChannelOptions } from './ApiChannel'

let channel: ApiChannel | null = null

export type MountApiOptions = Omit<ApiChannelOptions, 'userDataDir' | 'appVersion'>

export async function mountApi(options: MountApiOptions): Promise<ApiChannel> {
  if (channel) return channel

  const created = new ApiChannel({
    ...options,
    userDataDir: app.getPath('userData'),
    appVersion: app.getVersion()
  })

  created.register()
  await created.start()

  channel = created
  return created
}

export function bindApiViewer(contents: WebContents): void {
  channel?.bindViewer(contents)
}

export async function unmountApi(): Promise<void> {
  if (!channel) return
  const active = channel
  channel = null
  await active.dispose()
}
