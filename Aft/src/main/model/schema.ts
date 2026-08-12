import type {
  BlindSpotKind,
  CoverageSummary,
  Point,
  Rect,
  ScanLevel,
  Viewport
} from '../discovery/'

export const MODEL_VERSION = 'elementmodel/2.0.0'

export const SUPPORTED_MODEL_VERSIONS: readonly string[] = ['elementmodel/2.0.0']

export type CoordinateSpace = 'document' | 'viewport' | 'page'

export type VisibilityState = 'visible' | 'clipped' | 'hidden'

export type OcclusionState = 'clear' | 'occluded' | 'unknown'

export type FrameKind = 'root' | 'same-origin' | 'cross-origin' | 'restricted'

export type ConsumerKind = 'agent' | 'record' | 'playback'

export interface FrameModel {
  frameId: string
  parentFrameId: string | null
  sessionId: string
  url: string
  kind: FrameKind
  offset: Point
  depth: number
  path: string[]
  failed: boolean
}

export interface FramePath {
  chain: string[]
  depth: number
  crossOrigin: boolean
}

export interface ShadowHop {
  hostRef: string
  hostTag: string
  mode: string
}

export interface ShadowPath {
  hops: ShadowHop[]
  depth: number
  closed: boolean
}

export interface Geometry {
  document: Rect | null
  viewport: Rect | null
  page: Rect | null
  center: Point | null
  reference: CoordinateSpace
  paintOrder: number
  scrollable: boolean
}

export interface Visibility {
  state: VisibilityState
  inViewport: boolean
  occlusion: OcclusionState
  opacity: number
  pointerEvents: string
}

export interface Accessibility {
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

export interface Interactivity {
  interactive: boolean
  clickable: boolean
  editable: boolean
  formControl: boolean
  reasons: string[]
}

export interface MomentaryIdentity {
  ref: string
  ordinal: number
  backendNodeId: number
  sessionId: string
  frameId: string
  signature: string
}

export interface ElementModel {
  identity: MomentaryIdentity
  parentRef: string | null
  childRefs: string[]
  depth: number
  nodeType: number
  tag: string
  attrs: Record<string, string>
  text: string
  value: string
  checked: boolean
  isShadowRoot: boolean
  framePath: FramePath
  shadowPath: ShadowPath
  geometry: Geometry
  visibility: Visibility
  accessibility: Accessibility | null
  interactivity: Interactivity
}

export interface BlindSpotModel {
  kind: BlindSpotKind
  frameId: string
  ref: string
  rect: Rect | null
  detail: string
}

export interface SnapshotOrigin {
  url: string
  title: string
  scanLevel: ScanLevel
  reused: boolean
  durationMs: number
}

export interface GraphSnapshot {
  modelVersion: string
  sourceVersion: string
  capturedAt: number
  origin: SnapshotOrigin
  viewport: Viewport
  frames: FrameModel[]
  blindSpots: BlindSpotModel[]
  coverage: CoverageSummary
  elements: ElementModel[]
}

export const EMPTY_FRAME_PATH: FramePath = { chain: [], depth: 0, crossOrigin: false }

export const EMPTY_SHADOW_PATH: ShadowPath = { hops: [], depth: 0, closed: false }

export const TEXT_CAP = 160

export const ATTR_CAP = 512

export const TEST_ATTRIBUTES: readonly string[] = [
  'data-testid',
  'data-test-id',
  'data-test',
  'data-qa',
  'data-qa-id',
  'data-cy',
  'data-e2e',
  'data-automation-id',
  'data-automationid',
  'data-tracking-id'
]

export const EDITABLE_TAGS: ReadonlySet<string> = new Set(['input', 'textarea'])

export const FORM_CONTROL_TAGS: ReadonlySet<string> = new Set([
  'input',
  'select',
  'textarea',
  'button',
  'option',
  'fieldset'
])
