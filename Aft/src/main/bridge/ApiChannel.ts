import { ipcMain, type WebContents } from 'electron'
import { hostname, platform, release } from 'node:os'
import { ApiClient } from '../api/ApiClient'
import { AuthStore } from '../api/AuthStore'
import { ConfigStore } from '../api/config'
import { mountAgent, unmountAgent, agentBridge } from '../api/mountAgent'
import type { ToolInvocation } from '../api/types'
import type { BrowserController } from '../browser/BrowserController'
import type { Indexer } from '../data'
import type { DescriptorStore } from '../identity'
import type { ContextStore, ScenarioStore } from '../scenario'
import { guard } from './guard'
import type { AgentState, ApprovalRequest, ConfigPayload, LoginPayload } from './api-types'

const APPROVAL_EVENT = 'aft:api:approval'
const STATE_EVENT = 'aft:api:state-changed'

export interface ApiChannelOptions {
  userDataDir: string
  appVersion: string
  controller: BrowserController
  scenarios: ScenarioStore
  indexer: Indexer
  contexts: ContextStore
  descriptors: DescriptorStore
}

export class ApiChannel {
  private readonly config: ConfigStore
  private readonly auth: AuthStore
  private readonly client: ApiClient
  private readonly pendingApprovals = new Map<string, (approved: boolean) => void>()

  private viewer: WebContents | null = null
  private connected = false
  private device: AgentState['device'] = null

  constructor(private readonly options: ApiChannelOptions) {
    this.config = new ConfigStore(options.userDataDir)
    this.auth = new AuthStore(options.userDataDir)
    this.client = new ApiClient(this.config, this.auth)
  }

  bindViewer(contents: WebContents): void {
    this.viewer = contents
  }

  async start(): Promise<void> {
    await this.auth.load()
    const settings = await this.config.read()
    if (settings.autoConnect && this.auth.current()) {
      await this.connect().catch(() => undefined)
    }
  }

  register(): void {
    ipcMain.handle('aft:api:state', () => guard('durum', () => this.state()))

    ipcMain.handle('aft:api:config', () =>
      guard('ayar', async (): Promise<ConfigPayload> => ({ config: await this.config.read() }))
    )

    ipcMain.handle('aft:api:save-config', (_event, patch: unknown) =>
      guard('ayar kaydi', async (): Promise<ConfigPayload> => ({
        config: await this.config.write((patch ?? {}) as Record<string, never>)
      }))
    )

    ipcMain.handle('aft:api:login', (_event, input: unknown) =>
      guard('giris', async (): Promise<LoginPayload> => {
        const profile = await this.client.login(input as { email: string; password: string })
        return { profile, state: this.state() }
      })
    )

    ipcMain.handle('aft:api:register', (_event, input: unknown) =>
      guard('kayit', async (): Promise<LoginPayload> => {
        const profile = await this.client.register(
          input as { email: string; password: string; displayName: string }
        )
        return { profile, state: this.state() }
      })
    )

    ipcMain.handle('aft:api:logout', () =>
      guard('cikis', async (): Promise<AgentState> => {
        unmountAgent()
        this.connected = false
        await this.client.logout()
        return this.publish()
      })
    )

    ipcMain.handle('aft:api:connect', () => guard('baglanti', () => this.connect()))

    ipcMain.handle('aft:api:disconnect', () =>
      guard('kopar', (): AgentState => {
        unmountAgent()
        this.connected = false
        return this.publish()
      })
    )

    ipcMain.handle('aft:api:approve', (_event, input: unknown) =>
      guard('onay', () => {
        const decision = input as { callId: string; approved: boolean }
        const resolve = this.pendingApprovals.get(decision.callId)
        if (!resolve) return false
        this.pendingApprovals.delete(decision.callId)
        resolve(decision.approved === true)
        return true
      })
    )
  }

  async dispose(): Promise<void> {
    unmountAgent()
    this.connected = false
    this.pendingApprovals.forEach((resolve) => resolve(false))
    this.pendingApprovals.clear()
  }

  private async connect(): Promise<AgentState> {
    const session = this.auth.current()
    if (!session) throw new Error('Once giris yapin')

    const settings = await this.config.read()
    if (!settings.deviceKey) throw new Error('Cihaz anahtari tanimli degil')

    this.device = await this.client.registerDevice(
      hostname(),
      platform() + ' ' + release(),
      this.options.appVersion
    )

    await mountAgent({
      endpoint: {
        baseUrl: settings.baseUrl,
        deviceId: this.device.id,
        accessToken: session.accessToken,
        deviceKey: settings.deviceKey
      },
      controller: this.options.controller,
      scenarios: this.options.scenarios,
      indexer: this.options.indexer,
      contexts: this.options.contexts,
      descriptors: this.options.descriptors,
      approve: (invocation) => this.askUser(invocation),
      onStateChange: (connected) => {
        this.connected = connected
        this.publish()
      }
    })

    this.connected = true
    return this.publish()
  }

  private askUser(invocation: ToolInvocation): Promise<boolean> {
    if (!this.viewer) return Promise.resolve(false)

    const request: ApprovalRequest = {
      callId: invocation.callId,
      toolName: invocation.toolName,
      summary: invocation.argumentsJson
    }

    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingApprovals.delete(invocation.callId)
        resolve(false)
      }, invocation.timeoutMs)

      this.pendingApprovals.set(invocation.callId, (approved) => {
        clearTimeout(timer)
        resolve(approved)
      })
      this.viewer?.send(APPROVAL_EVENT, request)
    })
  }

  private state(): AgentState {
    return {
      session: this.auth.state(),
      connected: this.connected,
      device: this.device,
      capabilities: agentBridge()?.capabilities ?? []
    }
  }

  private publish(): AgentState {
    const next = this.state()
    this.viewer?.send(STATE_EVENT, next)
    return next
  }
}
