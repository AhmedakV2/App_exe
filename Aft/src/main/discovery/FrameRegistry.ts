import type { Transport } from './Transport'
import type { Point } from './types'

export interface FrameRecord {
  frameId: string
  parentFrameId: string | null
  sessionId: string
  url: string
  ownerBackendId: number | null
  ownerSessionId: string
  offset: Point
  depth: number
  path: string[]
  failed: boolean
}

interface RawFrame {
  id: string
  parentId?: string
  url?: string
}

interface RawFrameTree {
  frame: RawFrame
  childFrames?: RawFrameTree[]
}

export class FrameRegistry {
  private readonly map = new Map<string, FrameRecord>()
  private readonly enabled = new Set<string>()
  private rootId = ''
  private failedSessions = 0
  private dirty = true

  constructor(private readonly tp: Transport) {
    const touch = (): void => {
      this.dirty = true
    }
    tp.on('Page.frameAttached', touch)
    tp.on('Page.frameDetached', touch)
    tp.on('Page.frameNavigated', touch)
    tp.on('Target.attachedToTarget', touch)
    tp.on('Target.detachedFromTarget', touch)
  }

  get failedCount(): number {
    return this.failedSessions
  }

  invalidate(): void {
    this.dirty = true
  }

  root(): FrameRecord {
    const record = this.map.get(this.rootId)
    if (!record) throw new Error('Kok frame bulunamadi')
    return record
  }

  get(frameId: string): FrameRecord | undefined {
    return this.map.get(frameId)
  }

  ordered(): FrameRecord[] {
    return Array.from(this.map.values()).sort((a, b) => a.depth - b.depth)
  }

  all(): FrameRecord[] {
    return Array.from(this.map.values())
  }

  async refresh(): Promise<void> {
    const sessions = this.tp.sessions
    for (const sessionId of sessions) {
      if (this.enabled.has(sessionId)) continue
      this.dirty = true
      if (await this.tp.enableDomains(sessionId)) this.enabled.add(sessionId)
    }
    for (const sessionId of Array.from(this.enabled)) {
      if (!sessions.includes(sessionId)) {
        this.enabled.delete(sessionId)
        this.dirty = true
      }
    }

    if (!this.dirty && this.map.size > 0) {
      this.reset()
      return
    }

    this.map.clear()
    this.failedSessions = 0

    for (const sessionId of sessions) {
      if (!this.enabled.has(sessionId)) {
        this.failedSessions++
        continue
      }
      await this.tp.trySend('DOM.getDocument', { depth: 0 }, sessionId)
      const tree = await this.tp.trySend<{ frameTree: RawFrameTree }>(
        'Page.getFrameTree',
        {},
        sessionId
      )
      if (!tree) {
        this.failedSessions++
        continue
      }
      this.walk(tree.frameTree, sessionId, sessionId !== '')
      if (sessionId === '') this.rootId = tree.frameTree.frame.id
    }

    this.link()
    await this.resolveOwners()
    this.dirty = false
  }

  private reset(): void {
    for (const record of this.map.values()) {
      record.failed = false
      record.offset = { x: 0, y: 0 }
    }
  }

  private walk(node: RawFrameTree, sessionId: string, override: boolean): void {
    const existing = this.map.get(node.frame.id)
    if (!existing || override) {
      this.map.set(node.frame.id, {
        frameId: node.frame.id,
        parentFrameId: node.frame.parentId ?? existing?.parentFrameId ?? null,
        sessionId,
        url: node.frame.url ?? existing?.url ?? '',
        ownerBackendId: null,
        ownerSessionId: '',
        offset: { x: 0, y: 0 },
        depth: 0,
        path: [],
        failed: false
      })
    }
    for (const child of node.childFrames ?? []) this.walk(child, sessionId, override)
  }

  private link(): void {
    for (const record of this.map.values()) {
      const path: string[] = []
      let cursor: FrameRecord | undefined = record
      let guard = 0
      while (cursor && guard < 64) {
        path.unshift(cursor.frameId)
        cursor = cursor.parentFrameId ? this.map.get(cursor.parentFrameId) : undefined
        guard++
      }
      record.path = path
      record.depth = path.length - 1
    }
  }

  private async resolveOwners(): Promise<void> {
    for (const record of this.ordered()) {
      if (!record.parentFrameId) continue
      const parent = this.map.get(record.parentFrameId)
      if (!parent) {
        record.failed = true
        this.failedSessions++
        continue
      }
      const owner = await this.tp.trySend<{ backendNodeId: number }>(
        'DOM.getFrameOwner',
        { frameId: record.frameId },
        parent.sessionId
      )
      if (!owner) {
        record.failed = true
        continue
      }
      record.ownerBackendId = owner.backendNodeId
      record.ownerSessionId = parent.sessionId
    }
  }
}
