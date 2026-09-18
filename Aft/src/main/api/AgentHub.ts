import { randomUUID } from 'node:crypto'
import type { ApiClient } from './ApiClient'
import { EMPTY_CHAT } from './agent-types'
import type {
  AgentActivity,
  AgentSessionDto,
  ChatSummary,
  AgentChatState,
  AgentLogEntry,
  AgentLogLevel,
  AgentMessageDto,
  ChatTurn,
  ToolAction
} from './agent-types'

export interface AgentHubOptions {
  client: ApiClient
  onChange: (state: AgentChatState) => void
  onLog: (entry: AgentLogEntry) => void
}

interface SseEvent {
  name: string
  data: string
}

class StreamOpenError extends Error {
  constructor(readonly source: unknown) {
    super(reason(source))
    this.name = 'StreamOpenError'
  }
}

class StreamClosedBeforeDoneError extends Error {
  constructor() {
    super('stream-closed-before-done')
    this.name = 'StreamClosedBeforeDoneError'
  }
}

function deltaText(data: string): string {
  try {
    const parsed: unknown = JSON.parse(data)
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as { text?: unknown }).text === 'string'
    ) {
      return (parsed as { text: string }).text
    }
  } catch {
    return data
  }
  return data
}

function parseBlock(block: string): SseEvent | null {
  let name = 'message'
  const lines: string[] = []

  for (const raw of block.split('\n')) {
    if (raw.startsWith('event:')) {
      name = raw.slice(6).trim()
      continue
    }
    if (!raw.startsWith('data:')) continue
    const value = raw.slice(5)
    lines.push(value.startsWith(' ') ? value.slice(1) : value)
  }

  if (!lines.length && name === 'message') return null
  return { name, data: lines.join('\n') }
}

export class AgentHub {
  private state: AgentChatState = { ...EMPTY_CHAT, turns: [] }
  private abort: AbortController | null = null
  private orgId = ''
  private deviceId: string | null = null

  constructor(private readonly options: AgentHubOptions) {}

  snapshot(): AgentChatState {
    return {
      ...this.state,
      tiers: this.state.tiers.map((tier) => ({ ...tier })),
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
    if (!this.abort) return
    this.abort.abort()
    this.abort = null
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

    try {
      await this.stream(sessionId, text, replyId)
      return
    } catch (error) {
      if (aborted(error)) return
      if (stale(error) && retry) {
        this.forget()
        await this.deliver(text, replyId, false)
        return
      }
      if (error instanceof StreamClosedBeforeDoneError) {
        this.log('warn', 'Akis done olmadan kapandi, tek seferlik yanit deneniyor')
      } else if (!(error instanceof StreamOpenError)) {
        this.fail(reason(error))
        await this.resync()
        return
      }
      this.log('warn', 'Akis kurulamadi, tek seferlik yanit deneniyor', [reason(error)])
    }

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

  private async stream(sessionId: string, content: string, replyId: string): Promise<void> {
    const controller = new AbortController()
    this.abort = controller

    let response: Response
    try {
      response = await this.options.client.openAgentStream(sessionId, controller.signal)
    } catch (error) {
      if (this.abort === controller) this.abort = null
      throw aborted(error) ? error : new StreamOpenError(error)
    }

    let doneReceived = false
    let failure: unknown = null
    const pump = this.consume(response, controller, replyId, () => {
      doneReceived = true
    }).catch((error: unknown) => {
      failure = error
    })

    try {
      const fallback = await this.options.client.startAgentStream(
        sessionId,
        content,
        this.state.model
      )
      if (fallback?.content) {
        controller.abort()
        await pump
        this.state.model = fallback.model || this.state.model
        this.applyAnswer(replyId, fallback.content)
        this.log('info', 'Ajan yaniti tamamlandi')
        return
      }
    } catch (error) {
      controller.abort()
      await pump
      throw error
    }

    await pump
    if (failure) throw failure
    if (!doneReceived) throw new StreamClosedBeforeDoneError()
  }

  private async consume(
    response: Response,
    controller: AbortController,
    replyId: string,
    onDone: () => void
  ): Promise<void> {
    const reader = (response.body as ReadableStream<Uint8Array>).getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) break
        buffer += decoder.decode(chunk.value, { stream: true })

        let split = buffer.indexOf('\n\n')
        while (split >= 0) {
          const event = parseBlock(buffer.slice(0, split))
          buffer = buffer.slice(split + 2)
          if (event) this.apply(event, replyId, onDone)
          split = buffer.indexOf('\n\n')
        }
      }
    } catch (error) {
      if (!aborted(error)) throw error
    } finally {
      reader.cancel().catch(() => undefined)
      if (this.abort === controller) this.abort = null
    }
  }

  private apply(event: SseEvent, replyId: string, onDone: () => void): void {
    if (event.name === 'delta') {
      const target = this.state.turns.find((item) => item.id === replyId)
      if (!target) return
      target.text += deltaText(event.data)
      this.publish()
      return
    }

    if (event.name === 'error') {
      const message = event.data || 'Model yanit veremedi'
      this.state.error = message
      this.finishPending(message, true)
      this.log('error', 'Ajan yaniti basarisiz', [message])
      return
    }

    if (event.name === 'done') {
      onDone()
      this.finishPending('', false)
      this.log('info', 'Ajan yaniti tamamlandi')
    }
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
      this.state.tiers = info.tiers
      if (!this.state.model) this.state.model = info.defaultModel
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

function aborted(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
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
