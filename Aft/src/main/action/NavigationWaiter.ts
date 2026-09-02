import type { Transport } from '../discovery'
import {
  DEFAULT_NAVIGATION,
  type NavigationKind,
  type NavigationOptions,
  type NavigationReport
} from './types'

const LOAD_EVENTS: ReadonlySet<string> = new Set(['load', 'networkIdle', 'firstMeaningfulPaint'])

const REQUEST_TTL_MS = 10000

const STREAMING_TYPES: ReadonlySet<string> = new Set(['EventSource', 'WebSocket', 'Media', 'Other'])

interface NavigationSignal {
  wait: (graceMs: number) => Promise<NavigationKind>
  loaded: (timeoutMs: number) => Promise<boolean>
  url: () => string
  stop: () => void
}

export class NavigationWaiter {
  private readonly inflight = new Map<string, number>()
  private lastActivityAt = Date.now()
  private detach: (() => void)[] = []

  constructor(private readonly tp: Transport) {}

  install(): void {
    if (this.detach.length) return

    this.detach.push(
      this.tp.on('Network.requestWillBeSent', (params, sessionId) => {
        const type = String(params['type'] ?? '')
        if (STREAMING_TYPES.has(type)) return
        const id = requestKey(params, sessionId)
        if (!id) return
        this.inflight.set(id, Date.now())
        this.lastActivityAt = Date.now()
      })
    )
    this.detach.push(
      this.tp.on('Network.loadingFinished', (params, sessionId) => {
        this.finish(requestKey(params, sessionId))
      })
    )
    this.detach.push(
      this.tp.on('Network.loadingFailed', (params, sessionId) => {
        this.finish(requestKey(params, sessionId))
      })
    )
    this.detach.push(
      this.tp.on('Page.frameNavigated', (params) => {
        const frame = params['frame'] as { parentId?: string } | undefined
        if (frame && frame.parentId) return
        this.inflight.clear()
        this.lastActivityAt = Date.now()
      })
    )
  }

  private finish(id: string): void {
    if (!id) return
    this.inflight.delete(id)
    this.lastActivityAt = Date.now()
  }

  private pending(now: number): number {
    let count = 0
    for (const [id, at] of this.inflight) {
      if (now - at >= REQUEST_TTL_MS) {
        this.inflight.delete(id)
        continue
      }
      count++
    }
    return count
  }

  async enable(): Promise<void> {
    await Promise.all(
      this.tp.sessions.map(async (sessionId) => {
        await this.tp.trySend('Network.enable', {}, sessionId)
        await this.tp.trySend('Page.setLifecycleEventsEnabled', { enabled: true }, sessionId)
      })
    )
    this.install()
  }

  async observe(
    trigger: () => Promise<void>,
    overrides: Partial<NavigationOptions> = {}
  ): Promise<NavigationReport> {
    const options = { ...DEFAULT_NAVIGATION, ...overrides }
    const started = Date.now()
    const signal = this.listen()

    try {
      await trigger()
    } catch (error) {
      signal.stop()
      throw error
    }

    const kind = await signal.wait(options.inDocumentGraceMs)

    if (kind === 'none') {
      signal.stop()
      return {
        kind,
        url: '',
        lifecycleMs: Date.now() - started,
        networkIdle: true,
        timedOut: false
      }
    }

    let loaded = true
    if (kind === 'document') loaded = await signal.loaded(options.lifecycleTimeoutMs)
    else signal.stop()

    const idle = await this.waitForIdle(options.networkIdleMs, options.networkTimeoutMs)

    return {
      kind,
      url: signal.url(),
      lifecycleMs: Date.now() - started,
      networkIdle: idle,
      timedOut: !loaded
    }
  }

  dispose(): void {
    for (const off of this.detach) off()
    this.detach = []
    this.inflight.clear()
  }

  private listen(): NavigationSignal {
    let kind: NavigationKind = 'none'
    let url = ''
    let settled = false
    let onStart: (() => void) | null = null
    let onSettled: (() => void) | null = null

    const started = (): void => {
      const notify = onStart
      onStart = null
      if (notify) notify()
    }

    const offDocument = this.tp.on('Page.frameNavigated', (params) => {
      const frame = params.frame as { parentId?: string; url?: string } | undefined
      if (!frame || frame.parentId) return
      kind = 'document'
      url = frame.url ?? ''
      settled = false
      started()
    })

    const offInDocument = this.tp.on('Page.navigatedWithinDocument', (params) => {
      if (kind === 'document') return
      kind = 'in-document'
      url = String(params.url ?? '')
      started()
    })

    const offLifecycle = this.tp.on('Page.lifecycleEvent', (params) => {
      if (!LOAD_EVENTS.has(String(params.name ?? ''))) return
      settled = true
      const notify = onSettled
      onSettled = null
      if (notify) notify()
    })

    const stop = (): void => {
      onStart = null
      onSettled = null
      offDocument()
      offInDocument()
      offLifecycle()
    }

    return {
      wait: async (graceMs: number): Promise<NavigationKind> => {
        if (kind !== 'none' || graceMs <= 0) return kind
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            onStart = null
            resolve()
          }, graceMs)
          onStart = (): void => {
            clearTimeout(timer)
            resolve()
          }
        })
        return kind
      },
      loaded: async (timeoutMs: number): Promise<boolean> => {
        if (!settled && timeoutMs > 0) {
          await new Promise<void>((resolve) => {
            const timer = setTimeout(() => {
              onSettled = null
              resolve()
            }, timeoutMs)
            onSettled = (): void => {
              clearTimeout(timer)
              resolve()
            }
          })
        }
        stop()
        return settled
      },
      url: (): string => url,
      stop
    }
  }

  private async waitForIdle(idleMs: number, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
      const now = Date.now()
      const quiet = this.pending(now) === 0 && now - this.lastActivityAt >= idleMs
      if (quiet) return true
      await sleep(50)
    }
    return false
  }
}

function requestKey(params: Record<string, unknown>, sessionId: string): string {
  const id = String(params['requestId'] ?? '')
  return id ? sessionId + '|' + id : ''
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
