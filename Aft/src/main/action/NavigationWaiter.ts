import type { Transport } from '../discovery'
import {
  DEFAULT_NAVIGATION,
  type NavigationKind,
  type NavigationOptions,
  type NavigationReport
} from './types'

const LOAD_EVENTS: ReadonlySet<string> = new Set(['load', 'networkIdle', 'firstMeaningfulPaint'])

export class NavigationWaiter {
  private pendingRequests = 0
  private lastActivityAt = Date.now()
  private detach: (() => void)[] = []

  constructor(private readonly tp: Transport) {}

  install(): void {
    if (this.detach.length) return

    this.detach.push(
      this.tp.on('Network.requestWillBeSent', () => {
        this.pendingRequests++
        this.lastActivityAt = Date.now()
      })
    )
    this.detach.push(
      this.tp.on('Network.loadingFinished', () => {
        this.pendingRequests = Math.max(0, this.pendingRequests - 1)
        this.lastActivityAt = Date.now()
      })
    )
    this.detach.push(
      this.tp.on('Network.loadingFailed', () => {
        this.pendingRequests = Math.max(0, this.pendingRequests - 1)
        this.lastActivityAt = Date.now()
      })
    )
  }

  async enable(): Promise<void> {
    for (const sessionId of this.tp.sessions) {
      await this.tp.trySend('Network.enable', {}, sessionId)
      await this.tp.trySend('Page.setLifecycleEventsEnabled', { enabled: true }, sessionId)
    }
    this.install()
  }

  async observe(
    trigger: () => Promise<void>,
    overrides: Partial<NavigationOptions> = {}
  ): Promise<NavigationReport> {
    const options = { ...DEFAULT_NAVIGATION, ...overrides }
    const started = Date.now()
    const signal = this.listen()

    await trigger()
    const kind = await signal.wait(options.inDocumentGraceMs)

    if (kind === 'none') {
      return {
        kind,
        url: '',
        lifecycleMs: Date.now() - started,
        networkIdle: true,
        timedOut: false
      }
    }

    const loaded = kind === 'document' ? await this.waitForLoad(options.lifecycleTimeoutMs) : true
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
    this.pendingRequests = 0
  }

  private listen(): { wait: (graceMs: number) => Promise<NavigationKind>; url: () => string } {
    let kind: NavigationKind = 'none'
    let url = ''

    const offDocument = this.tp.on('Page.frameNavigated', (params) => {
      const frame = params.frame as { parentId?: string; url?: string } | undefined
      if (!frame || frame.parentId) return
      kind = 'document'
      url = frame.url ?? ''
    })

    const offInDocument = this.tp.on('Page.navigatedWithinDocument', (params) => {
      if (kind === 'document') return
      kind = 'in-document'
      url = String(params.url ?? '')
    })

    return {
      wait: async (graceMs: number): Promise<NavigationKind> => {
        const deadline = Date.now() + graceMs
        while (Date.now() < deadline && kind === 'none') await sleep(30)
        offDocument()
        offInDocument()
        return kind
      },
      url: (): string => url
    }
  }

  private waitForLoad(timeoutMs: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        off()
        resolve(false)
      }, timeoutMs)

      const off = this.tp.on('Page.lifecycleEvent', (params) => {
        if (!LOAD_EVENTS.has(String(params.name ?? ''))) return
        clearTimeout(timer)
        off()
        resolve(true)
      })
    })
  }

  private async waitForIdle(idleMs: number, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
      const quiet = this.pendingRequests === 0 && Date.now() - this.lastActivityAt >= idleMs
      if (quiet) return true
      await sleep(50)
    }
    return false
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
