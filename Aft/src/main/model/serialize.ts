import type { ElementGraph } from '../discovery'
import type { FrameRecord } from '../discovery/'
import type { BlindSpot, GraphNode, Rect } from '../discovery/'
import { digest } from './hash'
import {
  ATTR_CAP,
  EDITABLE_TAGS,
  FORM_CONTROL_TAGS,
  MODEL_VERSION,
  TEXT_CAP,
  type Accessibility,
  type BlindSpotModel,
  type ElementModel,
  type FrameKind,
  type FrameModel,
  type FramePath,
  type Geometry,
  type GraphSnapshot,
  type Interactivity,
  type MomentaryIdentity,
  type ShadowPath,
  type Visibility,
  type VisibilityState
} from './schema'

export function toSnapshot(graph: ElementGraph): GraphSnapshot {
  const rootSession = graph.frames.find((frame) => !frame.parentFrameId)?.sessionId ?? ''
  const frames = graph.frames.map((frame) => toFrameModel(frame, rootSession))
  const crossOrigin = new Set(
    frames
      .filter((frame) => frame.kind !== 'root' && frame.kind !== 'same-origin')
      .map((f) => f.frameId)
  )
  const siblingRank = rankSiblings(graph.nodes)

  return {
    modelVersion: MODEL_VERSION,
    sourceVersion: graph.version,
    capturedAt: Date.now(),
    origin: {
      url: graph.url,
      title: graph.title,
      scanLevel: graph.coverage.level,
      reused: graph.coverage.reused,
      durationMs: graph.coverage.durationMs
    },
    viewport: { ...graph.viewport },
    frames,
    blindSpots: graph.blindSpots.map(toBlindSpotModel),
    coverage: { ...graph.coverage },
    elements: graph.nodes.map((node) => toElementModel(node, crossOrigin, siblingRank))
  }
}

export function toFrameModel(frame: FrameRecord, rootSessionId: string): FrameModel {
  return {
    frameId: frame.frameId,
    parentFrameId: frame.parentFrameId,
    sessionId: frame.sessionId,
    url: frame.url,
    kind: frameKind(frame, rootSessionId),
    offset: { x: frame.offset.x, y: frame.offset.y },
    depth: frame.depth,
    path: frame.path.slice(),
    failed: frame.failed
  }
}

export function toBlindSpotModel(spot: BlindSpot): BlindSpotModel {
  return {
    kind: spot.kind,
    frameId: spot.frameId,
    ref: spot.key,
    rect: cloneRect(spot.rect),
    detail: spot.detail
  }
}

export function toElementModel(
  node: GraphNode,
  crossOriginFrames: ReadonlySet<string>,
  siblingRank: Map<string, number>
): ElementModel {
  const framePath = buildFramePath(node, crossOriginFrames)
  const shadowPath = buildShadowPath(node)
  const geometry = buildGeometry(node)
  const visibility = buildVisibility(node)

  return {
    identity: buildIdentity(node, framePath, shadowPath, siblingRank),
    parentRef: node.parentKey,
    childRefs: node.childKeys.slice(),
    depth: node.depth,
    nodeType: node.nodeType,
    tag: node.tag,
    attrs: cloneAttrs(node.attrs),
    text: clamp(node.text, TEXT_CAP),
    value: clamp(node.value, TEXT_CAP),
    checked: node.checked,
    isShadowRoot: node.isShadowRoot,
    framePath,
    shadowPath,
    geometry,
    visibility,
    accessibility: buildAccessibility(node),
    interactivity: buildInteractivity(node)
  }
}

function buildIdentity(
  node: GraphNode,
  framePath: FramePath,
  shadowPath: ShadowPath,
  siblingRank: Map<string, number>
): MomentaryIdentity {
  const signature = digest([
    node.tag,
    node.attrs['role'] ?? node.ax?.role ?? '',
    node.attrs['type'] ?? '',
    framePath.depth,
    shadowPath.depth,
    node.depth,
    siblingRank.get(node.key) ?? 0
  ])

  return {
    ref: node.key,
    ordinal: node.index,
    backendNodeId: node.backendNodeId,
    sessionId: node.sessionId,
    frameId: node.frameId,
    signature
  }
}

function buildFramePath(node: GraphNode, crossOriginFrames: ReadonlySet<string>): FramePath {
  const chain = node.framePath.slice()
  return {
    chain,
    depth: Math.max(0, chain.length - 1),
    crossOrigin: chain.some((frameId) => crossOriginFrames.has(frameId))
  }
}

function buildShadowPath(node: GraphNode): ShadowPath {
  const hops = node.shadowPath.map((step) => ({
    hostRef: step.hostKey,
    hostTag: step.hostTag,
    mode: step.mode
  }))
  return {
    hops,
    depth: hops.length,
    closed: hops.some((hop) => hop.mode === 'closed')
  }
}

function buildGeometry(node: GraphNode): Geometry {
  return {
    document: cloneRect(node.docRect),
    viewport: cloneRect(node.viewRect),
    page: cloneRect(node.pageRect),
    center: node.center ? { x: node.center.x, y: node.center.y } : null,
    reference: 'viewport',
    paintOrder: node.paintOrder,
    scrollable: node.scrollable
  }
}

function buildVisibility(node: GraphNode): Visibility {
  const state: VisibilityState = !node.visible ? 'hidden' : node.inViewport ? 'visible' : 'clipped'
  const declared = node.style['opacity'] ?? ''
  const raw = declared === '' ? 1 : Number(declared)

  return {
    state,
    inViewport: node.inViewport,
    occlusion: node.occlusionChecked ? (node.occluded ? 'occluded' : 'clear') : 'unknown',
    opacity: Number.isFinite(raw) ? raw : 1,
    pointerEvents: node.style['pointer-events'] ?? ''
  }
}

function buildAccessibility(node: GraphNode): Accessibility | null {
  if (!node.ax) return null
  return {
    role: node.ax.role,
    name: clamp(node.ax.name, TEXT_CAP),
    description: clamp(node.ax.description, TEXT_CAP),
    focusable: node.ax.focusable,
    disabled: node.ax.disabled,
    hidden: node.ax.hidden,
    checked: node.ax.checked,
    expanded: node.ax.expanded,
    selected: node.ax.selected
  }
}

function buildInteractivity(node: GraphNode): Interactivity {
  const editable =
    EDITABLE_TAGS.has(node.tag) ||
    node.attrs['contenteditable'] === '' ||
    node.attrs['contenteditable'] === 'true'

  return {
    interactive: node.interactive,
    clickable: node.clickable,
    editable,
    formControl: FORM_CONTROL_TAGS.has(node.tag),
    reasons: node.reasons.slice()
  }
}

function rankSiblings(nodes: GraphNode[]): Map<string, number> {
  const counters = new Map<string, number>()
  const rank = new Map<string, number>()

  for (const node of nodes) {
    const bucket = (node.parentKey ?? '') + '\u0001' + node.tag
    const next = (counters.get(bucket) ?? 0) + 1
    counters.set(bucket, next)
    rank.set(node.key, next)
  }
  return rank
}

function frameKind(frame: FrameRecord, rootSessionId: string): FrameKind {
  if (!frame.parentFrameId) return 'root'
  if (frame.failed) return 'restricted'
  return frame.sessionId === rootSessionId ? 'same-origin' : 'cross-origin'
}

function cloneRect(rect: Rect | null): Rect | null {
  return rect ? { x: rect.x, y: rect.y, w: rect.w, h: rect.h } : null
}

function cloneAttrs(attrs: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [name, value] of Object.entries(attrs)) out[name] = clamp(value, ATTR_CAP)
  return out
}

function clamp(value: string, cap: number): string {
  const trimmed = value.replace(/\s+/g, ' ').trim()
  return trimmed.length > cap ? trimmed.slice(0, cap) : trimmed
}
