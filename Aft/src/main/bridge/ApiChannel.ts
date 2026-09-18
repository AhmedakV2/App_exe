import { ipcMain, type WebContents } from 'electron'
import { hostname, platform, release } from 'node:os'
import { ApiClient } from '../api/ApiClient'
import { AuthStore } from '../api/AuthStore'
import { API_BASE_URL, ConfigStore } from '../api/config'
import { AgentHub } from '../api/AgentHub'
import type { AgentActivity, AgentChatState, AgentLogEntry } from '../api/agent-types'
import { mountAgent, unmountAgent, agentBridge } from '../api/mountAgent'
import type { PlaybackAccess, ToolInvocation } from '../api/types'
import type { BrowserController } from '../browser/BrowserController'
import type { Indexer } from '../data'
import type { DescriptorStore } from '../identity'
import type { ContextStore, ScenarioStore } from '../scenario'
import { guard } from './guard'
import type { AgentState, ApprovalRequest, LoginPayload, ProfilePayload } from './api-types'

const APPROVAL_EVENT = 'aft:api:approval'
const STATE_EVENT = 'aft:api:state-changed'
const CHAT_EVENT = 'aft:agent:chat'
const LOG_EVENT = 'aft:agent:log'
const HEARTBEAT_MS = 60_000

export interface ApiChannelOptions {
  userDataDir: string
  appVersion: string
  controller: BrowserController
  scenarios: ScenarioStore
  indexer: Indexer
  contexts: ContextStore
  descriptors: DescriptorStore
  playback?: PlaybackAccess | null
}

function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const detail = error as { status?: unknown; code?: unknown }
  const status = typeof detail.status === 'number' ? 'HTTP ' + detail.status : ''
  const code = typeof detail.code === 'string' && detail.code !== 'UNKNOWN' ? detail.code : ''
  const tag = [status, code].filter(Boolean).join(' · ')
  return tag ? tag + ' · ' + error.message : error.message
}

export class ApiChannel {
  private readonly config: ConfigStore
  private readonly auth: AuthStore
  private readonly client: ApiClient
  private readonly hub: AgentHub
  private readonly pendingApprovals = new Map<string, (approved: boolean) => void>()

  private viewer: WebContents | null = null
  private connected = false
  private device: AgentState['device'] = null
  private orgId = ''
  private heartbeat: ReturnType<typeof setInterval> | null = null
  private connecting: Promise<AgentState> | null = null
  private failure = ''

  constructor(private readonly options: ApiChannelOptions) {
    this.config = new ConfigStore(options.userDataDir)
    this.auth = new AuthStore(options.userDataDir)
    this.client = new ApiClient(this.config, this.auth)
    this.hub = new AgentHub({
      client: this.client,
      onChange: (chat) => this.viewer?.send(CHAT_EVENT, chat),
      onLog: (entry) => this.pushLog(entry)
    })
  }

  bindViewer(contents: WebContents): void {
    this.viewer = contents
  }

  async start(): Promise<void> {
    await this.auth.load()
    const settings = await this.config.read()
    this.orgId = settings.orgId
    if (this.auth.current()) void this.tryConnect()
  }

  register(): void {
    ipcMain.handle('aft:api:state', () => guard('durum', () => this.state()))

    ipcMain.handle('aft:api:login', (_event, input: unknown) =>
      guard('giris', async (): Promise<LoginPayload> => {
        const profile = await this.client.login(input as { username: string; password: string })
        void this.tryConnect()
        return { profile, state: this.state() }
      })
    )

    ipcMain.handle('aft:api:register', (_event, input: unknown) =>
      guard('kayit', async (): Promise<LoginPayload> => {
        const profile = await this.client.register(
          input as { username: string; email: string; password: string; displayName: string }
        )
        void this.tryConnect()
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
        this.hub.reset()
        await this.client.logout()
        await this.config.clear()
        this.orgId = ''
        this.device = null
        return this.publish()
      })
    )

    ipcMain.handle('aft:api:connect', () =>
      guard('baglanti', async (): Promise<AgentState> => {
        try {
          return await this.connect()
        } catch (error) {
          this.failure = describe(error)
          this.publish()
          throw error
        }
      })
    )

    ipcMain.handle('aft:api:disconnect', () =>
      guard('kopar', (): AgentState => {
        this.stopSession()
        return this.publish()
      })
    )

    ipcMain.handle('aft:agent:chat', () =>
      guard('ajan durumu', (): AgentChatState => this.hub.snapshot())
    )

    ipcMain.handle('aft:agent:send', (_event, input: unknown) =>
      guard('ajan mesaji', async (): Promise<AgentChatState> => {
        if (!this.connected) throw new Error('Ajan baglantisi yok')
        const payload = input as { content: string }
        return this.hub.send(payload.content)
      })
    )

    ipcMain.handle('aft:agent:cancel', () =>
      guard('ajan durdurma', (): Promise<boolean> => this.hub.cancel())
    )

    ipcMain.handle('aft:agent:reset', () =>
      guard('yeni sohbet', (): AgentChatState => {
        this.hub.reset()
        return this.hub.snapshot()
      })
    )

    ipcMain.handle('aft:agent:remove', () =>
      guard('sohbet silme', async (): Promise<AgentChatState> => {
        await this.hub.remove()
        return this.hub.snapshot()
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

  private async tryConnect(): Promise<void> {
    try {
      await this.connect()
    } catch (error) {
      this.failure = describe(error)
      this.pushLog({
        at: Date.now(),
        level: 'error',
        text: 'Ajan baglantisi kurulamadi',
        detail: [this.failure]
      })
      this.publish()
    }
  }

  private pushLog(entry: AgentLogEntry): void {
    this.viewer?.send(LOG_EVENT, entry)
  }

  private onActivity(activity: AgentActivity): void {
    this.hub.note(activity)
    this.pushLog({
      at: Date.now(),
      level: activity.ok ? 'tool' : 'error',
      text: activity.toolName + ' · ' + activity.kind,
      detail: activity.detail ? [activity.detail] : []
    })
  }

  private stopSession(): void {
    unmountAgent()
    this.hub.stop()
    this.connected = false
    this.connecting = null
    if (this.heartbeat) {
      clearInterval(this.heartbeat)
      this.heartbeat = null
    }
  }

  private connect(): Promise<AgentState> {
    if (this.connected) return Promise.resolve(this.state())
    if (this.connecting) return this.connecting

    this.connecting = this.establish().finally(() => {
      this.connecting = null
    })
    return this.connecting
  }

  private async establish(): Promise<AgentState> {
    const session = this.auth.current()
    if (!session) throw new Error('Once giris yapin')

    this.failure = ''
    unmountAgent()

    const provision = await this.client.provisionDevice(
      hostname(),
      platform() + ' ' + release(),
      this.options.appVersion
    )

    await this.config.write({ orgId: provision.orgId, deviceKey: provision.deviceKey })
    this.orgId = provision.orgId
    this.device = provision.device
    this.hub.bind(provision.orgId, provision.device.id)

    await mountAgent({
      endpoint: {
        baseUrl: API_BASE_URL,
        deviceId: provision.device.id,
        deviceKey: provision.deviceKey,
        ticket: () => this.client.wsTicket()
      },
      controller: this.options.controller,
      scenarios: this.options.scenarios,
      indexer: this.options.indexer,
      contexts: this.options.contexts,
      descriptors: this.options.descriptors,
      playback: this.options.playback ?? null,
      approve: (invocation) => this.askUser(invocation),
      onActivity: (activity) => this.onActivity(activity),
      onStateChange: (connected) => {
        this.connected = connected
        this.pushLog({
          at: Date.now(),
          level: connected ? 'info' : 'warn',
          text: connected ? 'Arac kanali acildi' : 'Arac kanali kapandi',
          detail: []
        })
        this.publish()
      }
    })

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
      error: this.connected ? '' : this.failure,
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
