import { ipcMain, type WebContents } from 'electron'
import { hostname, platform, release } from 'node:os'
import { ApiClient } from '../api/ApiClient'
import { AuthStore } from '../api/AuthStore'
import { API_BASE_URL, ConfigStore } from '../api/config'
import { mountAgent, unmountAgent, agentBridge } from '../api/mountAgent'
import type { ToolInvocation } from '../api/types'
import type { BrowserController } from '../browser/BrowserController'
import type { Indexer } from '../data'
import type { DescriptorStore } from '../identity'
import type { ContextStore, ScenarioStore } from '../scenario'
import { guard } from './guard'
import type { AgentState, ApprovalRequest, LoginPayload, ProfilePayload } from './api-types'

const APPROVAL_EVENT = 'aft:api:approval'
const STATE_EVENT = 'aft:api:state-changed'
const HEARTBEAT_MS = 60_000

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
  private orgId = ''
  private heartbeat: ReturnType<typeof setInterval> | null = null

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
    this.orgId = settings.orgId
    if (this.auth.current()) await this.connect().catch(() => undefined)
  }

  register(): void {
    ipcMain.handle('aft:api:state', () => guard('durum', () => this.state()))

    ipcMain.handle('aft:api:login', (_event, input: unknown) =>
      guard('giris', async (): Promise<LoginPayload> => {
        const profile = await this.client.login(input as { email: string; password: string })
        await this.connect().catch(() => undefined)
        return { profile, state: this.state() }
      })
    )

    ipcMain.handle('aft:api:register', (_event, input: unknown) =>
      guard('kayit', async (): Promise<LoginPayload> => {
        const profile = await this.client.register(
          input as { email: string; password: string; displayName: string }
        )
        await this.connect().catch(() => undefined)
        return { profile, state: this.state() }
      })
    )

    ipcMain.handle('aft:api:profile', () =>
      guard('profil', async (): Promise<ProfilePayload> => ({ profile: await this.client.me() }))
    )

    ipcMain.handle('aft:api:change-password', (_event, input: unknown) =>
      guard('parola', async (): Promise<boolean> => {
        const change = input as { currentPassword: string; newPassword: string }
        await this.client.changePassword(change.currentPassword, change.newPassword)
        return true
      })
    )

    ipcMain.handle('aft:api:logout', () =>
      guard('cikis', async (): Promise<AgentState> => {
        this.stopSession()
        await this.client.logout()
        await this.config.clear()
        this.orgId = ''
        this.device = null
        return this.publish()
      })
    )

    ipcMain.handle('aft:api:connect', () => guard('baglanti', () => this.connect()))

    ipcMain.handle('aft:api:disconnect', () =>
      guard('kopar', (): AgentState => {
        this.stopSession()
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
    this.stopSession()
    this.pendingApprovals.forEach((resolve) => resolve(false))
    this.pendingApprovals.clear()
  }

  private stopSession(): void {
    unmountAgent()
    this.connected = false
    if (this.heartbeat) {
      clearInterval(this.heartbeat)
      this.heartbeat = null
    }
  }

  private async connect(): Promise<AgentState> {
    const session = this.auth.current()
    if (!session) throw new Error('Once giris yapin')
    if (this.connected) return this.state()

    const provision = await this.client.provisionDevice(
      hostname(),
      platform() + ' ' + release(),
      this.options.appVersion
    )

    await this.config.write({ orgId: provision.orgId, deviceKey: provision.deviceKey })
    this.orgId = provision.orgId
    this.device = provision.device

    await mountAgent({
      endpoint: {
        baseUrl: API_BASE_URL,
        deviceId: provision.device.id,
        accessToken: session.accessToken,
        deviceKey: provision.deviceKey
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
    this.startHeartbeat()
    return this.publish()
  }

  private startHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.heartbeat = setInterval(() => {
      const deviceId = this.device?.id
      if (!deviceId) return
      void this.client.heartbeat(deviceId).catch(() => undefined)
    }, HEARTBEAT_MS)
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
      orgId: this.orgId,
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
