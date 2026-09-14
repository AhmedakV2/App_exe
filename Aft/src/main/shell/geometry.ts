import { screen } from 'electron'
import type { BaseWindow, Rectangle } from 'electron'
import type { StageBox } from '../browser/types'

const FRAME = 40

const DEVTOOLS_MIN = 260

const DEVTOOLS_GAP = 6

export function visibleArea(win: BaseWindow): Rectangle {
  const bounds = win.getContentBounds()
  if (!win.isMaximized()) return { x: 0, y: 0, width: bounds.width, height: bounds.height }

  const work = screen.getDisplayMatching(bounds).workArea
  const left = Math.max(0, work.x - bounds.x)
  const top = Math.max(0, work.y - bounds.y)
  const right = Math.max(0, bounds.x + bounds.width - (work.x + work.width))
  const bottom = Math.max(0, bounds.y + bounds.height - (work.y + work.height))

  return {
    x: left,
    y: top,
    width: Math.max(0, bounds.width - left - right),
    height: Math.max(0, bounds.height - top - bottom)
  }
}

export function stageBounds(area: Rectangle, box: StageBox | null): Rectangle {
  if (!box) {
    return {
      x: area.x + FRAME,
      y: area.y + FRAME,
      width: Math.max(0, area.width - FRAME * 2),
      height: Math.max(0, area.height - FRAME * 2)
    }
  }

  const x = area.x + Math.round(box.x * area.width)
  const y = area.y + Math.round(box.y * area.height)
  const width = Math.round(box.width * area.width)
  const height = Math.round(box.height * area.height)

  return {
    x,
    y,
    width: Math.max(0, Math.min(width, area.x + area.width - x)),
    height: Math.max(0, Math.min(height, area.y + area.height - y))
  }
}

export function splitStage(stage: Rectangle, ratio: number): { page: Rectangle; panel: Rectangle } {
  const panelWidth = Math.min(
    Math.max(DEVTOOLS_MIN, Math.round(stage.width * ratio)),
    Math.max(0, stage.width - DEVTOOLS_MIN - DEVTOOLS_GAP)
  )
  const pageWidth = Math.max(0, stage.width - panelWidth - DEVTOOLS_GAP)

  return {
    page: { x: stage.x, y: stage.y, width: pageWidth, height: stage.height },
    panel: {
      x: stage.x + pageWidth + DEVTOOLS_GAP,
      y: stage.y,
      width: panelWidth,
      height: stage.height
    }
  }
}

export function readBox(value: unknown): StageBox | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const x = Number(raw.x)
  const y = Number(raw.y)
  const width = Number(raw.width)
  const height = Number(raw.height)

  if (![x, y, width, height].every((part) => Number.isFinite(part))) return null
  if (width <= 0 || height <= 0) return null

  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
    width: Math.min(1, Math.max(0, width)),
    height: Math.min(1, Math.max(0, height))
  }
}

export function sameBox(a: StageBox | null, b: StageBox): boolean {
  if (!a) return false
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}
