export type ThemeId = 'dark' | 'light'

interface Theme {
  id: ThemeId
  label: string
  note: string
  chrome: string
  swatch: [string, string, string]
}

export const THEMES: Theme[] = [
  {
    id: 'dark',
    label: 'Karanlık',
    note: 'Google Material karanlık paleti',
    chrome: '#131314',
    swatch: ['#131314', '#1e1f20', '#a8c7fa']
  },
  {
    id: 'light',
    label: 'Aydınlık',
    note: 'Google Material aydınlık paleti',
    chrome: '#f0f4f9',
    swatch: ['#f0f4f9', '#ffffff', '#0b57d0']
  }
]

const DEFAULT_THEME: ThemeId = 'dark'

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
  document.documentElement.style.colorScheme = id === 'light' ? 'light' : 'dark'
}
