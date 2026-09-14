import { app } from 'electron'
import type { ScenarioStore } from '../scenario'
import { DataChannel } from './DataChannel'

let channel: DataChannel | null = null

interface MountDataOptions {
  scenarios: ScenarioStore
}
export async function mountData(options: MountDataOptions): Promise<DataChannel> {
  if (channel) return channel
  const created = new DataChannel({
    userDataDir: app.getPath('userData'),
    scenarios: options.scenarios
  })
  await created.start()
  created.register()
  channel = created
  return created
}
export async function unmountData(): Promise<void> {
  if (!channel) return
  const active = channel
  channel = null
  await active.dispose()
}
