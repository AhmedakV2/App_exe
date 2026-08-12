import type { Point, Rect } from '../discovery'
import type { ModelIndex } from './ModelIndex'
import type { BlindSpotModel, ConsumerKind, ElementModel, OcclusionState } from './schema'

const CONTAINER_TOLERANCE = 4

const LABEL_CAP = 80

export interface ProjectionOptions {
  viewportMargin: number
  maxCandidates: number
  tokenBudget: number
  labelCap: number
  suppressContainers: boolean
  includeOffscreen: boolean
  includeOccluded: boolean
}

export interface ProjectedElement {
  ordinal: number
  ref: string
  tag: string
  role: string
  type: string
  name: string
  text: string
  rect: Rect
  center: Point
  frameDepth: number
  shadowDepth: number
  inViewport: boolean
  occlusion: OcclusionState
  disabled: boolean
  editable: boolean
}

export interface OutsideSummary {
  above: number
  below: number
  left: number
  right: number
  hidden: number
  occluded: number
  suppressed: number
}

export interface ConsumerProjection {
  kind: ConsumerKind
  modelVersion: string
  url: string
  elements: ProjectedElement[]
  outside: OutsideSummary
  blindSpots: BlindSpotModel[]
  truncated: boolean
  estimatedTokens: number
}

export const PROJECTION_DEFAULTS: Record<ConsumerKind, ProjectionOptions> = {
  agent: {
    viewportMargin: 160,
    maxCandidates: 220,
    tokenBudget: 6000,
    labelCap: LABEL_CAP,
    suppressContainers: true,
    includeOffscreen: false,
    includeOccluded: false
  },
  record: {
    viewportMargin: 40,
    maxCandidates: 600,
    tokenBudget: 0,
    labelCap: LABEL_CAP,
    suppressContainers: false,
    includeOffscreen: false,
    includeOccluded: true
  },
  playback: {
    viewportMargin: 0,
    maxCandidates: 0,
    tokenBudget: 0,
    labelCap: LABEL_CAP,
    suppressContainers: false,
    includeOffscreen: true,
    includeOccluded: true
  }
}

export function project(
  index: ModelIndex,
  kind: ConsumerKind,
  overrides: Partial<ProjectionOptions> = {}
): ConsumerProjection {
  const options = { ...PROJECTION_DEFAULTS[kind], ...overrides }
  const viewport = index.viewportSize
  const outside: OutsideSummary = {
    above: 0,
    below: 0,
    left: 0,
    right: 0,
    hidden: 0,
    occluded: 0,
    suppressed: 0
  }

  const accepted: ElementModel[] = []

  for (const element of index.addressable()) {
    const rect = element.geometry.viewport
    if (!rect || !element.geometry.center) {
      outside.hidden++
      continue
    }
    if (options.includeOffscreen) {
      accepted.push(element)
      continue
    }
    if (!withinBand(rect, viewport, options.viewportMargin)) {
      countOutside(rect, viewport, outside)
      continue
    }
    if (!options.includeOccluded && element.visibility.occlusion === 'occluded') {
      outside.occluded++
      continue
    }
    accepted.push(element)
  }

  const filtered = options.suppressContainers
    ? suppressContainers(accepted, index, outside)
    : accepted
  const limited =
    options.maxCandidates > 0 && filtered.length > options.maxCandidates
      ? filtered.slice(0, options.maxCandidates)
      : filtered

  const elements = limited.map((element) => toProjected(element, options.labelCap))
  const budgeted = options.tokenBudget > 0 ? applyBudget(elements, options.tokenBudget) : elements

  return {
    kind,
    modelVersion: index.modelVersion,
    url: index.url,
    elements: budgeted,
    outside,
    blindSpots: index.blindSpots(),
    truncated: budgeted.length < filtered.length,
    estimatedTokens: budgeted.reduce((total, element) => total + estimateTokens(element), 0)
  }
}

export function projectScoped(index: ModelIndex, refs: readonly string[]): ConsumerProjection {
  const base = project(index, 'playback')
  const allowed = new Set(refs)
  const elements = base.elements.filter((element) => allowed.has(element.ref))

  return {
    ...base,
    elements,
    truncated: base.truncated,
    estimatedTokens: elements.reduce((total, element) => total + estimateTokens(element), 0)
  }
}

function toProjected(element: ElementModel, cap: number): ProjectedElement {
  const rect = element.geometry.viewport as Rect
  const center = element.geometry.center as Point
  const label = labelOf(element)

  return {
    ordinal: element.identity.ordinal,
    ref: element.identity.ref,
    tag: element.tag,
    role: element.attrs['role'] || element.accessibility?.role || '',
    type: element.attrs['type'] ?? '',
    name: clamp(label, cap),
    text: clamp(element.text || element.value || label, cap),
    rect: { x: rect.x, y: rect.y, w: rect.w, h: rect.h },
    center: { x: center.x, y: center.y },
    frameDepth: element.framePath.depth,
    shadowDepth: element.shadowPath.depth,
    inViewport: element.visibility.inViewport,
    occlusion: element.visibility.occlusion,
    disabled: element.accessibility?.disabled ?? element.attrs['disabled'] !== undefined,
    editable: element.interactivity.editable
  }
}

function suppressContainers(
  elements: ElementModel[],
  index: ModelIndex,
  outside: OutsideSummary
): ElementModel[] {
  const present = new Set(elements.map((element) => element.identity.ref))
  const out: ElementModel[] = []

  for (const element of elements) {
    const rect = element.geometry.viewport
    if (!rect) continue
    const swallowed = index
      .children(element)
      .some((child) => present.has(child.identity.ref) && sameBox(rect, child.geometry.viewport))

    if (swallowed && !element.interactivity.editable) {
      outside.suppressed++
      continue
    }
    out.push(element)
  }
  return out
}

function applyBudget(elements: ProjectedElement[], budget: number): ProjectedElement[] {
  const out: ProjectedElement[] = []
  let total = 0

  for (const element of elements) {
    const cost = estimateTokens(element)
    if (total + cost > budget) break
    total += cost
    out.push(element)
  }
  return out
}

function labelOf(element: ElementModel): string {
  return (
    element.accessibility?.name ||
    element.attrs['aria-label'] ||
    element.attrs['placeholder'] ||
    element.attrs['title'] ||
    element.attrs['alt'] ||
    element.attrs['name'] ||
    ''
  )
}

function withinBand(
  rect: Rect,
  viewport: { width: number; height: number },
  margin: number
): boolean {
  return (
    rect.x + rect.w > -margin &&
    rect.y + rect.h > -margin &&
    rect.x < viewport.width + margin &&
    rect.y < viewport.height + margin
  )
}

function countOutside(
  rect: Rect,
  viewport: { width: number; height: number },
  outside: OutsideSummary
): void {
  if (rect.y + rect.h <= 0) outside.above++
  else if (rect.y >= viewport.height) outside.below++
  else if (rect.x + rect.w <= 0) outside.left++
  else if (rect.x >= viewport.width) outside.right++
  else outside.hidden++
}

function sameBox(a: Rect, b: Rect | null): boolean {
  if (!b) return false
  return (
    Math.abs(a.x - b.x) <= CONTAINER_TOLERANCE &&
    Math.abs(a.y - b.y) <= CONTAINER_TOLERANCE &&
    Math.abs(a.w - b.w) <= CONTAINER_TOLERANCE &&
    Math.abs(a.h - b.h) <= CONTAINER_TOLERANCE
  )
}

function estimateTokens(element: ProjectedElement): number {
  const payload = element.tag + element.role + element.type + element.name + element.text
  return 8 + Math.ceil(payload.length / 4)
}

function clamp(value: string, cap: number): string {
  const trimmed = value.replace(/\s+/g, ' ').trim()
  return trimmed.length > cap ? trimmed.slice(0, cap - 1) + '\u2026' : trimmed
}
