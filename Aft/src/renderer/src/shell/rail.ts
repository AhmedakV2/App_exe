import type { RailItemPref } from '../../../main/browser/types'
import { NAV } from './nav'
import type { NavItem } from './nav'
import { PAGE_IDS } from './prefs'
import type { PageId } from './prefs'

export interface RailItem {
  id: PageId
  hidden: boolean
  shortcut: string
}

export interface RailEntry extends RailItem {
  nav: NavItem
}

export const RAIL_KEY = 'aft:rail'

export const SHORTCUTS: string[] = [
  '',
  'Ctrl+1',
  'Ctrl+2',
  'Ctrl+3',
  'Ctrl+4',
  'Ctrl+5',
  'Ctrl+6',
  'Ctrl+7',
  'Ctrl+8',
  'Ctrl+9',
  'Alt+1',
  'Alt+2',
  'Alt+3',
  'Alt+4',
  'Alt+5',
  'Alt+6',
  'Alt+7',
  'Alt+8',
  'Alt+9'
]

const NAV_BY_ID = new Map<PageId, NavItem>(NAV.map((item) => [item.id, item]))

function isPageId(value: unknown): value is PageId {
  return typeof value === 'string' && PAGE_IDS.includes(value as PageId)
}

function defaultShortcut(index: number): string {
  return index < 9 ? 'Ctrl+' + (index + 1) : ''
}

export function defaultRail(): RailItem[] {
  return NAV.map((item, index) => ({
    id: item.id,
    hidden: false,
    shortcut: defaultShortcut(index)
  }))
}

export function normalizeRail(raw: unknown): RailItem[] {
  if (!Array.isArray(raw)) return defaultRail()

  const seen = new Set<PageId>()
  const used = new Set<string>()
  const items: RailItem[] = []

  for (const value of raw) {
    if (!value || typeof value !== 'object') continue
    const source = value as Partial<RailItemPref>
    if (!isPageId(source.id) || seen.has(source.id)) continue

    const shortcut =
      typeof source.shortcut === 'string' &&
      SHORTCUTS.includes(source.shortcut) &&
      !used.has(source.shortcut)
        ? source.shortcut
        : ''

    if (shortcut) used.add(shortcut)
    seen.add(source.id)
    items.push({ id: source.id, hidden: source.hidden === true, shortcut })
  }

  for (const item of defaultRail()) {
    if (seen.has(item.id)) continue
    const shortcut = used.has(item.shortcut) ? '' : item.shortcut
    if (shortcut) used.add(shortcut)
    items.push({ ...item, shortcut })
  }

  return items
}

export function readRail(): RailItem[] {
  try {
    const raw = window.localStorage.getItem(RAIL_KEY)
    return normalizeRail(raw ? JSON.parse(raw) : null)
  } catch {
    return defaultRail()
  }
}

export function storeRail(items: RailItem[]): void {
  try {
    window.localStorage.setItem(RAIL_KEY, JSON.stringify(items))
  } catch {
    return
  }
}

export function railEntries(items: RailItem[]): RailEntry[] {
  return items.flatMap((item) => {
    const nav = NAV_BY_ID.get(item.id)
    return nav ? [{ ...item, nav }] : []
  })
}

export function moveRail(items: RailItem[], id: PageId, offset: number): RailItem[] {
  const from = items.findIndex((item) => item.id === id)
  const to = from + offset
  if (from < 0 || to < 0 || to >= items.length) return items

  const next = items.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

export function toggleRail(items: RailItem[], id: PageId): RailItem[] {
  const visible = items.filter((item) => !item.hidden).length
  return items.map((item) => {
    if (item.id !== id) return item
    if (!item.hidden && visible <= 1) return item
    return { ...item, hidden: !item.hidden }
  })
}

export function assignShortcut(items: RailItem[], id: PageId, shortcut: string): RailItem[] {
  const value = SHORTCUTS.includes(shortcut) ? shortcut : ''
  return items.map((item) => {
    if (item.id === id) return { ...item, shortcut: value }
    if (value && item.shortcut === value) return { ...item, shortcut: '' }
    return item
  })
}

export function matchShortcut(event: KeyboardEvent): string {
  if (event.metaKey || !/^[1-9]$/.test(event.key)) return ''
  if (event.ctrlKey && !event.altKey) return 'Ctrl+' + event.key
  if (event.altKey && !event.ctrlKey) return 'Alt+' + event.key
  return ''
}
