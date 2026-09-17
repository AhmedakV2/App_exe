import { randomUUID } from 'node:crypto'
import type { ApiClient } from './ApiClient'
import { EMPTY_CHAT } from './agent-types'
import type {
  AgentChatState,
  AgentLogEntry,
  AgentLogLevel,
  AgentMessageDto,
  ChatTurn
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
    return { ...this.state, turns: this.state.turns.map((turn) => ({ ...turn })) }
  }

  bind(orgId: string, deviceId: string | null): void {
    this.orgId = orgId
    this.deviceId = deviceId
    if (!this.state.model) void this.loadModel()
  }

  private async loadModel(): Promise<void> {
    try {
      const info = await this.options.client.agentModels()
      if (this.state.model) return
      this.state.model = info.plannerModel
      this.publish()
    } catch {
      return
    }
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

    const sessionId = await this.ensureSession(text)

    this.state.turns.push(turn('user', text, false))
    const reply = turn('assistant', '', true)
    this.state.turns.push(reply)
    this.state.busy = true
    this.state.error = ''
    this.publish()

    this.log('info', 'Ajan istegi gonderildi', [text])

    try {
      await this.stream(sessionId, text, reply.id)
    } catch (streamError) {
      this.log('warn', 'Akis kurulamadi, tek seferlik yanit deneniyor', [reason(streamError)])
      try {
        const answer = await this.options.client.sendAgentMessage(sessionId, text)
        this.applyAnswer(reply.id, answer.content)
        this.state.model = answer.model || this.state.model
        this.log('info', 'Ajan yaniti tamamlandi')
      } catch (error) {
        const message = reason(error)
        this.state.error = message
        this.finishPending(message, true)
        this.log('error', 'Ajan istegi basarisiz', [message])
        await this.resync()
      }
    }

    return this.snapshot()
  }

  private applyAnswer(replyId: string, content: string): void {
    const target = this.state.turns.find((item) => item.id === replyId)
    if (target) target.text = content
    this.settle(replyId)
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

  private async ensureSession(text: string): Promise<string> {
    if (this.state.sessionId) return this.state.sessionId
    if (!this.orgId) throw new Error('Calisma alani bulunamadi, once baglanin')

    const title = text.length > 60 ? text.slice(0, 60) : text
    const session = await this.options.client.createAgentSession({
      orgId: this.orgId,
      deviceId: this.deviceId,
      title,
      mode: 'CHAT'
    })

    this.state.sessionId = session.id
    this.state.title = session.title
    this.state.model = session.model
    this.log('info', 'Ajan oturumu acildi', ['model: ' + session.model])
    return session.id
  }

  private async stream(sessionId: string, content: string, replyId: string): Promise<void> {
    const controller = new AbortController()
    this.abort = controller

    const response = await this.options.client.openAgentStream(sessionId, controller.signal)
    const pump = this.consume(response, replyId)

    await this.options.client.startAgentStream(sessionId, content)
    await pump
  }

  private async consume(response: Response, replyId: string): Promise<void> {
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
          if (event) this.apply(event, replyId)
          split = buffer.indexOf('\n\n')
        }
      }
    } catch (error) {
      if (!controllerAborted(error)) throw error
    } finally {
      reader.cancel().catch(() => undefined)
      this.abort = null
      this.settle(replyId)
    }
  }

  private apply(event: SseEvent, replyId: string): void {
    if (event.name === 'delta') {
      const target = this.state.turns.find((item) => item.id === replyId)
      if (!target) return
      target.text += event.data
      this.publish()
      return
    }

    if (event.name === 'done') {
      this.finishPending('', false)
      this.log('info', 'Ajan yaniti tamamlandi')
    }
  }

  private settle(replyId: string): void {
    const target = this.state.turns.find((item) => item.id === replyId)
    if (target && target.pending) {
      target.pending = false
      target.failed = target.text.length === 0
      if (target.failed) target.text = 'Yanit alinamadi'
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

function controllerAborted(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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
    at: Date.parse(message.createdAt) || Date.now()
  }
}

function turn(role: ChatTurn['role'], text: string, pending: boolean): ChatTurn {
  return { id: randomUUID(), role, text, pending, failed: false, at: Date.now() }
}
