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
    chrome: '#20242b',
    swatch: ['#15171c', '#272c35', '#ff7a29']
  },
  {
    id: 'gece',
    label: 'Gece Mavisi',
    note: 'Derin lacivert, açık mavi vurgu',
    chrome: '#151f30',
    swatch: ['#0b111b', '#1c2839', '#4aa8ff']
  },
  {
    id: 'kagit',
    label: 'Kağıt',
    note: 'Açık zemin, indigo vurgu',
    chrome: '#eef0f3',
    swatch: ['#ffffff', '#e4e7ec', '#3355e0']
  },
  {
    id: 'orman',
    label: 'Orman',
    note: 'Koyu yeşil yüzey, nane vurgu',
    chrome: '#15221a',
    swatch: ['#0a130e', '#1c2c22', '#4fd18b']
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
