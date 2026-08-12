import type { AxMap } from './AxCollector'
import type { FrameRegistry } from './FrameRegistry'
import type { DocNode, DocSnap, SessionSnap } from './SnapshotCollector'
import { applyGeometry, applyInteractivity } from './Classify'
import type { BlindSpot, GraphNode, Point, Rect, ShadowStep, Viewport } from './types'

const TEXT_CAP = 160

export const OVERLAY_ID = '__aft_overlay'

interface DocRef {
  sessionId: string
  doc: DocSnap
}

export interface BuildResult {
  nodes: GraphNode[]
  lookup: Map<string, GraphNode>
  blindSpots: BlindSpot[]
}

export function buildGraph(
  snaps: SessionSnap[],
  frames: FrameRegistry,
  ax: AxMap,
  viewport: Viewport,
  margin: number
): BuildResult {
  const docByFrame = new Map<string, DocRef>()
  for (const snap of snaps) {
    for (const doc of snap.docs) {
      if (!doc.frameId) continue
      if (!docByFrame.has(doc.frameId) || snap.sessionId !== '') {
        docByFrame.set(doc.frameId, { sessionId: snap.sessionId, doc })
      }
    }
  }

  const nodes: GraphNode[] = []
  const lookup = new Map<string, GraphNode>()
  const docOfNode = new Map<string, DocRef>()

  for (const [frameId, ref] of docByFrame) {
    const framePath = frames.get(frameId)?.path ?? [frameId]
    emitDoc(ref, frameId, framePath, nodes, lookup, docOfNode)
  }

  for (const frame of frames.ordered()) {
    if (!frame.parentFrameId || frame.ownerBackendId === null) continue
    const ownerKey = frame.ownerSessionId + ':' + frame.ownerBackendId
    const owner = lookup.get(ownerKey)
    const ref = docByFrame.get(frame.frameId)
    if (!owner || !ref) continue
    const root = firstElement(ref, lookup)
    if (!root || root.key === owner.key) continue
    if (root.parentKey === owner.key) continue
    root.parentKey = owner.key
    owner.childKeys.push(root.key)
  }

  for (const frame of frames.ordered()) {
    if (!frame.parentFrameId) {
      frame.offset = { x: 0, y: 0 }
      continue
    }
    const ownerKey = frame.ownerSessionId + ':' + frame.ownerBackendId
    const owner = lookup.get(ownerKey)
    const ownerDoc = owner ? docOfNode.get(owner.key) : undefined
    const parentFrame = frames.get(frame.parentFrameId)
    if (!owner || !owner.docRect || !ownerDoc || !parentFrame) {
      frame.offset = { x: 0, y: 0 }
      frame.failed = true
      continue
    }
    const base = toView(owner.docRect, ownerDoc.doc, parentFrame.offset)
    frame.offset = {
      x: base.x + px(owner.style['border-left-width']) + px(owner.style['padding-left']),
      y: base.y + px(owner.style['border-top-width']) + px(owner.style['padding-top'])
    }
  }

  for (const node of nodes) {
    const ref = docOfNode.get(node.key)
    const frame = frames.get(node.frameId)
    if (node.docRect && ref && frame) {
      node.viewRect = toView(node.docRect, ref.doc, frame.offset)
      node.pageRect = {
        x: node.viewRect.x + viewport.scrollX,
        y: node.viewRect.y + viewport.scrollY,
        w: node.viewRect.w,
        h: node.viewRect.h
      }
      node.center = {
        x: node.viewRect.x + node.viewRect.w / 2,
        y: node.viewRect.y + node.viewRect.h / 2
      }
    }
    node.ax = ax.get(node.key) ?? null
    applyGeometry(node, viewport, margin)
    applyInteractivity(node)
  }

  return { nodes, lookup, blindSpots: detectBlindSpots(nodes, frames) }
}

function emitDoc(
  ref: DocRef,
  frameId: string,
  framePath: string[],
  nodes: GraphNode[],
  lookup: Map<string, GraphNode>,
  docOfNode: Map<string, DocRef>
): void {
  const doc = ref.doc
  const texts = accumulateText(doc)
  const keys: (string | null)[] = new Array(doc.nodes.length).fill(null)

  const children: number[][] = new Array(doc.nodes.length)
  for (let i = 0; i < doc.nodes.length; i++) children[i] = []
  const stack: { index: number; depth: number; shadow: ShadowStep[] }[] = []
  for (let i = 0; i < doc.nodes.length; i++) {
    const parent = doc.nodes[i].parentIndex
    if (parent >= 0) children[parent].push(i)
    else stack.push({ index: i, depth: 0, shadow: [] })
  }

  while (stack.length > 0) {
    const item = stack.pop()
    if (!item) break
    const raw = doc.nodes[item.index]
    if (raw.attrs['id'] === OVERLAY_ID) continue
    const key = ref.sessionId + ':' + raw.backendNodeId
    keys[item.index] = key

    if (!lookup.has(key)) {
      const node = toGraphNode(raw, ref, frameId, framePath, item.depth, item.shadow, doc, texts)
      nodes.push(node)
      lookup.set(key, node)
      docOfNode.set(key, ref)
    }

    const parentKey = raw.parentIndex >= 0 ? keys[raw.parentIndex] : null
    const current = lookup.get(key)
    if (current && parentKey && current.parentKey !== parentKey) {
      current.parentKey = parentKey
      const parent = lookup.get(parentKey)
      if (parent) parent.childKeys.push(key)
    }

    const nextShadow = raw.shadowRootType
      ? item.shadow.concat(hostStep(doc, raw, ref, keys))
      : item.shadow

    const kids = children[item.index]
    for (let i = kids.length - 1; i >= 0; i--) {
      stack.push({ index: kids[i], depth: item.depth + 1, shadow: nextShadow })
    }
  }
}

function hostStep(doc: DocSnap, root: DocNode, ref: DocRef, keys: (string | null)[]): ShadowStep {
  const host = root.parentIndex >= 0 ? doc.nodes[root.parentIndex] : null
  return {
    hostKey: host ? (keys[root.parentIndex] ?? ref.sessionId + ':' + host.backendNodeId) : '',
    hostTag: host ? host.nodeName : '',
    mode: root.shadowRootType
  }
}

function toGraphNode(
  raw: DocNode,
  ref: DocRef,
  frameId: string,
  framePath: string[],
  depth: number,
  shadow: ShadowStep[],
  doc: DocSnap,
  texts: string[]
): GraphNode {
  return {
    key: ref.sessionId + ':' + raw.backendNodeId,
    sessionId: ref.sessionId,
    backendNodeId: raw.backendNodeId,
    frameId,
    framePath,
    parentKey: null,
    childKeys: [],
    depth,
    nodeType: raw.nodeType,
    tag: raw.nodeName,
    attrs: raw.attrs,
    text: texts[raw.index] ?? '',
    value: raw.inputValue || raw.textValue || raw.attrs['value'] || '',
    checked: raw.inputChecked,
    clickable: raw.isClickable,
    isShadowRoot: raw.shadowRootType !== '',
    shadowMode: raw.shadowRootType,
    shadowPath: shadow,
    docRect: doc.bounds[raw.index],
    viewRect: null,
    pageRect: null,
    center: null,
    style: doc.styles[raw.index] ?? {},
    paintOrder: doc.paintOrders[raw.index] ?? 0,
    scrollable: false,
    visible: false,
    inViewport: false,
    occluded: false,
    occlusionChecked: false,
    interactive: false,
    reasons: [],
    ax: null,
    index: -1
  }
}

function accumulateText(doc: DocSnap): string[] {
  const out: string[] = new Array(doc.nodes.length).fill('')
  for (let i = doc.nodes.length - 1; i >= 0; i--) {
    const raw = doc.nodes[i]
    let own = out[i]
    if (raw.nodeType === 3) own = (raw.nodeValue + ' ' + own).replace(/\s+/g, ' ').trim()
    out[i] = own.slice(0, TEXT_CAP)
    const parent = raw.parentIndex
    if (parent >= 0 && out[i]) {
      out[parent] = (out[i] + ' ' + out[parent]).replace(/\s+/g, ' ').trim().slice(0, TEXT_CAP)
    }
  }
  return out
}

function firstElement(ref: DocRef, lookup: Map<string, GraphNode>): GraphNode | null {
  for (const raw of ref.doc.nodes) {
    if (raw.nodeType !== 9) continue
    const node = lookup.get(ref.sessionId + ':' + raw.backendNodeId)
    if (node) return node
  }
  const first = ref.doc.nodes[0]
  return first ? (lookup.get(ref.sessionId + ':' + first.backendNodeId) ?? null) : null
}

function toView(rect: Rect, doc: DocSnap, offset: Point): Rect {
  return {
    x: rect.x - doc.scrollX + offset.x,
    y: rect.y - doc.scrollY + offset.y,
    w: rect.w,
    h: rect.h
  }
}

function px(value: string | undefined): number {
  if (!value) return 0
  const parsed = parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function detectBlindSpots(nodes: GraphNode[], frames: FrameRegistry): BlindSpot[] {
  const out: BlindSpot[] = []

  for (const frame of frames.all()) {
    if (!frame.failed) continue
    out.push({
      kind: 'restricted-frame',
      frameId: frame.frameId,
      key: '',
      rect: null,
      detail: frame.url
    })
  }

  for (const node of nodes) {
    if (!node.visible) continue
    if (node.tag === 'canvas') {
      out.push({
        kind: 'canvas',
        frameId: node.frameId,
        key: node.key,
        rect: node.viewRect,
        detail: 'canvas'
      })
      continue
    }
    if (node.tag === 'video' || node.tag === 'embed' || node.tag === 'object') {
      out.push({
        kind: 'media',
        frameId: node.frameId,
        key: node.key,
        rect: node.viewRect,
        detail: node.tag
      })
      continue
    }
    if (node.scrollable && node.viewRect && node.childKeys.length >= 8) {
      const ratio = node.docRect && node.viewRect.h > 0 ? node.docRect.h / node.viewRect.h : 1
      if (ratio > 3) {
        out.push({
          kind: 'virtual-list',
          frameId: node.frameId,
          key: node.key,
          rect: node.viewRect,
          detail: 'ratio=' + ratio.toFixed(1)
        })
      }
      continue
    }
    if (node.ax?.expanded === 'false' || node.attrs['aria-expanded'] === 'false') {
      out.push({
        kind: 'collapsed-region',
        frameId: node.frameId,
        key: node.key,
        rect: node.viewRect,
        detail: node.tag
      })
    }
  }

  return out
}
