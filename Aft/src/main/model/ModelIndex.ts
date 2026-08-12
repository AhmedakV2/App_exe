import type { Rect } from '../discovery/'
import {
  TEST_ATTRIBUTES,
  type BlindSpotModel,
  type ElementModel,
  type FrameModel,
  type GraphSnapshot
} from './schema'

const ANCESTOR_LIMIT = 64

const NEIGHBOUR_LIMIT = 24

const GRID_CELL = 128

export class ModelIndex {
  private readonly byRef = new Map<string, ElementModel>()
  private readonly byOrdinal = new Map<number, ElementModel>()
  private readonly byFrame = new Map<string, FrameModel>()
  private readonly byAttrValue = new Map<string, ElementModel[]>()
  private readonly byNormalizedText = new Map<string, ElementModel[]>()
  private readonly byAccessibleName = new Map<string, ElementModel[]>()
  private readonly bySignature = new Map<string, ElementModel[]>()
  private readonly byTagName = new Map<string, ElementModel[]>()
  private readonly byCell = new Map<string, ElementModel[]>()
  private readonly typeRank = new Map<string, number>()
  private readonly addressableList: ElementModel[] = []
  private readonly elementList: ElementModel[] = []
  private readonly interactiveList: ElementModel[] = []

  constructor(readonly snapshot: GraphSnapshot) {
    for (const frame of snapshot.frames) this.byFrame.set(frame.frameId, frame)

    for (const element of snapshot.elements) {
      this.byRef.set(element.identity.ref, element)
      if (element.interactivity.interactive) this.interactiveList.push(element)
      if (element.identity.ordinal >= 0) {
        this.byOrdinal.set(element.identity.ordinal, element)
        this.addressableList.push(element)
        this.indexCell(element)
      }
      if (element.nodeType !== 1) continue
      this.elementList.push(element)
      this.indexAttributes(element)
      this.indexText(element)
      push(this.byTagName, element.tag, element)
      push(this.bySignature, element.identity.signature, element)
    }

    this.addressableList.sort((a, b) => a.identity.ordinal - b.identity.ordinal)
  }

  get modelVersion(): string {
    return this.snapshot.modelVersion
  }

  get url(): string {
    return this.snapshot.origin.url
  }

  get viewportSize(): { width: number; height: number } {
    return { width: this.snapshot.viewport.width, height: this.snapshot.viewport.height }
  }

  elements(): readonly ElementModel[] {
    return this.elementList
  }

  addressable(): readonly ElementModel[] {
    return this.addressableList
  }

  interactive(): readonly ElementModel[] {
    return this.interactiveList
  }

  blindSpots(): BlindSpotModel[] {
    return this.snapshot.blindSpots.slice()
  }

  get(ref: string): ElementModel | undefined {
    return this.byRef.get(ref)
  }

  at(ordinal: number): ElementModel | undefined {
    return this.byOrdinal.get(ordinal)
  }

  frame(frameId: string): FrameModel | undefined {
    return this.byFrame.get(frameId)
  }

  parent(element: ElementModel): ElementModel | undefined {
    return element.parentRef ? this.byRef.get(element.parentRef) : undefined
  }

  children(element: ElementModel): ElementModel[] {
    const out: ElementModel[] = []
    for (const ref of element.childRefs) {
      const child = this.byRef.get(ref)
      if (child) out.push(child)
    }
    return out
  }

  ancestors(element: ElementModel, limit = ANCESTOR_LIMIT): ElementModel[] {
    const out: ElementModel[] = []
    let cursor = this.parent(element)
    while (cursor && out.length < limit) {
      out.push(cursor)
      cursor = this.parent(cursor)
    }
    return out
  }

  siblings(element: ElementModel): ElementModel[] {
    const parent = this.parent(element)
    if (!parent) return []
    return this.children(parent).filter((child) => child.identity.ref !== element.identity.ref)
  }

  descendants(element: ElementModel, limit = 512): ElementModel[] {
    const out: ElementModel[] = []
    const stack = this.children(element)
    while (stack.length && out.length < limit) {
      const current = stack.pop()
      if (!current) break
      out.push(current)
      for (const child of this.children(current)) stack.push(child)
    }
    return out
  }

  indexInParent(element: ElementModel): number {
    const parent = this.parent(element)
    if (!parent) return 0
    return Math.max(0, parent.childRefs.indexOf(element.identity.ref))
  }

  typeOrdinal(element: ElementModel): number {
    const cached = this.typeRank.get(element.identity.ref)
    if (cached !== undefined) return cached

    const parent = this.parent(element)
    if (!parent) return 1

    const counters = new Map<string, number>()
    for (const child of this.children(parent)) {
      const next = (counters.get(child.tag) ?? 0) + 1
      counters.set(child.tag, next)
      this.typeRank.set(child.identity.ref, next)
    }
    return this.typeRank.get(element.identity.ref) ?? 1
  }

  closestForm(element: ElementModel): ElementModel | undefined {
    return this.ancestors(element, 32).find((node) => node.tag === 'form')
  }

  testAttribute(element: ElementModel): { name: string; value: string } | null {
    for (const name of TEST_ATTRIBUTES) {
      const value = element.attrs[name]
      if (value) return { name, value }
    }
    return null
  }

  byAttr(name: string, value: string): ElementModel[] {
    return this.byAttrValue.get(attrKey(name, value)) ?? []
  }

  byText(normalized: string): ElementModel[] {
    return this.byNormalizedText.get(normalized) ?? []
  }

  byName(normalized: string): ElementModel[] {
    return this.byAccessibleName.get(normalized) ?? []
  }

  bySignatureToken(signature: string): ElementModel[] {
    return this.bySignature.get(signature) ?? []
  }

  byTag(tag: string): ElementModel[] {
    return this.byTagName.get(tag) ?? []
  }

  near(element: ElementModel, radius: number, limit = NEIGHBOUR_LIMIT): ElementModel[] {
    const anchor = element.geometry.viewport
    if (!anchor) return []

    const scored: { element: ElementModel; distance: number }[] = []
    const seen = new Set<string>([element.identity.ref])

    for (const cell of cellsFor(anchor, radius)) {
      const bucket = this.byCell.get(cell)
      if (!bucket) continue
      for (const candidate of bucket) {
        const ref = candidate.identity.ref
        if (seen.has(ref)) continue
        seen.add(ref)
        const rect = candidate.geometry.viewport
        if (!rect) continue
        const distance = gap(anchor, rect)
        if (distance > radius) continue
        scored.push({ element: candidate, distance })
      }
    }

    scored.sort(
      (a, b) => a.distance - b.distance || a.element.identity.ordinal - b.element.identity.ordinal
    )
    return scored.slice(0, limit).map((entry) => entry.element)
  }

  query(predicate: (element: ElementModel) => boolean): ElementModel[] {
    return this.snapshot.elements.filter(predicate)
  }

  private indexCell(element: ElementModel): void {
    const rect = element.geometry.viewport
    if (!rect) return
    for (const cell of cellsFor(rect, 0)) push(this.byCell, cell, element)
  }

  private indexAttributes(element: ElementModel): void {
    for (const [name, value] of Object.entries(element.attrs)) {
      if (!value) continue
      push(this.byAttrValue, attrKey(name, value), element)
    }
  }

  private indexText(element: ElementModel): void {
    const text = normalize(element.text)
    if (text) push(this.byNormalizedText, text, element)

    const name = normalize(element.accessibility?.name ?? element.attrs['aria-label'] ?? '')
    if (name) push(this.byAccessibleName, name, element)
  }
}

function attrKey(name: string, value: string): string {
  return name.toLowerCase() + '\u0001' + value
}

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

function push(map: Map<string, ElementModel[]>, key: string, element: ElementModel): void {
  const bucket = map.get(key)
  if (bucket) bucket.push(element)
  else map.set(key, [element])
}

function cellsFor(rect: Rect, margin: number): string[] {
  const out: string[] = []
  const x0 = Math.floor((rect.x - margin) / GRID_CELL)
  const y0 = Math.floor((rect.y - margin) / GRID_CELL)
  const x1 = Math.floor((rect.x + rect.w + margin) / GRID_CELL)
  const y1 = Math.floor((rect.y + rect.h + margin) / GRID_CELL)
  const limit = 4096

  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      out.push(x + ':' + y)
      if (out.length >= limit) return out
    }
  }
  return out
}

function gap(a: Rect, b: Rect): number {
  const dx = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)))
  const dy = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)))
  return Math.sqrt(dx * dx + dy * dy)
}
