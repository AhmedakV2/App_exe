import type { WebContents } from 'electron'

export class ProtocolError extends Error {
  constructor(
    readonly method: string,
    readonly sessionId: string,
    message: string
  ) {
    super(method + (sessionId ? '@' + sessionId : '') + ': ' + message)
    this.name = 'ProtocolError'
  }
}

export type EventHandler = (params: Record<string, unknown>, sessionId: string) => void

export const COMMAND_TIMEOUT_MS = 15000

export interface ProtocolStats {
  total: number
  byMethod: Record<string, number>
}

export class Transport {
  private readonly handlers = new Map<string, Set<EventHandler>>()
  private readonly parents = new Map<string, string>()
  private readonly counts = new Map<string, number>()
  private readonly order: string[] = ['']
  private calls = 0
  private ready = false

  constructor(
    private readonly wc: WebContents,
    private readonly timeoutMs: number = COMMAND_TIMEOUT_MS
  ) {}

  get sessions(): string[] {
    return this.order.slice()
  }

  parentOf(sessionId: string): string {
    return this.parents.get(sessionId) ?? ''
  }

  async start(): Promise<void> {
    if (this.ready) return
    const dbg = this.wc.debugger
    if (!dbg.isAttached()) dbg.attach('1.3')

    dbg.on('message', (_event, method, params, sessionId) => {
      this.emit(method, (params ?? {}) as Record<string, unknown>, sessionId ?? '')
    })

    this.on('Target.attachedToTarget', (params, parentSessionId) => {
      const sid = String(params.sessionId ?? '')
      if (!sid) return
      if (!this.order.includes(sid)) this.order.push(sid)
      this.parents.set(sid, parentSessionId)
      void this.autoAttach(sid)
      void this.trySend('Runtime.runIfWaitingForDebugger', {}, sid)
    })

    this.on('Target.detachedFromTarget', (params) => {
      const sid = String(params.sessionId ?? '')
      const at = this.order.indexOf(sid)
      if (at > 0) this.order.splice(at, 1)
      this.parents.delete(sid)
    })

    this.ready = true
    await this.autoAttach('')
  }

  on(method: string, fn: EventHandler): () => void {
    const set = this.handlers.get(method) ?? new Set<EventHandler>()
    set.add(fn)
    this.handlers.set(method, set)
    return (): void => {
      set.delete(fn)
    }
  }

  get callCount(): number {
    return this.calls
  }

  stats(): ProtocolStats {
    return { total: this.calls, byMethod: Object.fromEntries(this.counts) }
  }

  resetStats(): void {
    this.calls = 0
    this.counts.clear()
  }

  async send<T>(method: string, params: object = {}, sessionId = ''): Promise<T> {
    this.calls++
    this.counts.set(method, (this.counts.get(method) ?? 0) + 1)

    try {
      const command = sessionId
        ? this.wc.debugger.sendCommand(method, params, sessionId)
        : this.wc.debugger.sendCommand(method, params)
      return (await this.deadline(command, method, sessionId)) as T
    } catch (e) {
      if (e instanceof ProtocolError) throw e
      throw new ProtocolError(method, sessionId, e instanceof Error ? e.message : String(e))
    }
  }

  private deadline(command: Promise<unknown>, method: string, sessionId: string): Promise<unknown> {
    if (this.timeoutMs <= 0) return command

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new ProtocolError(method, sessionId, 'zaman asimi ' + this.timeoutMs + ' ms'))
      }, this.timeoutMs)

      command.then(
        (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        (error: unknown) => {
          clearTimeout(timer)
          reject(error instanceof Error ? error : new Error(String(error)))
        }
      )
    })
  }

  async trySend<T>(method: string, params: object = {}, sessionId = ''): Promise<T | null> {
    try {
      return await this.send<T>(method, params, sessionId)
    } catch {
      return null
    }
  }

  async enableDomains(sessionId: string): Promise<boolean> {
    const page = await this.trySend('Page.enable', {}, sessionId)
    if (page === null) return false
    await this.trySend('Runtime.enable', {}, sessionId)
    await this.trySend('DOM.enable', {}, sessionId)
    await this.trySend('DOMSnapshot.enable', {}, sessionId)
    await this.trySend('Page.setLifecycleEventsEnabled', { enabled: true }, sessionId)
    await this.trySend('DOM.getDocument', { depth: 0 }, sessionId)
    return true
  }

  detach(): void {
    if (this.wc.debugger.isAttached()) this.wc.debugger.detach()
    this.ready = false
    this.order.length = 1
    this.parents.clear()
    this.handlers.clear()
  }

  private emit(method: string, params: Record<string, unknown>, sessionId: string): void {
    const set = this.handlers.get(method)
    if (!set) return
    for (const fn of Array.from(set)) fn(params, sessionId)
  }

  private async autoAttach(sessionId: string): Promise<void> {
    await this.trySend(
      'Target.setAutoAttach',
      { autoAttach: true, waitForDebuggerOnStart: false, flatten: true },
      sessionId
    )
  }
}
