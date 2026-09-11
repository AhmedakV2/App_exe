import type { DockTab } from '../pages/BrowserPage'
import type { StageBox } from '../../../main/browser/types'

export const PAGE_IDS = [
  'browser',
  'scenarios',
  'results',
  'stats',
  'identity',
  'coverage',
  'data'
] as const

export type PageId = (typeof PAGE_IDS)[number]

export const LIST_KEY = 'aft:list-width'
export const TERM_KEY = 'aft:term-height'
export const DOCK_KEY = 'aft:dock-width'
export const DEV_KEY = 'aft:devtools-width'
export const DOCK_TAB_KEY = 'aft:dock-tab'
export const PAGE_KEY = 'aft:page'
export const AUTO_TERM_KEY = 'aft:auto-terminal'
export const AUTO_BACK_KEY = 'aft:auto-terminal-restore'
export const SHOT_KEY = 'aft:play-screenshot'
export const STOP_KEY = 'aft:play-stop'
export const STATE_KEY = 'aft:play-verify'

export const LIST_SIZE = 300
export const TERM_SIZE = 268
export const DOCK_SIZE = 380
export const DEV_SIZE = 520
export const LIST_MIN = 220
export const TERM_MIN = 120
export const DOCK_MIN = 300
export const DEV_MIN = 260
export const LIST_MAX_RATIO = 0.5
export const TERM_MAX_RATIO = 0.72
export const DOCK_MAX_RATIO = 0.62
export const DEV_MAX_RATIO = 0.8

export function sameBox(a: StageBox | null, b: StageBox): boolean {
  if (!a) return false
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

export function part(value: number, total: number): number {
  if (!total) return 0
  return Math.round((value / total) * 10000) / 10000
}

export function readSize(key: string, fallback: number): number {
  try {
    const raw = Number(window.localStorage.getItem(key))
    return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : fallback
  } catch {
    return fallback
  }
}

export function storeSize(key: string, value: number): void {
  try {
    window.localStorage.setItem(key, String(Math.round(value)))
  } catch {
    return
  }
}

export function readFlag(key: string, fallback: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === '1') return true
    if (raw === '0') return false
    return fallback
  } catch {
    return fallback
  }
}

export function storeFlag(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, value ? '1' : '0')
  } catch {
    return
  }
}

export function readPage(): PageId {
  try {
    const raw = window.localStorage.getItem(PAGE_KEY)
    return isPageId(raw) ? raw : 'browser'
  } catch {
    return 'browser'
  }
}

export function readDock(): DockTab {
  try {
    const raw = window.localStorage.getItem(DOCK_TAB_KEY)
    return raw === 'record' || raw === 'playback' ? raw : null
  } catch {
    return null
  }
}

function isPageId(value: unknown): value is PageId {
  return typeof value === 'string' && PAGE_IDS.includes(value as PageId)
}
