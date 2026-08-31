import { chunkOver } from './scheduler'
import type { Transport } from './Transport'
import type { GraphNode, Rect, Viewport } from './types'

const INTERACTIVE_TAGS = new Set([
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  'option',
  'label',
  'details',
  'video',
  'audio'
])

const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'checkbox',
  'radio',
  'tab',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'switch',
  'textbox',
  'combobox',
  'searchbox',
  'slider',
  'spinbutton',
  'listbox',
  'treeitem',
  'gridcell',
  'columnheader',
  'scrollbar'
])

const LISTENER_TYPES = new Set([
  'click',
  'mousedown',
  'mouseup',
  'keydown',
  'keyup',
  'pointerdown',
  'pointerup',
  'touchstart',
  'change',
  'input',
  'submit'
])

const OPAQUE_TAGS = new Set(['img', 'video', 'canvas', 'svg', 'iframe', 'embed', 'object'])

const CELL = 128

export function applyGeometry(node: GraphNode, vp: Viewport, margin: number): void {
  const style = node.style
  const rect = node.viewRect
  const opacity = Number(style['opacity'] === '' ? '1' : style['opacity'])
  const hidden =
    style['display'] === 'none' ||
    style['visibility'] === 'hidden' ||
    style['visibility'] === 'collapse' ||
    (Number.isFinite(opacity) && opacity === 0)

  node.visible = !!rect && rect.w >= 1 && rect.h >= 1 && !hidden && node.nodeType === 1
  node.inViewport =
    node.visible &&
    !!rect &&
    rect.x + rect.w > -margin &&
    rect.y + rect.h > -margin &&
    rect.x < vp.width + margin &&
    rect.y < vp.height + margin

  const overflowY = style['overflow-y']
  const overflowX = style['overflow-x']
  node.scrollable =
    overflowY === 'auto' || overflowY === 'scroll' || overflowX === 'auto' || overflowX === 'scroll'
}

export class OcclusionIndex {
  private readonly cells = new Map<string, GraphNode[]>()

  constructor(
    nodes: GraphNode[],
    private readonly lookup: Map<string, GraphNode>
  ) {
    for (const node of nodes) {
      if (!node.visible || !node.viewRect || !isCoverer(node)) continue
      for (const key of keysFor(node.viewRect)) {
        const bucket = this.cells.get(key)
        if (bucket) bucket.push(node)
        else this.cells.set(key, [node])
      }
    }
  }

  occludes(node: GraphNode): boolean {
    const rect = node.viewRect
    if (!rect) return false
    const cx = rect.x + rect.w / 2
    const cy = rect.y + rect.h / 2
    const bucket = this.cells.get(cellKey(cx, cy))
    if (!bucket) return false
    for (const other of bucket) {
      if (other.key === node.key) continue
      if (other.paintOrder <= node.paintOrder) continue
      const box = other.viewRect
      if (!box) continue
      if (cx < box.x || cx > box.x + box.w || cy < box.y || cy > box.y + box.h) continue
      if (isRelated(node, other, this.lookup)) continue
      return true
    }
    return false
  }
}

export async function applyOcclusion(
  nodes: GraphNode[],
  index: OcclusionIndex | null,
  budget: number
): Promise<{ checked: number; skipped: number }> {
  let checked = 0
  let skipped = 0

  if (!index || budget <= 0) {
    for (const node of nodes) {
      if (node.interactive && node.inViewport) skipped++
    }
    return { checked, skipped }
  }

  await chunkOver(nodes, (node) => {
    if (!node.interactive || !node.inViewport) return
    if (checked >= budget) {
      skipped++
      return
    }
    checked++
    node.occlusionChecked = true
    node.occluded = index.occludes(node)
  })
  return { checked, skipped }
}

export function applyInteractivity(node: GraphNode): void {
  if (node.nodeType !== 1) return
  const reasons: string[] = []
  const attrs = node.attrs
  const ax = node.ax
  const role = (attrs['role'] || ax?.role || '').toLowerCase()

  if (INTERACTIVE_TAGS.has(node.tag)) reasons.push('tag')
  if (INTERACTIVE_ROLES.has(role)) reasons.push('role')
  if (attrs['tabindex'] !== undefined && attrs['tabindex'] !== '-1') reasons.push('tabindex')
  if (attrs['contenteditable'] === '' || attrs['contenteditable'] === 'true')
    reasons.push('editable')
  if (attrs['onclick'] !== undefined) reasons.push('onclick')
  if (node.clickable) reasons.push('clickable')
  if (node.style['cursor'] === 'pointer') reasons.push('cursor')
  if (ax?.focusable) reasons.push('ax-focusable')
  if (node.scrollable) reasons.push('scrollable')

  const disabled = attrs['disabled'] !== undefined || ax?.disabled === true
  const inert = node.style['pointer-events'] === 'none'

  node.reasons = reasons
  node.interactive = reasons.length > 0 && !disabled && !inert
}

export function ambiguous(node: GraphNode): boolean {
  if (!node.visible || node.interactive) return false
  if (node.nodeType !== 1) return false
  if (INTERACTIVE_TAGS.has(node.tag)) return false
  return node.tag === 'div' || node.tag === 'span' || node.tag === 'li' || node.tag === 'td'
}

const PROBE_CONCURRENCY = 16

export const PROBE_GROUP = 'aft-listener-probe'

export async function probeListeners(
  tp: Transport,
  nodes: GraphNode[],
  budget: number
): Promise<{ probed: number; skipped: number }> {
  if (budget <= 0) return { probed: 0, skipped: nodes.length }

  const ordered = nodes
    .slice()
    .sort((a, b) => Number(b.inViewport) - Number(a.inViewport) || a.depth - b.depth)

  const selected = ordered.slice(0, Math.max(0, budget))
  const touched = new Set<string>()
  let probed = 0
  let skipped = ordered.length - selected.length

  for (let start = 0; start < selected.length; start += PROBE_CONCURRENCY) {
    const chunk = selected.slice(start, start + PROBE_CONCURRENCY)
    const outcomes = await Promise.all(
      chunk.map((node) => {
        touched.add(node.sessionId)
        return probeOne(tp, node)
      })
    )
    for (const outcome of outcomes) {
      if (outcome) probed++
      else skipped++
    }
  }

  for (const sessionId of touched) {
    await tp.trySend('Runtime.releaseObjectGroup', { objectGroup: PROBE_GROUP }, sessionId)
  }
  return { probed, skipped }
}

async function probeOne(tp: Transport, node: GraphNode): Promise<boolean> {
  const resolved = await tp.trySend<{ object?: { objectId?: string } }>(
    'DOM.resolveNode',
    { backendNodeId: node.backendNodeId, objectGroup: PROBE_GROUP },
    node.sessionId
  )
  const objectId = resolved?.object?.objectId
  if (!objectId) return false

  const listeners = await tp.trySend<{ listeners: { type: string }[] }>(
    'DOMDebugger.getEventListeners',
    { objectId, depth: 0 },
    node.sessionId
  )

  if ((listeners?.listeners ?? []).some((entry) => LISTENER_TYPES.has(entry.type))) {
    node.interactive = true
    node.reasons = node.reasons.concat('listener')
  }
  return true
}

function isCoverer(node: GraphNode): boolean {
  if (OPAQUE_TAGS.has(node.tag)) return true
  const background = node.style['background-color']
  if (!background) return false
  if (background === 'transparent') return false
  const alpha = alphaOf(background)
  return alpha > 0.5
}

function alphaOf(color: string): number {
  const match = /rgba?\(([^)]+)\)/.exec(color)
  if (!match) return 1
  const parts = match[1].split(',')
  if (parts.length < 4) return 1
  const alpha = Number(parts[3])
  return Number.isFinite(alpha) ? alpha : 1
}

function isRelated(a: GraphNode, b: GraphNode, lookup: Map<string, GraphNode>): boolean {
  return isAncestor(b, a, lookup) || isAncestor(a, b, lookup)
}

function isAncestor(
  maybeAncestor: GraphNode,
  node: GraphNode,
  lookup: Map<string, GraphNode>
): boolean {
  let cursor: GraphNode | undefined = node
  let guard = 0
  while (cursor && guard < 256) {
    if (cursor.key === maybeAncestor.key) return true
    cursor = cursor.parentKey ? lookup.get(cursor.parentKey) : undefined
    guard++
  }
  return false
}

function cellKey(x: number, y: number): string {
  return Math.floor(x / CELL) + ':' + Math.floor(y / CELL)
}

function keysFor(rect: Rect): string[] {
  const out: string[] = []
  const x0 = Math.floor(rect.x / CELL)
  const y0 = Math.floor(rect.y / CELL)
  const x1 = Math.floor((rect.x + rect.w) / CELL)
  const y1 = Math.floor((rect.y + rect.h) / CELL)
  const maxCells = 4096
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      out.push(x + ':' + y)
      if (out.length >= maxCells) return out
    }
  }
  return out
}
