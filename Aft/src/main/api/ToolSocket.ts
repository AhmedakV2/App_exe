import { ApiError, retryAfterMillis } from './ApiError'
import { decode, encode } from './stomp'
import type { AgentEndpoint, ToolInvocation, ToolResult } from './types'

const TOOL_QUEUE = '/user/queue/tools'
const RESULT_DESTINATION = '/app/tool-results'
const MAX_BACKOFF_MS = 30_000
const MAX_RETRY_AFTER_MS = 60_000

export interface ToolSocketOptions {
  endpoint: AgentEndpoint
  onInvocation: (invocation: ToolInvocation) => void
  onStateChange?: (connected: boolean) => void
}

export class ToolSocket {
  private socket: WebSocket | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private attempt = 0
  private closing = false
  private cooldownMs = 0

  constructor(private readonly options: ToolSocketOptions) {}

  connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN
  }

  async start(): Promise<void> {
    this.closing = false
    await this.open()
  }

  stop(): void {
    this.closing = true
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.socket?.close()
    this.socket = null
  }

  send(result: ToolResult): boolean {
    if (!this.connected()) return false
    this.socket?.send(
      encode(
        'SEND',
        { destination: RESULT_DESTINATION, 'content-type': 'application/json' },
        JSON.stringify(result)
      )
    )
    return true
  }

  private async open(): Promise<void> {
    const ticket = await this.fetchTicket()
    const url = this.options.endpoint.baseUrl.replace(/^http/, 'ws') + '/ws/agent'
    const socket = new WebSocket(url)
    this.socket = socket

    socket.onopen = () => {
      socket.send(
        encode('CONNECT', {
          'accept-version': '1.2',
          host: new URL(this.options.endpoint.baseUrl).host,
          'X-Aft-Ticket': ticket,
          'X-Aft-Device': this.options.endpoint.deviceId
        })
      )
    }

    socket.onmessage = (event) => this.onFrame(String(event.data))
    socket.onerror = () => socket.close()
    socket.onclose = () => {
      this.options.onStateChange?.(false)
      this.socket = null
      this.scheduleReconnect()
    }
  }

  private onFrame(raw: string): void {
    const frame = decode(raw)
    if (!frame) return

    if (frame.command === 'CONNECTED') {
      this.attempt = 0
      this.socket?.send(encode('SUBSCRIBE', { id: 'tools', destination: TOOL_QUEUE }))
      this.options.onStateChange?.(true)
      return
    }

    if (frame.command === 'MESSAGE' && frame.body) {
      this.options.onInvocation(JSON.parse(frame.body) as ToolInvocation)
    }
  }

  private scheduleReconnect(): void {
    if (this.closing || this.timer) return
    const backoff = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.attempt)
    const wait = Math.max(backoff, this.cooldownMs)
    this.cooldownMs = 0
    this.attempt += 1
    this.timer = setTimeout(() => {
      this.timer = null
      void this.open().catch(() => this.scheduleReconnect())
    }, wait)
  }

  private async fetchTicket(): Promise<string> {
    const response = await fetch(this.options.endpoint.baseUrl + '/api/v1/auth/ws-ticket', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + this.options.endpoint.accessToken }
    })
    if (!response.ok) {
      this.cooldownMs = retryAfterMillis(response, MAX_RETRY_AFTER_MS)
      throw new ApiError(
        response.status,
        response.status === 429 ? 'RATE_LIMIT_EXCEEDED' : 'WS_TICKET_FAILED',
        'WebSocket bileti alinamadi: ' + response.status,
        this.cooldownMs
      )
    }
    const payload = (await response.json()) as { ticket: string }
    return payload.ticket
  }
}
