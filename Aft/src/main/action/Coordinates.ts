import type { Point, Rect, Viewport } from '../discovery'

const PROBE_STEPS: Point[] = [
  { x: 0.5, y: 0.5 },
  { x: 0.5, y: 0.3 },
  { x: 0.5, y: 0.7 },
  { x: 0.3, y: 0.5 },
  { x: 0.7, y: 0.5 },
  { x: 0.3, y: 0.3 },
  { x: 0.7, y: 0.3 },
  { x: 0.3, y: 0.7 },
  { x: 0.7, y: 0.7 }
]
const EDGE_INSET = 2

export interface ViewBounds {
  x: number
  y: number
  width: number
  height: number
}
export function docToView(rect: Rect, scroll: Point, frameOffset: Point): Rect {
  return {
    x: rect.x + scroll.x - frameOffset.x,
    y: rect.y + scroll.y - frameOffset.y,
    w: rect.w,
    h: rect.h
  }
}
export function viewToDoc(rect: Rect, scroll: Point, frameOffset: Point): Rect {
  return {
    x: rect.x + scroll.x - frameOffset.x,
    y: rect.y + scroll.y - frameOffset.y,
    w: rect.w,
    h: rect.h
  }
}
export function viewToScreen(point: Point, bounds: ViewBounds, dpr: number): Point {
  return {
    x: Math.round((bounds.x + point.x) * dpr),
    y: Math.round((bounds.y + point.y) * dpr)
  }
}
export function centerOf(rect: Rect): Point {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }
}
export function probePoints(rect: Rect): Point[] {
  const out: Point[] = []
  for (const step of PROBE_STEPS) {
    const point = {
      x: clamp(rect.x + rect.w * step.x, rect.x + EDGE_INSET, rect.x + rect.w - EDGE_INSET),
      y: clamp(rect.y + rect.h * step.y, rect.y + EDGE_INSET, rect.y + rect.h - EDGE_INSET)
    }
    out.push({ x: round(point.x), y: round(point.y) })
  }
  return out
}
export function insideViewport(rect: Rect, viewport: Viewport, margin = 0): boolean {
  return (
    rect.x >= -margin &&
    rect.y >= -margin &&
    rect.x + rect.w <= viewport.width + margin &&
    rect.y + rect.h <= viewport.height + margin
  )
}
export function scrollDelta(rect: Rect, viewport: Viewport): Point {
  const center = centerOf(rect)
  const wantedY = viewport.height / 2
  const wantedX = viewport.width / 2
  return {
    x: insideHorizontally(rect, viewport) ? 0 : round(center.x - wantedX),
    y: insideVertically(rect, viewport) ? 0 : round(center.y - wantedY)
  }
}
export function sameRect(a: Rect | null, b: Rect | null, tolerance: number): boolean {
  if (!a || !b) return false
  return (
    Math.abs(a.x - b.x) <= tolerance &&
    Math.abs(a.y - b.y) <= tolerance &&
    Math.abs(a.w - b.w) <= tolerance &&
    Math.abs(a.h - b.h) <= tolerance
  )
}
export function clampPoint(point: Point, viewport: Viewport): Point {
  return {
    x: round(clamp(point.x, 1, Math.max(1, viewport.width - 1))),
    y: round(clamp(point.y, 1, Math.max(1, viewport.height - 1)))
  }
}
function insideVertically(rect: Rect, viewport: Viewport): boolean {
  return rect.y >= 0 && rect.y + rect.h <= viewport.height
}

function insideHorizontally(rect: Rect, viewport: Viewport): boolean {
  return rect.x >= 0 && rect.x + rect.w <= viewport.width
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

