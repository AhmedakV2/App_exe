import type { AgentAction } from '../../main/browser/types'
import { toUrl } from './format'

export type Entry = { key: string; usage: string; hint: string }
export type ActionEntry = Entry & { build: (args: string[]) => AgentAction | null }

function num(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export const ACTIONS: ActionEntry[] = [
  {
    key: 'go',
    usage: 'go <adres>',
    hint: 'Verilen adrese gider',
    build: (a) => (a[0] ? { action: 'go_to_url', url: toUrl(a.join(' ')) } : null)
  },
  {
    key: 'click',
    usage: 'click <no>',
    hint: 'Öğeye tıklar',
    build: (a) => {
      const index = num(a[0])
      return index === null ? null : { action: 'click', index }
    }
  },
  {
    key: 'dbclick',
    usage: 'dbclick <no>',
    hint: 'Öğeye çift tıklar',
    build: (a) => {
      const index = num(a[0])
      return index === null ? null : { action: 'double_click', index }
    }
  },
  {
    key: 'rclick',
    usage: 'rclick <no>',
    hint: 'Öğeye sağ tıklar',
    build: (a) => {
      const index = num(a[0])
      return index === null ? null : { action: 'right_click', index }
    }
  },
  {
    key: 'type',
    usage: 'type <no> <metin>',
    hint: 'Alana metin yazar',
    build: (a) => {
      const index = num(a[0])
      const text = a.slice(1).join(' ')
      return index === null || !text ? null : { action: 'type', index, text }
    }
  },
  {
    key: 'clear',
    usage: 'clear <no>',
    hint: 'Alanı temizler',
    build: (a) => {
      const index = num(a[0])
      return index === null ? null : { action: 'clear_type', index }
    }
  },
  {
    key: 'move',
    usage: 'move <no> [ms]',
    hint: 'İmleci öğenin üzerine taşır',
    build: (a) => {
      const index = num(a[0])
      const waitMs = num(a[1])
      if (index === null) return null
      return waitMs === null
        ? { action: 'mouse_move', index }
        : { action: 'mouse_move', index, waitMs }
    }
  },
  {
    key: 'scroll',
    usage: 'scroll <piksel>',
    hint: 'Sayfayı dikey kaydırır',
    build: (a) => {
      const deltaY = num(a[0])
      return deltaY === null ? null : { action: 'scroll', deltaY }
    }
  },
  {
    key: 'snap',
    usage: 'snap',
    hint: 'Sayfayı yeniden tarar',
    build: () => ({ action: 'snapshot' })
  },
  {
    key: 'press',
    usage: 'press [no] <tuş>',
    hint: 'Tuşa basar',
    build: (a) => {
      if (a.length >= 2) {
        const index = num(a[0])
        return index === null || !a[1] ? null : { action: 'press_key', index, key: a[1] }
      }
      return a[0] ? { action: 'press_key', key: a[0] } : null
    }
  },
  {
    key: 'sel',
    usage: 'sel <no> <değer>',
    hint: 'Açılır listeden seçer',
    build: (a) => {
      const index = num(a[0])
      const optionValue = a.slice(1).join(' ')
      return index === null || !optionValue ? null : { action: 'select_option', index, optionValue }
    }
  },
  {
    key: 'upload',
    usage: 'upload <no> <dosya...>',
    hint: 'Dosya yükler',
    build: (a) => {
      const index = num(a[0])
      const files = a.slice(1).filter(Boolean)
      return index === null || !files.length ? null : { action: 'upload', index, files }
    }
  },
  {
    key: 'wait',
    usage: 'wait [ms]',
    hint: 'Verilen süre kadar bekler',
    build: (a) => {
      const waitMs = num(a[0])
      return waitMs === null ? { action: 'wait' } : { action: 'wait', waitMs }
    }
  },
  {
    key: 'r',
    usage: 'r',
    hint: 'Sayfayı yeniler',
    build: () => ({ action: 'refresh' })
  }
]

export const BUILTINS: Entry[] = [
  { key: 'a', usage: 'a', hint: 'Komut listesini yazdırır' },
  { key: 'c', usage: 'c', hint: 'Terminal geçmişini temizler' }
]

export const PALETTE: Entry[] = [...ACTIONS, ...BUILTINS]
export const ACTION_MAP = new Map(ACTIONS.map((entry) => [entry.key, entry]))
export const PALETTE_KEYS = new Set(PALETTE.map((entry) => entry.key))
