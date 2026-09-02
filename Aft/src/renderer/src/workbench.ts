import type { ScenarioStep, StepKind } from '../../main/scenario/types'

export type TabKind =
  'browser' | 'overview' | 'scenario' | 'results' | 'identity' | 'coverage' | 'data'

export interface Tab {
  id: string
  kind: TabKind
  label: string
  scenarioId: string
}

export type Activity = 'files' | 'browser' | 'runs' | 'identity' | 'coverage' | 'data'

export type RightTab = 'record' | 'playback' | 'elements'

export type BottomTab = 'console' | 'problems'

export interface OutlineItem {
  id: string
  title: string
  kind: StepKind
  depth: number
  number: string
}

export const BROWSER_TAB: Tab = {
  id: 'browser',
  kind: 'browser',
  label: 'Tarayıcı',
  scenarioId: ''
}

export const FIXED_TABS: Record<Exclude<TabKind, 'browser' | 'scenario'>, Tab> = {
  overview: { id: 'overview', kind: 'overview', label: 'Genel bakış', scenarioId: '' },
  results: { id: 'results', kind: 'results', label: 'Koşumlar', scenarioId: '' },
  identity: { id: 'identity', kind: 'identity', label: 'Kimlik', scenarioId: '' },
  coverage: { id: 'coverage', kind: 'coverage', label: 'Kapsam', scenarioId: '' },
  data: { id: 'data', kind: 'data', label: 'Veri', scenarioId: '' }
}

export const TAB_GLYPH: Record<TabKind, string> = {
  browser: 'globe',
  overview: 'dash',
  scenario: 'file',
  results: 'run',
  identity: 'pulse',
  coverage: 'radar',
  data: 'database'
}

export const KIND_GLYPH: Record<string, string> = {
  click: 'cursor',
  'double-click': 'cursor',
  'right-click': 'cursor',
  hover: 'cursor',
  type: 'edit',
  'clear-type': 'edit',
  'press-key': 'edit',
  scroll: 'down',
  'select-option': 'sliders',
  upload: 'file',
  navigate: 'globe',
  wait: 'clock',
  assert: 'shield',
  group: 'folder'
}

export function scenarioTab(id: string, label: string): Tab {
  return {
    id: 'scenario:' + (id || 'new'),
    kind: 'scenario',
    label: label || 'Yeni senaryo',
    scenarioId: id
  }
}

export function outlineOf(steps: ScenarioStep[], depth = 0, prefix = ''): OutlineItem[] {
  const out: OutlineItem[] = []
  steps.forEach((step, index) => {
    const number = prefix + String(index + 1)
    out.push({ id: step.id, title: step.title, kind: step.kind, depth, number })
    if (step.steps.length) out.push(...outlineOf(step.steps, depth + 1, number + '.'))
  })
  return out
}

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    return
  }
}
