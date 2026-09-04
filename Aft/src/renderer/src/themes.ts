export type ThemeId = 'grafit' | 'gece' | 'kagit' | 'orman'

export interface Theme {
  id: ThemeId
  label: string
  note: string
  chrome: string
  swatch: [string, string, string]
}

export const THEMES: Theme[] = [
  {
    id: 'grafit',
    label: 'Grafit',
    note: 'Koyu gri yüzey, turuncu vurgu',
    chrome: '#101114',
    swatch: ['#101114', '#23262c', '#ff7a29']
  },
  {
    id: 'gece',
    label: 'Gece Mavisi',
    note: 'Derin lacivert, gök mavisi vurgu',
    chrome: '#080b12',
    swatch: ['#080b12', '#131a26', '#38bdf8']
  },
  {
    id: 'kagit',
    label: 'Kağıt',
    note: 'Açık zemin, indigo vurgu',
    chrome: '#f4f4f5',
    swatch: ['#f4f4f5', '#ffffff', '#2563eb']
  },
  {
    id: 'orman',
    label: 'Orman',
    note: 'Koyu yeşil yüzey, zümrüt vurgu',
    chrome: '#070f0b',
    swatch: ['#070f0b', '#111c16', '#10b981']
  }
]

export const DEFAULT_THEME: ThemeId = 'grafit'

const STORAGE_KEY = 'aft:theme'

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value)
}

export function readTheme(): ThemeId {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isThemeId(stored) ? stored : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

export function storeTheme(id: ThemeId): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, id)
  } catch {
    return
  }
}

export function themeOf(id: ThemeId): Theme {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0]
}

export function paintTheme(id: ThemeId): void {
  document.documentElement.dataset.theme = id
  document.documentElement.style.colorScheme = id === 'kagit' ? 'light' : 'dark'
}
