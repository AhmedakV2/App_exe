export type ScanLevel = 0 | 1 | 2 | 3

export type ConsumerKind = 'agent' | 'record' | 'playback'

export const SCHEMA_VERSION = 'elementgraph/1.0.0'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Point {
  x: number
  y: number
}

export interface ShadowStep {
  hostKey: string
  hostTag: string
  mode: string
}

export interface AxInfo {
  role: string
  name: string
  description: string
  focusable: boolean
  disabled: boolean
  hidden: boolean
  checked: string
  expanded: string
  selected: string
}

export interface GraphNode {
  key: string
  sessionId: string
  backendNodeId: number
  frameId: string
  framePath: string[]
  parentKey: string | null
  childKeys: string[]
  depth: number
  nodeType: number
  tag: string
  attrs: Record<string, string>
  text: string
  value: string
  checked: boolean
  clickable: boolean
  isShadowRoot: boolean
  shadowMode: string
  shadowPath: ShadowStep[]
  docRect: Rect | null
  viewRect: Rect | null
  pageRect: Rect | null
  center: Point | null
  style: Record<string, string>
  paintOrder: number
  scrollable: boolean
  visible: boolean
  inViewport: boolean
  occluded: boolean
  occlusionChecked: boolean
  interactive: boolean
  reasons: string[]
  ax: AxInfo | null
  index: number
}

export type BlindSpotKind =
  'canvas' | 'media' | 'restricted-frame' | 'virtual-list' | 'collapsed-region'

export interface BlindSpot {
  kind: BlindSpotKind
  frameId: string
  key: string
  rect: Rect | null
  detail: string
}

export interface Viewport {
  width: number
  height: number
  scrollX: number
  scrollY: number
  pageWidth: number
  pageHeight: number
  dpr: number
}

export interface CoverageSummary {
  version: string
  level: ScanLevel
  reused: boolean
  passes: number
  nodes: number
  elements: number
  interactive: number
  inViewport: number
  shadowRoots: number
  frames: number
  framesFailed: number
  blindSpots: number
  occlusionChecked: number
  occlusionSkipped: number
  listenersProbed: number
  listenersSkipped: number
  quietTimedOut: boolean
  durationMs: number
}

export interface ScanOptions {
  level: ScanLevel
  quietMs: number
  quietTimeoutMs: number
  viewportMargin: number
  occlusionBudget: number
  listenerBudget: number
  lazyPasses: number
  force: boolean
}

export const DEFAULT_SCAN: ScanOptions = {
  level: 1,
  quietMs: 180,
  quietTimeoutMs: 2500,
  viewportMargin: 160,
  occlusionBudget: 6000,
  listenerBudget: 200,
  lazyPasses: 6,
  force: false
}

export const STYLE_KEYS: string[] = [
  'display',
  'visibility',
  'opacity',
  'pointer-events',
  'cursor',
  'position',
  'z-index',
  'overflow-x',
  'overflow-y',
  'background-color',
  'border-top-width',
  'border-left-width',
  'padding-top',
  'padding-left'
]

export interface Candidate {
  index: number
  key: string
  tag: string
  type: string
  role: string
  name: string
  text: string
  frameDepth: number
  shadowDepth: number
  rect: Rect
  center: Point
  inViewport: boolean
  occluded: boolean
}

export interface OutsideSummary {
  above: number
  below: number
  left: number
  right: number
  hidden: number
}

export interface Projection {
  kind: ConsumerKind
  candidates: Candidate[]
  outside: OutsideSummary
}
