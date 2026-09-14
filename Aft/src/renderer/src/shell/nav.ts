import type { PageId } from './prefs'

export type NavItem = { id: PageId; label: string; glyph: string; suite?: boolean }

export const NAV_ICON = 22

export const NAV: NavItem[] = [
  { id: 'browser', label: 'Tarayıcı', glyph: 'globe' },
  { id: 'browser', label: 'Kayıt ve oynatma', glyph: 'suite', suite: true },
  { id: 'scenarios', label: 'Senaryolar', glyph: 'library' },
  { id: 'results', label: 'Sonuçlar', glyph: 'history' },
  { id: 'stats', label: 'İstatistik', glyph: 'spark' },
  { id: 'identity', label: 'Kimlik', glyph: 'pulse' },
  { id: 'coverage', label: 'Kapsam', glyph: 'radar' },
  { id: 'data', label: 'Veri', glyph: 'database' }
]

export const PAGE_LABELS: Record<PageId, string> = {
  browser: 'Tarayıcı',
  scenarios: 'Senaryolar',
  results: 'Sonuçlar',
  stats: 'İstatistik',
  identity: 'Kimlik',
  coverage: 'Kapsam',
  data: 'Veri'
}
