import { randomUUID } from 'node:crypto'
import type { ApiClient } from './ApiClient'
import { EMPTY_CHAT } from './agent-types'
import type {
  AgentActivity,
  AgentChatState,
  AgentLogEntry,
  AgentLogLevel,
  AgentMessageDto,
  AgentSessionDto,
  ChatSummary,
  ChatTurn,
  ToolAction
} from './agent-types'
import type { ChatFrame } from './types'

const TURN_TIMEOUT_MS = 600_000
const CANCELLED = '\u0000cancelled'

export interface AgentHubOptions {
  client: ApiClient
  onChange: (state: AgentChatState) => void
  onLog: (entry: AgentLogEntry) => void
}

interface PendingTurn {
  replyId: string
  settle: (failure: string) => void
  timer: ReturnType<typeof setTimeout>
}

export class AgentHub {
  private state: AgentChatState = { ...EMPTY_CHAT, turns: [] }
  private readonly pending = new Map<string, PendingTurn>()
  private orgId = ''
  private deviceId: string | null = null

  constructor(private readonly options: AgentHubOptions) {}

  snapshot(): AgentChatState {
    return {
      ...this.state,
      tiers: (this.state.tiers ?? []).map((tier) => ({ ...tier })),
      turns: this.state.turns.map((turn) => ({
        ...turn,
        actions: turn.actions.map((action) => ({ ...action }))
      }))
    }
  }

  note(activity: AgentActivity): void {
    const target = this.state.turns.find((item) => item.pending)
    if (!target) return

    if (activity.kind === 'invocation') {
      const action: ToolAction = {
        callId: activity.callId,
        toolName: activity.toolName,
        state: 'running',
        detail: '',
        at: Date.now()
      }
      target.actions.push(action)
      this.publish()
      return
    }

    const entry = target.actions.find((item) => item.callId === activity.callId)
    if (!entry) return

    if (activity.kind === 'approval') {
      entry.state = activity.ok ? 'running' : 'rejected'
      entry.detail = activity.detail
    } else if (activity.kind === 'result') {
      entry.state = activity.ok ? 'ok' : 'failed'
      entry.detail = activity.detail
    }
    this.publish()
  }

  bind(orgId: string, deviceId: string | null): void {
    this.orgId = orgId
    this.deviceId = deviceId
    if (!this.state.model) void this.loadModel()
  }

  reset(): void {
    this.stop()
    this.state = { ...EMPTY_CHAT, turns: [] }
    this.publish()
  }

  stop(): void {
    for (const turn of [...this.pending.values()]) {
      turn.settle(CANCELLED)
    }
    this.pending.clear()
  }

  async cancel(): Promise<boolean> {
    const sessionId = this.state.sessionId
    this.stop()
    this.finishPending('Üretim durduruldu', true)
    if (!sessionId) return false
    return this.options.client.cancelAgentSession(sessionId).catch(() => false)
  }

  async history(): Promise<ChatSummary[]> {
    if (!this.orgId) return []
    const page = await this.options.client.listAgentSessions(this.orgId)
    return page.content.map((item) => this.summary(item))
  }

  async open(sessionId: string): Promise<AgentChatState> {
    if (sessionId === this.state.sessionId) return this.snapshot()
    this.stop()

    const detail = await this.options.client.agentSession(sessionId)
    this.state = {
      sessionId: detail.session.id,
      title: detail.session.title,
      model: detail.session.model,
      tiers: this.state.tiers,
      turns: detail.messages.filter(visible).map(toTurn),
      busy: false,
      error: ''
    }
    this.publish()
    this.log('info', 'Sohbet acildi', [detail.session.title])
    return this.snapshot()
  }

  async discard(sessionId: string): Promise<ChatSummary[]> {
    await this.options.client.deleteAgentSession(sessionId).catch(() => undefined)
    if (sessionId === this.state.sessionId) {
      this.stop()
      this.state = { ...EMPTY_CHAT, turns: [] }
      this.publish()
    }
    this.log('info', 'Sohbet silindi')
    return this.history()
  }

  private summary(item: AgentSessionDto): ChatSummary {
    return {
      id: item.id,
      title: item.title || 'Adsiz sohbet',
      model: item.model,
      status: item.status,
      createdAt: Date.parse(item.createdAt) || Date.now(),
      active: item.id === this.state.sessionId
    }
  }

  async remove(): Promise<void> {
    const sessionId = this.state.sessionId
    this.stop()
    if (sessionId) await this.options.client.deleteAgentSession(sessionId).catch(() => undefined)
    this.state = { ...EMPTY_CHAT, turns: [] }
    this.publish()
  }

  async send(content: string): Promise<AgentChatState> {
    const text = content.trim()
    if (!text) return this.snapshot()
    if (this.state.busy) throw new Error('Onceki istek hala suruyor')

    this.state.turns.push(turn('user', text, false))
    const reply = turn('assistant', '', true)
    this.state.turns.push(reply)
    this.state.busy = true
    this.state.error = ''
    this.publish()
    this.log('info', 'Ajan istegi gonderildi', [text])

    await this.deliver(text, reply.id, true)
    return this.snapshot()
  }

  private async deliver(text: string, replyId: string, retry: boolean): Promise<void> {
    let sessionId = ''
    try {
      sessionId = await this.ensureSession(text)
    } catch (error) {
      this.fail(reason(error))
      return
    }

    const turnId = randomUUID()
    const settled = this.watch(turnId, replyId)

    try {
      const direct = await this.options.client.startAgentStream(
        sessionId,
        text,
        this.state.model,
        turnId
      )
      if (direct?.content) {
        this.release(turnId)
        this.state.model = direct.model || this.state.model
        this.applyAnswer(replyId, direct.content)
        this.log('info', 'Ajan yaniti tamamlandi')
        return
      }
    } catch (error) {
      this.release(turnId)
      if (stale(error) && retry) {
        this.forget()
        await this.deliver(text, replyId, false)
        return
      }
      this.log('warn', 'Akis baslatilamadi, tek seferlik yanit deneniyor', [reason(error)])
      await this.fallback(sessionId, text, replyId, retry)
      return
    }

    const failure = await settled
    if (!failure || failure === CANCELLED) return

    this.log('warn', 'Akis tamamlanmadi, tek seferlik yanit deneniyor', [failure])
    await this.fallback(sessionId, text, replyId, retry)
  }

  private async fallback(
    sessionId: string,
    text: string,
    replyId: string,
    retry: boolean
  ): Promise<void> {
    try {
      const answer = await this.options.client.sendAgentMessage(sessionId, text, this.state.model)
      this.state.model = answer.model || this.state.model
      this.applyAnswer(replyId, answer.content)
      this.log('info', 'Ajan yaniti tamamlandi')
    } catch (error) {
      if (stale(error) && retry) {
        this.forget()
        await this.deliver(text, replyId, false)
        return
      }
      this.fail(reason(error))
      await this.resync()
    }
  }

  private watch(turnId: string, replyId: string): Promise<string> {
    return new Promise<string>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(turnId)
        resolve('Yanit suresi asildi')
      }, TURN_TIMEOUT_MS)

      this.pending.set(turnId, {
        replyId,
        timer,
        settle: (failure: string) => {
          clearTimeout(timer)
          this.pending.delete(turnId)
          resolve(failure)
        }
      })
    })
  }

  private release(turnId: string): void {
    const turn = this.pending.get(turnId)
    if (!turn) return
    clearTimeout(turn.timer)
    this.pending.delete(turnId)
  }

  accept(frame: ChatFrame): void {
    const turn = this.pending.get(frame.turnId)
    if (!turn) return

    if (frame.kind === 'delta') {
      const target = this.state.turns.find((item) => item.id === turn.replyId)
      if (!target) return
      target.text += frame.text ?? ''
      this.publish()
      return
    }

    if (frame.kind === 'error') {
      const message = frame.text || 'Model yanit veremedi'
      turn.settle(message)
      return
    }

    if (frame.model) this.state.model = frame.model
    this.settle(turn.replyId)
    this.log('info', 'Ajan yaniti tamamlandi')
    turn.settle('')
  }

  private async ensureSession(text: string): Promise<string> {
    if (this.state.sessionId) return this.state.sessionId
    if (!this.orgId) throw new Error('Calisma alani bulunamadi, once baglanin')

    const title = text.length > 60 ? text.slice(0, 60) : text
    const session = await this.options.client.createAgentSession({
      orgId: this.orgId,
      deviceId: this.deviceId,
      title,
      mode: 'CHAT',
      model: this.state.model
    })

    this.state.sessionId = session.id
    this.state.title = session.title
    this.state.model = session.model
    this.log('info', 'Ajan oturumu acildi', ['model: ' + session.model])
    return session.id
  }

  private forget(): void {
    this.state.sessionId = ''
    this.state.title = ''
    this.log('warn', 'Sunucudaki oturum gecersiz, yenisi aciliyor')
  }

  private async loadModel(): Promise<void> {
    try {
      const info = await this.options.client.agentModels()
      this.state.tiers = Array.isArray(info.tiers) ? info.tiers : []
      if (!this.state.model && info.defaultModel) this.state.model = info.defaultModel
      this.publish()
    } catch {
      return
    }
  }

  selectModel(model: string): AgentChatState {
    if (!model || model === this.state.model) return this.snapshot()
    this.state.model = model
    this.publish()
    this.log('info', 'Model degistirildi', [model])
    return this.snapshot()
  }

  private async resync(): Promise<void> {
    if (!this.state.sessionId) return
    try {
      const detail = await this.options.client.agentSession(this.state.sessionId)
      this.state.title = detail.session.title
      this.state.model = detail.session.model
      this.state.turns = detail.messages.filter(visible).map(toTurn)
      this.publish()
    } catch {
      return
    }
  }

  private applyAnswer(replyId: string, content: string): void {
    const target = this.state.turns.find((item) => item.id === replyId)
    if (target) target.text = content
    this.settle(replyId)
  }

  private fail(message: string): void {
    this.state.error = message
    this.finishPending(message, true)
    this.log('error', 'Ajan istegi basarisiz', [message])
  }

  private settle(replyId: string): void {
    const target = this.state.turns.find((item) => item.id === replyId)
    if (target && target.pending) {
      target.pending = false
      target.failed = target.text.length === 0
      if (target.failed) target.text = 'Yanit alinamadi'
      abandon(target)
    }
    this.state.busy = false
    this.publish()
  }

  private finishPending(message: string, failed: boolean): void {
    for (const item of this.state.turns) {
      if (!item.pending) continue
      item.pending = false
      item.failed = failed && !item.text
      if (item.failed) item.text = message
      abandon(item)
    }
    this.state.busy = false
    this.publish()
  }

  private log(level: AgentLogLevel, text: string, detail: string[] = []): void {
    this.options.onLog({ at: Date.now(), level, text, detail })
  }

  private publish(): void {
    this.options.onChange(this.snapshot())
  }
}

function abandon(target: ChatTurn): void {
  for (const action of target.actions) {
    if (action.state !== 'running') continue
    action.state = 'failed'
    action.detail = action.detail || 'Sonuc alinamadi'
  }
}

function stale(error: unknown): boolean {
  const status = (error as { status?: unknown }).status
  return status === 400 || status === 404 || status === 422
}

const SOCKET_HINTS: Record<string, string> = {
  terminated: 'Sunucu yaniti tamamlamadan baglantiyi kapatti',
  'fetch failed': 'Sunucuya ulasilamadi',
  'other side closed': 'Sunucu baglantiyi kapatti'
}

function reason(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const hint = SOCKET_HINTS[error.message]
  if (!hint) return error.message
  const cause = (error as { cause?: unknown }).cause
  const detail = cause instanceof Error ? cause.message : ''
  return detail ? hint + ' (' + detail + ')' : hint
}

function visible(message: AgentMessageDto): boolean {
  return message.role === 'USER' || message.role === 'ASSISTANT'
}

function toTurn(message: AgentMessageDto): ChatTurn {
  return {
    id: message.id,
    role: message.role === 'USER' ? 'user' : 'assistant',
    text: message.content,
    pending: false,
    failed: false,
    at: Date.parse(message.createdAt) || Date.now(),
    actions: []
  }
}

function turn(role: ChatTurn['role'], text: string, pending: boolean): ChatTurn {
  return {
    id: randomUUID(),
    role,
    text,
    pending,
    failed: false,
    at: Date.now(),
    actions: []
  }
}
