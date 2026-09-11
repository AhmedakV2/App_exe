import type { Point, Rect, Viewport } from '../discovery'

export const PROBE_STEPS: Point[] = [
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

export function centerOf(rect: Rect): Point {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
