import { ApiError } from './ApiError'
import { decode, encode } from './stomp'
import type { AgentEndpoint, ToolInvocation, ToolResult } from './types'

const TOOL_QUEUE = '/user/queue/tools'
const RESULT_DESTINATION = '/app/tool-results'
const MAX_BACKOFF_MS = 30_000

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
    const socket = this.socket
    this.socket = null
    if (socket && socket.readyState !== WebSocket.CLOSED) socket.close()
  }

  send(result: ToolResult): boolean {
    if (!this.connected()) return false
    try {
      this.socket?.send(
        encode(
          'SEND',
          { destination: RESULT_DESTINATION, 'content-type': 'application/json' },
          JSON.stringify(result)
        )
      )
    } catch {
      return false
    }
    return true
  }

  private async open(): Promise<void> {
    const ticket = await this.fetchTicket()
    const url = this.options.endpoint.baseUrl.replace(/^http/, 'ws') + '/ws/agent'
    const socket = new WebSocket(url)
    this.socket = socket

    socket.onopen = () => {
      try {
        socket.send(
          encode('CONNECT', {
            'accept-version': '1.2',
            host: new URL(this.options.endpoint.baseUrl).host,
            'X-Aft-Ticket': ticket,
            'X-Aft-Device': this.options.endpoint.deviceId
          })
        )
      } catch {
        return
      }
    }

    const drop = (): void => {
      if (this.socket !== socket) return
      this.socket = null
      this.options.onStateChange?.(false)
      this.scheduleReconnect()
    }

    socket.onmessage = (event) => this.onFrame(String(event.data))
    socket.onerror = drop
    socket.onclose = drop
  }

  private onFrame(raw: string): void {
    const frame = decode(raw)
    if (!frame) return

    if (frame.command === 'CONNECTED') {
      this.attempt = 0
      if (this.connected()) {
        this.socket?.send(encode('SUBSCRIBE', { id: 'tools', destination: TOOL_QUEUE }))
        this.options.onStateChange?.(true)
      }
      return
    }

    if (frame.command !== 'MESSAGE' || !frame.body) return

    try {
      this.options.onInvocation(JSON.parse(frame.body) as ToolInvocation)
    } catch {
      return
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
    try {
      return await this.options.endpoint.ticket()
    } catch (error) {
      if (error instanceof ApiError && error.retryAfterMs > 0) this.cooldownMs = error.retryAfterMs
      throw error
    }
  }
}
