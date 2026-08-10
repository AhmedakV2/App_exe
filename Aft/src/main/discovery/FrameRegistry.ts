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
  private rootId = ''
  private failedSessions = 0

  constructor(private readonly tp: Transport) {}

  get failedCount(): number {
    return this.failedSessions
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
    this.map.clear()
    this.failedSessions = 0

    for (const sessionId of this.tp.sessions) {
      const enabled = await this.tp.enableDomains(sessionId)
      if (!enabled) {
        this.failedSessions++
        continue
      }
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
