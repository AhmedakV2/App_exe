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
    chrome: '#1e1f22',
    swatch: ['#1e1f22', '#2f3237', '#ff7a29']
  },
  {
    id: 'gece',
    label: 'Gece Mavisi',
    note: 'Derin lacivert, açık mavi vurgu',
    chrome: '#10151f',
    swatch: ['#10151f', '#1f2c3e', '#4aa8ff']
  },
  {
    id: 'kagit',
    label: 'Kağıt',
    note: 'Açık zemin, indigo vurgu',
    chrome: '#e7e8ec',
    swatch: ['#e7e8ec', '#ffffff', '#3355e0']
  },
  {
    id: 'orman',
    label: 'Orman',
    note: 'Koyu yeşil yüzey, nane vurgu',
    chrome: '#14201a',
    swatch: ['#14201a', '#22382c', '#4fd18b']
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
