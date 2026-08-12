import type { PageElement, PageState } from '../browser/types'
import type { FrameRecord } from './FrameRegistry'
import {
  SCHEMA_VERSION,
  type BlindSpot,
  type Candidate,
  type ConsumerKind,
  type CoverageSummary,
  type GraphNode,
  type OutsideSummary,
  type Projection,
  type Viewport
} from './types'

export class ElementGraph {
  readonly version = SCHEMA_VERSION
  private readonly byKey: Map<string, GraphNode>
  private readonly byIndex = new Map<number, GraphNode>()

  constructor(
    readonly nodes: GraphNode[],
    lookup: Map<string, GraphNode>,
    readonly url: string,
    readonly title: string,
    readonly viewport: Viewport,
    readonly frames: FrameRecord[],
    readonly blindSpots: BlindSpot[],
    readonly coverage: CoverageSummary
  ) {
    this.byKey = lookup
    for (const node of nodes) {
      if (node.index >= 0) this.byIndex.set(node.index, node)
    }
  }
  get(key: string): GraphNode | undefined {
    return this.byKey.get(key)
  }
  at(index: number): GraphNode | undefined {
    return this.byIndex.get(index)
  }
  elements(): GraphNode[] {
    return this.nodes.filter((node) => node.nodeType === 1)
  }
  interactive(): GraphNode[] {
    return this.nodes.filter((node) => node.interactive)
  }
  indexed(): GraphNode[] {
    return Array.from(this.byIndex.values()).sort((a, b) => a.index - b.index)
  }
  shadowRoots(): GraphNode[] {
    return this.nodes.filter((node) => node.isShadowRoot)
  }
  find(predicate: (node: GraphNode) => boolean): GraphNode[] {
    return this.nodes.filter(predicate)
  }
  parent(node: GraphNode): GraphNode | undefined {
    return node.parentKey ? this.byKey.get(node.parentKey) : undefined
  }
  children(node: GraphNode): GraphNode[] {
    const out: GraphNode[] = []
    for (const key of node.childKeys) {
      const child = this.byKey.get(key)
      if (child) out.push(child)
    }
    return out
  }
  ancestors(node: GraphNode, limit = 64): GraphNode[] {
    const out: GraphNode[] = []
    let cursor = this.parent(node)
    while (cursor && out.length < limit) {
      out.push(cursor)
      cursor = this.parent(cursor)
    }
    return out
  }

  project(kind: ConsumerKind): Projection {
    const source = this.indexed()
    const candidates: Candidate[] = []
    const outside: OutsideSummary = { above: 0, below: 0, left: 0, right: 0, hidden: 0 }

    for (const node of source) {
      const rect = node.viewRect
      if (!rect || !node.center) {
        outside.hidden++
        continue
      }
      const visibleHere = node.inViewport && !(kind === 'agent' && node.occluded)
      if (!visibleHere) {
        if (kind === 'playback') {
          candidates.push(toCandidate(node, rect))
          continue
        }
        if (rect.y + rect.h <= 0) outside.above++
        else if (rect.y >= this.viewport.height) outside.below++
        else if (rect.x + rect.w <= 0) outside.left++
        else if (rect.x >= this.viewport.width) outside.right++
        else outside.hidden++
        continue
      }
      candidates.push(toCandidate(node, rect))
    }

    return { kind, candidates, outside }
  }

  toPageState(): PageState {
    const elements: PageElement[] = this.project('agent').candidates.map((candidate) => ({
      i: candidate.index,
      tag: candidate.tag,
      type: candidate.type,
      name: candidate.name,
      text: candidate.text || candidate.name,
      x: Math.round(candidate.center.x),
      y: Math.round(candidate.center.y)
    }))

    return {
      url: this.url,
      title: this.title,
      scrollY: this.viewport.scrollY,
      pageHeight: this.viewport.pageHeight,
      viewport: this.viewport.height,
      elements
    }
  }
}

function toCandidate(
  node: GraphNode,
  rect: { x: number; y: number; w: number; h: number }
): Candidate {
  const label =
    node.ax?.name ||
    node.attrs['aria-label'] ||
    node.attrs['placeholder'] ||
    node.attrs['title'] ||
    node.attrs['name'] ||
    ''
  return {
    index: node.index,
    key: node.key,
    tag: node.tag,
    type: node.attrs['type'] ?? '',
    role: node.attrs['role'] || node.ax?.role || '',
    name: label,
    text: node.text || node.value || label,
    frameDepth: Math.max(0, node.framePath.length - 1),
    shadowDepth: node.shadowPath.length,
    rect,
    center: { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 },
    inViewport: node.inViewport,
    occluded: node.occluded
  }
}
