import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AgentAction,
  BrowserState,
  DragAxis,
  ExecuteResult,
  NavKind,
  StageBox,
  WindowAction
} from '../../main/browser/types'
import { THEMES, paintTheme, readTheme, storeTheme, themeOf } from './themes'
import type { ThemeId } from './themes'
import { Glyph, IconButton } from './icons'
import RecordPanel from './RecordPanel'
import PlaybackPanel from './PlaybackPanel'

type LineKind = 'in' | 'ok' | 'err' | 'note'
type Fact = { label: string; ok: boolean }
type Line = {
  id: number
  kind: LineKind
  text: string
  time: string
  ms?: number
  facts?: Fact[]
  detail?: string[]
}
type Extra = { ms?: number; facts?: Fact[]; detail?: string[] }
type DockTab = 'record' | 'playback' | null
type Entry = { key: string; usage: string; hint: string }
type ActionEntry = Entry & { build: (args: string[]) => AgentAction | null }

const MAX_LINES = 400
const PIN_SLACK = 48
const MAX_SUGGESTIONS = 6

const CHAT_KEY = 'aft:chat-width'
const TERM_KEY = 'aft:term-height'
const REC_KEY = 'aft:rec-width'
const CHAT_SIZE = 320
const TERM_SIZE = 268
const REC_SIZE = 372
const CHAT_MIN = 220
const TERM_MIN = 120
const REC_MIN = 300
const CHAT_MAX_RATIO = 0.6
const TERM_MAX_RATIO = 0.72
const REC_MAX_RATIO = 0.62

const ROLES: Record<LineKind, { label: string; glyph: string }> = {
  in: { label: 'Komut', glyph: 'prompt' },
  ok: { label: 'Tamamlandı', glyph: 'check' },
  err: { label: 'Yapılamadı', glyph: 'alert' },
  note: { label: 'Bilgi', glyph: 'info' }
}

const SHORTCUTS: { name: string; code: string }[] = [
  { name: 'Terminali aç / kapat', code: 'Ctrl + K' },
  { name: 'Adres çubuğuna geç', code: 'Ctrl + L' },
  { name: 'Tam ekran', code: 'F11' },
  { name: 'Komut geçmişi', code: '↑ / ↓' }
]

function num(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const ACTIONS: ActionEntry[] = [
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
    usage: 'move <no>',
    hint: 'İmleci öğenin üzerine taşır',
    build: (a) => {
      const index = num(a[0])
      return index === null ? null : { action: 'mouse_move', index }
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
    hint: 'Tuşa basar, Ctrl+A gibi bileşimleri de kabul eder',
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
    usage: 'wait',
    hint: 'Sayfanın durulmasını bekler',
    build: () => ({ action: 'wait' })
  }
]

const BUILTINS: Entry[] = [
  { key: 'a', usage: 'a', hint: 'Komut listesini yazdırır' },
  { key: 'cls', usage: 'cls', hint: 'Terminal geçmişini temizler' },
  { key: 'rec', usage: 'rec', hint: 'Kayıt panelini açar veya kapatır' },
  { key: 'oyn', usage: 'oyn', hint: 'Oynatma panelini açar veya kapatır' }
]

const PALETTE: Entry[] = [...ACTIONS, ...BUILTINS]
const ACTION_MAP = new Map(ACTIONS.map((entry) => [entry.key, entry]))
const PALETTE_KEYS = new Set(PALETTE.map((entry) => entry.key))

function toUrl(input: string): string {
  const text = input.trim()
  if (!text) return ''
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return text
  if (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/|$)/i.test(text)) return 'http://' + text
  if (/^[^\s/?#]+\.[^\s/?#]{2,}/.test(text)) return 'https://' + text
  return 'https://www.google.com/search?q=' + encodeURIComponent(text)
}

function shortUrl(raw: string): string {
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    const path = parsed.pathname === '/' ? '' : parsed.pathname
    return parsed.host + path + parsed.search
  } catch {
    return raw
  }
}

function stamp(): string {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  return pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds())
}

function formatMs(ms: number): string {
  if (ms < 1000) return ms + ' ms'
  return (ms / 1000).toFixed(1).replace('.', ',') + ' sn'
}

function readOutcome(result: ExecuteResult): Extra {
  const outcome = result.outcome
  if (!outcome) return {}

  const detail: string[] = []
  let facts: Fact[] | undefined

  if (!result.ok && outcome.code) detail.push('kod: ' + outcome.code)
  if (result.ok && outcome.mode === 'direct-call') detail.push('yol: doğrudan çağrı')

  const report = outcome.actionability
  if (!result.ok && report) {
    facts = [
      { label: 'görünür', ok: report.visible },
      { label: 'etkin', ok: report.enabled },
      { label: 'kararlı', ok: report.stable },
      { label: 'üstü açık', ok: report.unobstructed }
    ]
    if (report.reason) detail.push('hazırlık: ' + report.reason)
  }

  for (const dialog of outcome.dialogs)
    detail.push('diyalog: ' + dialog.type + ' · ' + dialog.policy)
  for (const download of outcome.downloads) {
    detail.push('indirme: ' + download.fileName + ' · ' + download.state)
  }

  return { detail: detail.length ? detail : undefined, facts }
}

function sameBox(a: StageBox | null, b: StageBox): boolean {
  if (!a) return false
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

function part(value: number, total: number): number {
  if (!total) return 0
  return Math.round((value / total) * 10000) / 10000
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high))
}

function readSize(key: string, fallback: number): number {
  try {
    const raw = Number(window.localStorage.getItem(key))
    return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : fallback
  } catch {
    return fallback
  }
}

function storeSize(key: string, value: number): void {
  try {
    window.localStorage.setItem(key, String(Math.round(value)))
  } catch {
    return
  }
}

const Logo = memo(function Logo(): React.JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
      <path d="M212 60 L300 60 L458 428 L352 428 L258 188 L182 348 L250 348 L296 398 L258 398 L222 428 L54 428 Z" />
    </svg>
  )
})

const LogRow = memo(function LogRow({ line }: { line: Line }): React.JSX.Element {
  const role = ROLES[line.kind]
  return (
    <div className={'line ' + line.kind}>
      <span className="line-mark">
        <Glyph name={role.glyph} size={12} />
      </span>
      <div className="line-body">
        <div className="line-meta">
          <span className="line-role">{role.label}</span>
          <span className="line-time">{line.time}</span>
          {line.ms === undefined ? null : <span className="line-ms">{formatMs(line.ms)}</span>}
        </div>
        <div className="line-text">{line.text}</div>
        {line.facts ? (
          <div className="facts">
            {line.facts.map((fact) => (
              <span key={fact.label} className={fact.ok ? 'fact yes' : 'fact no'}>
                <span className="fact-mark">{fact.ok ? '✓' : '✕'}</span>
                {fact.label}
              </span>
            ))}
          </div>
        ) : null}
        {line.detail ? (
          <div className="detail">
            {line.detail.map((row, index) => (
              <div key={index} className="detail-row">
                {row}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
})

const EMPTY_STATE: BrowserState = {
  url: '',
  title: '',
  canGoBack: false,
  canGoForward: false,
  loading: false,
  chatOpen: false,
  terminalOpen: false,
  vision: false,
  maximized: false,
  fullscreen: false
}

export default function App(): React.JSX.Element {
  const [state, setState] = useState<BrowserState>(EMPTY_STATE)
  const [chatOpen, setChatOpen] = useState(false)
  const [lines, setLines] = useState<Line[]>([])
  const [cmd, setCmd] = useState('')
  const [pending, setPending] = useState(false)
  const [sel, setSel] = useState(0)
  const [paletteOff, setPaletteOff] = useState(false)
  const [drag, setDrag] = useState<DragAxis | null>(null)
  const [urlFocused, setUrlFocused] = useState(false)
  const [urlDraft, setUrlDraft] = useState('')
  const [elements, setElements] = useState(0)
  const [lastMs, setLastMs] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [dock, setDock] = useState<DockTab>(null)
  const [recording, setRecording] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [library, setLibrary] = useState(0)
  const [theme, setTheme] = useState<ThemeId>(() => readTheme())
  const [chatWidth, setChatWidth] = useState(() => readSize(CHAT_KEY, CHAT_SIZE))
  const [termHeight, setTermHeight] = useState(() => readSize(TERM_KEY, TERM_SIZE))
  const [recWidth, setRecWidth] = useState(() => readSize(REC_KEY, REC_SIZE))
  const [space, setSpace] = useState({ width: 0, height: 0 })

  const logRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const urlRef = useRef<HTMLInputElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const spaceRef = useRef<HTMLDivElement | null>(null)
  const closeSettingsRef = useRef<HTMLButtonElement | null>(null)
  const pinnedRef = useRef(true)
  const seqRef = useRef(0)
  const cmdRef = useRef('')
  const pendingRef = useRef(false)
  const historyRef = useRef<string[]>([])
  const cursorRef = useRef(-1)
  const stageBoxRef = useRef<StageBox | null>(null)
  const dragRef = useRef<DragAxis | null>(null)

  const terminalOpen = state.terminalOpen
  const chatSize = space.width
    ? clamp(chatWidth, CHAT_MIN, Math.floor(space.width * CHAT_MAX_RATIO))
    : chatWidth
  const termSize = space.height
    ? clamp(termHeight, TERM_MIN, Math.floor(space.height * TERM_MAX_RATIO))
    : termHeight
  const recSize = space.width
    ? clamp(recWidth, REC_MIN, Math.floor(space.width * REC_MAX_RATIO))
    : recWidth

  const push = useCallback((kind: LineKind, text: string, extra?: Extra): void => {
    seqRef.current += 1
    const line: Line = { id: seqRef.current, kind, text, time: stamp(), ...extra }
    setLines((prev) => {
      const next = prev.length >= MAX_LINES ? prev.slice(prev.length - MAX_LINES + 1) : prev.slice()
      next.push(line)
      return next
    })
  }, [])

  const writeCmd = useCallback((value: string): void => {
    cmdRef.current = value
    setCmd(value)
  }, [])

  const focusPrompt = useCallback((): void => {
    const el = inputRef.current
    if (!el || el.disabled) return
    if (document.activeElement === el) return
    el.focus()
  }, [])

  const reportStage = useCallback((): void => {
    const el = stageRef.current
    if (!el) return

    const view = document.documentElement
    const width = view.clientWidth
    const height = view.clientHeight
    if (!width || !height) return

    const rect = el.getBoundingClientRect()
    const next: StageBox = {
      x: part(rect.left, width),
      y: part(rect.top, height),
      width: part(rect.width, width),
      height: part(rect.height, height)
    }

    if (sameBox(stageBoxRef.current, next)) return
    stageBoxRef.current = next
    window.aft.setStage(next)
  }, [])

  useEffect(() => {
    const off = window.aft.onState((next) => {
      setState(next)
      setChatOpen(next.chatOpen)
    })
    window.aft.requestState()
    return off
  }, [])

  useEffect(() => {
    paintTheme(theme)
    storeTheme(theme)
    window.aft.setChrome(themeOf(theme).chrome)
  }, [theme])

  useEffect(() => {
    const el = stageRef.current
    if (!el) return

    const observer = new ResizeObserver(() => reportStage())
    observer.observe(el)
    observer.observe(document.documentElement)
    window.addEventListener('resize', reportStage)
    reportStage()

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', reportStage)
    }
  }, [reportStage])

  useEffect(reportStage)

  useEffect(() => {
    const el = spaceRef.current
    if (!el) return

    const measure = (): void => {
      const rect = el.getBoundingClientRect()
      setSpace((prev) => {
        const width = Math.round(rect.width)
        const height = Math.round(rect.height)
        if (prev.width === width && prev.height === height) return prev
        return { width, height }
      })
    }

    const observer = new ResizeObserver(measure)
    observer.observe(el)
    measure()

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    window.aft.setModal(settingsOpen)
    if (settingsOpen) closeSettingsRef.current?.focus()
  }, [settingsOpen])

  useEffect(() => {
    const offUpdate = window.aftRecord.onUpdate((view) => {
      setRecording(view.status === 'recording' || view.status === 'paused')
    })

    const offNotice = window.aftRecord.onNotice((notice) => {
      if (notice.level === 'info') return
      push(notice.level === 'error' ? 'err' : 'note', notice.message, {
        detail: notice.detail.length ? notice.detail : undefined
      })
    })

    return () => {
      offUpdate()
      offNotice()
    }
  }, [push])

  useEffect(() => {
    return window.aft.onFocusUrl(() => urlRef.current?.focus())
  }, [])

  useEffect(() => {
    return window.aft.onFocusTerminal(() => focusPrompt())
  }, [focusPrompt])

  useEffect(() => {
    if (!terminalOpen || !pinnedRef.current) return
    const log = logRef.current
    if (!log) return
    log.scrollTop = log.scrollHeight
  }, [lines, terminalOpen, termSize])

  useEffect(() => {
    if (!terminalOpen || settingsOpen || urlFocused) return

    const keep = (): void => {
      const el = inputRef.current
      if (!el || el.disabled) return
      const active = document.activeElement
      if (active === el) return
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return
      if (active instanceof HTMLSelectElement) return
      el.focus()
    }

    keep()
    const timer = window.setTimeout(keep, 60)
    window.addEventListener('focus', keep)
    document.addEventListener('focusin', keep)
    document.addEventListener('visibilitychange', keep)

    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('focus', keep)
      document.removeEventListener('focusin', keep)
      document.removeEventListener('visibilitychange', keep)
    }
  }, [terminalOpen, settingsOpen, urlFocused, pending, state.url, state.loading, termSize])

  useEffect(() => {
    return window.aft.onPointer((spot) => {
      const axis = dragRef.current
      const box = spaceRef.current?.getBoundingClientRect()
      if (!axis || !box) return

      const view = document.documentElement
      if (axis === 'chat') {
        setChatWidth(Math.round(spot.x * view.clientWidth - box.left))
        return
      }
      if (axis === 'record') {
        setRecWidth(Math.round(box.right - spot.x * view.clientWidth))
        return
      }
      setTermHeight(Math.round(box.bottom - spot.y * view.clientHeight))
    })
  }, [])

  useEffect(() => {
    return window.aft.onDragEnd(() => {
      if (!dragRef.current) return
      dragRef.current = null
      setDrag(null)
    })
  }, [])

  useEffect(() => {
    if (!drag) return

    const stop = (): void => {
      if (!dragRef.current) return
      dragRef.current = null
      setDrag(null)
      window.aft.endDrag()
    }

    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    window.addEventListener('blur', stop)

    return () => {
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      window.removeEventListener('blur', stop)
    }
  }, [drag])

  useEffect(() => {
    if (drag) return
    storeSize(CHAT_KEY, chatSize)
    storeSize(TERM_KEY, termSize)
    storeSize(REC_KEY, recSize)
  }, [drag, chatSize, termSize, recSize])

  const onLogScroll = useCallback((): void => {
    const log = logRef.current
    if (!log) return
    pinnedRef.current = log.scrollHeight - log.scrollTop - log.clientHeight <= PIN_SLACK
  }, [])

  const nav = useCallback((kind: NavKind): void => {
    window.aft.nav(kind)
  }, [])

  const goBack = useCallback(() => nav('back'), [nav])
  const goForward = useCallback(() => nav('forward'), [nav])
  const goHome = useCallback(() => nav('home'), [nav])
  const refreshPage = useCallback(
    () => nav(state.loading ? 'stop' : 'reload'),
    [nav, state.loading]
  )

  const winAction = useCallback((action: WindowAction): void => {
    window.aft.window(action)
  }, [])

  const minimizeWindow = useCallback(() => winAction('minimize'), [winAction])
  const maximizeWindow = useCallback(() => winAction('maximize'), [winAction])
  const closeWindow = useCallback(() => winAction('close'), [winAction])

  const toggleChat = useCallback((): void => {
    setChatOpen((prev) => {
      const next = !prev
      window.aft.setChat(next)
      return next
    })
  }, [])

  const toggleTerminal = useCallback((): void => {
    window.aft.setTerminal(!terminalOpen)
  }, [terminalOpen])

  const closeTerminal = useCallback((): void => {
    window.aft.setTerminal(false)
  }, [])

  const openSettings = useCallback((): void => setSettingsOpen(true), [])

  const closeSettings = useCallback((): void => {
    setSettingsOpen(false)
    window.requestAnimationFrame(() => focusPrompt())
  }, [focusPrompt])

  const clearLog = useCallback((): void => {
    setLines([])
    pinnedRef.current = true
  }, [])

  const beginDrag = useCallback(
    (axis: DragAxis, event: React.PointerEvent<HTMLDivElement>): void => {
      if (event.button !== 0) return
      event.preventDefault()
      dragRef.current = axis
      setDrag(axis)
      window.aft.startDrag(axis)
    },
    []
  )

  const beginChatDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => beginDrag('chat', event),
    [beginDrag]
  )

  const beginTermDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => beginDrag('terminal', event),
    [beginDrag]
  )

  const beginRecDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => beginDrag('record', event),
    [beginDrag]
  )

  const openDock = useCallback((tab: Exclude<DockTab, null>): void => {
    setDock((prev) => (prev === tab ? null : tab))
  }, [])

  const closeDock = useCallback((): void => setDock(null), [])

  const showRecord = useCallback((): void => openDock('record'), [openDock])

  const showPlayback = useCallback((): void => openDock('playback'), [openDock])

  const report = useCallback(
    (entry: { level: 'ok' | 'err' | 'note'; text: string; detail?: string[] }): void => {
      push(entry.level, entry.text, entry.detail?.length ? { detail: entry.detail } : undefined)
    },
    [push]
  )

  const onSaved = useCallback((): void => {
    setLibrary((prev) => prev + 1)
    setDock('playback')
  }, [])

  const toggleVision = useCallback(async (): Promise<void> => {
    const next = !state.vision
    setState((prev) => ({ ...prev, vision: next }))
    try {
      const result: ExecuteResult = await window.aft.setVision(next)
      if (!result.ok) {
        push('err', result.result)
        return
      }
      if (result.page) setElements(result.page.elements.length)
      push('note', result.result)
    } catch (err) {
      push('err', 'Köprü hatası: ' + (err as Error).message)
    }
  }, [push, state.vision])

  const suggestions = useMemo(() => {
    if (pending || paletteOff) return []
    const text = cmd.trim().toLowerCase()
    if (!text || /\s/.test(cmd.trim())) return []
    return PALETTE.filter((entry) => entry.key.startsWith(text)).slice(0, MAX_SUGGESTIONS)
  }, [cmd, pending, paletteOff])

  const active = suggestions.length ? Math.min(sel, suggestions.length - 1) : -1

  const complete = useCallback(
    (entry: Entry): void => {
      writeCmd(entry.key + (/[<[]/.test(entry.usage) ? ' ' : ''))
      setSel(0)
      inputRef.current?.focus()
    },
    [writeCmd]
  )

  const printHelp = useCallback((): void => {
    push('note', 'Kullanılabilir komutlar', {
      detail: PALETTE.map((entry) => entry.usage.padEnd(26, ' ') + entry.hint)
    })
  }, [push])

  const run = useCallback(async (): Promise<void> => {
    if (pendingRef.current) return

    const input = cmdRef.current.trim()
    if (!input) return

    const [head = '', ...rest] = input.split(/\s+/)
    const key = head.toLowerCase()

    const history = historyRef.current
    if (history[history.length - 1] !== input) history.push(input)
    if (history.length > 100) history.shift()
    cursorRef.current = -1

    writeCmd('')
    setPaletteOff(false)
    setSel(0)
    pinnedRef.current = true

    if (key === 'cls') {
      clearLog()
      focusPrompt()
      return
    }

    push('in', input)

    if (key === 'rec' || key === 'oyn') {
      const tab = key === 'rec' ? 'record' : 'playback'
      setDock((prev) => {
        const next = prev === tab ? null : tab
        push(
          'note',
          next
            ? key === 'rec'
              ? 'Kayıt paneli açıldı'
              : 'Oynatma paneli açıldı'
            : 'Panel kapatıldı'
        )
        return next
      })
      focusPrompt()
      return
    }

    if (key === 'a' || key === '?') {
      printHelp()
      focusPrompt()
      return
    }

    const entry = ACTION_MAP.get(key)
    if (!entry) {
      push('err', 'Bilinmeyen komut: ' + head, { detail: ['Tüm komutlar için: a'] })
      focusPrompt()
      return
    }

    const action = entry.build(rest)
    if (!action) {
      push('err', 'Komut eksik veya geçersiz değer içeriyor.', {
        detail: ['Kullanım: ' + entry.usage]
      })
      focusPrompt()
      return
    }

    pendingRef.current = true
    setPending(true)
    const started = performance.now()

    try {
      const result = await window.aft.execute(action)
      const ms = Math.round(performance.now() - started)
      push(result.ok ? 'ok' : 'err', result.result, { ...readOutcome(result), ms })
      if (result.page) setElements(result.page.elements.length)
      setLastMs(ms)
    } catch (err) {
      push('err', 'Köprü hatası: ' + (err as Error).message)
    } finally {
      pendingRef.current = false
      setPending(false)
      window.requestAnimationFrame(() => focusPrompt())
    }
  }, [clearLog, focusPrompt, printHelp, push, writeCmd])

  const stepHistory = useCallback(
    (direction: number): void => {
      const history = historyRef.current
      if (!history.length) return
      setPaletteOff(true)

      if (direction < 0) {
        const index =
          cursorRef.current < 0 ? history.length - 1 : Math.max(0, cursorRef.current - 1)
        cursorRef.current = index
        writeCmd(history[index])
        return
      }

      if (cursorRef.current < 0) return
      const index = cursorRef.current + 1
      if (index >= history.length) {
        cursorRef.current = -1
        writeCmd('')
        return
      }
      cursorRef.current = index
      writeCmd(history[index])
    },
    [writeCmd]
  )

  const onCmdChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>): void => {
      writeCmd(event.target.value)
      setPaletteOff(false)
      setSel(0)
      cursorRef.current = -1
    },
    [writeCmd]
  )

  const onCmdKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>): void => {
      if (event.key === 'Escape') {
        setPaletteOff(true)
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        if (suggestions.length)
          setSel((prev) => (prev - 1 + suggestions.length) % suggestions.length)
        else stepHistory(-1)
        return
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        if (suggestions.length) setSel((prev) => (prev + 1) % suggestions.length)
        else stepHistory(1)
        return
      }

      if (event.key === 'Tab') {
        if (!suggestions.length || active < 0) return
        event.preventDefault()
        complete(suggestions[active])
        return
      }

      if (event.key !== 'Enter') return
      event.preventDefault()

      const typed = cmd.trim().toLowerCase()
      if (suggestions.length && active >= 0 && !PALETTE_KEYS.has(typed)) {
        complete(suggestions[active])
        return
      }
      void run()
    },
    [active, cmd, complete, run, stepHistory, suggestions]
  )

  const onUrlFocus = useCallback((): void => {
    setUrlFocused(true)
    setUrlDraft(state.url)
    requestAnimationFrame(() => urlRef.current?.select())
  }, [state.url])

  const onUrlBlur = useCallback((): void => {
    setUrlFocused(false)
    setUrlDraft('')
  }, [])

  const onUrlKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        urlRef.current?.blur()
        return
      }

      if (event.key !== 'Enter') return
      event.preventDefault()

      const url = toUrl(urlDraft)
      if (!url) return

      urlRef.current?.blur()
      void window.aft
        .execute({ action: 'go_to_url', url })
        .then((result) => {
          if (!result.ok) push('err', result.result, readOutcome(result))
          if (result.page) setElements(result.page.elements.length)
        })
        .catch((err: Error) => push('err', 'Köprü hatası: ' + err.message))
    },
    [push, urlDraft]
  )

  const onSheetKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeSettings()
    },
    [closeSettings]
  )

  return (
    <div className={'shell' + (drag ? ' drag-' + drag : '')}>
      <header className="shell-bar">
        <div className="bar-left">
          <span className="logo" title="AFT">
            <Logo />
          </span>

          <IconButton name="back" title="Geri" onClick={goBack} disabled={!state.canGoBack} />
          <IconButton
            name="forward"
            title="İleri"
            onClick={goForward}
            disabled={!state.canGoForward}
          />
          <IconButton
            name={state.loading ? 'stop' : 'reload'}
            title={state.loading ? 'Durdur' : 'Yenile'}
            onClick={refreshPage}
          />
          <IconButton name="home" title="Ana sayfa" onClick={goHome} />
          <IconButton
            name={state.vision ? 'eye' : 'eyeOff'}
            title={state.vision ? 'Görüşü kapat' : 'Görüşü aç'}
            onClick={() => void toggleVision()}
            active={state.vision}
            badge={state.vision ? elements : 0}
          />
        </div>

        <div className="bar-drag" onDoubleClick={maximizeWindow} />

        <div className={'omnibox' + (urlFocused ? ' focused' : '')}>
          <input
            ref={urlRef}
            className="omni-input"
            value={urlFocused ? urlDraft : shortUrl(state.url)}
            onChange={(event) => setUrlDraft(event.target.value)}
            onFocus={onUrlFocus}
            onBlur={onUrlBlur}
            onKeyDown={onUrlKeyDown}
            placeholder="Adres veya arama"
            spellCheck={false}
            aria-label="Adres çubuğu"
          />
          {state.loading ? <span className="omni-load" /> : null}
        </div>

        <div className="bar-drag" onDoubleClick={maximizeWindow} />
        <div className="bar-right">
          <IconButton
            name="settings"
            title="Ayarlar"
            onClick={openSettings}
            active={settingsOpen}
          />
          <span className="bar-gap" />
          <IconButton
            name="minimize"
            title="Simge durumuna küçült"
            onClick={minimizeWindow}
            small
          />
          <IconButton
            name={state.maximized ? 'restore' : 'maximize'}
            title={state.maximized ? 'Önceki boyut' : 'Ekranı kapla'}
            onClick={maximizeWindow}
            small
          />
          <IconButton name="close" title="Kapat" onClick={closeWindow} small danger />
        </div>
      </header>

      <aside className="shell-side">
        <IconButton
          name="chat"
          title={chatOpen ? 'Ajan sohbetini kapat' : 'Ajan sohbetini aç'}
          onClick={toggleChat}
          active={chatOpen}
        />
        <IconButton
          name="record"
          title={dock === 'record' ? 'Kayıt panelini kapat' : 'Kayıt panelini aç'}
          onClick={showRecord}
          active={dock === 'record'}
          danger={recording}
        />
        <IconButton
          name="play"
          title={dock === 'playback' ? 'Oynatma panelini kapat' : 'Oynatma panelini aç'}
          onClick={showPlayback}
          active={dock === 'playback'}
        />
        <span className="side-gap" />
        <IconButton
          name="terminal"
          title={terminalOpen ? 'Terminali kapat (Ctrl+K)' : 'Terminali aç (Ctrl+K)'}
          onClick={toggleTerminal}
          active={terminalOpen}
        />
      </aside>

      <div className="workspace" ref={spaceRef}>
        {chatOpen ? (
          <section className="panel" style={{ width: chatSize }}>
            <header className="panel-head">
              <span className="panel-title">AJAN SOHBETİ</span>
              <button
                className="ghost-btn"
                title="Paneli kapat"
                aria-label="Paneli kapat"
                onClick={toggleChat}
                type="button"
              >
                <Glyph name="collapse" size={15} />
              </button>
            </header>

            <div className="panel-body" />

            <div
              className="panel-grip"
              onPointerDown={beginChatDrag}
              role="separator"
              aria-orientation="vertical"
              aria-label="Sohbet panelinin genişliğini değiştir"
            />
          </section>
        ) : null}

        <div className="main">
          <div className="stage" ref={stageRef} />

          {terminalOpen ? (
            <section className="terminal" style={{ height: termSize }}>
              <div
                className="term-grip"
                onPointerDown={beginTermDrag}
                role="separator"
                aria-orientation="horizontal"
                aria-label="Terminal yüksekliğini değiştir"
              />

              <header className="term-head">
                <span className="term-tab">
                  <Glyph name="terminal" size={13} />
                  Terminal
                </span>

                {pending ? (
                  <span className="term-running">
                    <span className="spinner" />
                    çalışıyor
                  </span>
                ) : null}

                <span className="term-push" />

                <button
                  className="ghost-btn"
                  title="Terminali temizle"
                  aria-label="Terminali temizle"
                  onClick={clearLog}
                  type="button"
                >
                  <Glyph name="trash" size={14} />
                </button>
                <button
                  className="ghost-btn"
                  title="Terminali kapat"
                  aria-label="Terminali kapat"
                  onClick={closeTerminal}
                  type="button"
                >
                  <Glyph name="minimize" size={14} />
                </button>
              </header>

              <div className="term-body">
                <div
                  className="log"
                  ref={logRef}
                  onScroll={onLogScroll}
                  role="log"
                  aria-live="polite"
                  aria-label="Terminal çıktısı"
                >
                  {lines.map((line) => (
                    <LogRow key={line.id} line={line} />
                  ))}
                </div>

                {suggestions.length ? (
                  <div className="palette" role="listbox" aria-label="Komut önerileri">
                    <div className="palette-head">
                      KOMUTLAR · {suggestions.length} / {PALETTE.length}
                    </div>
                    {suggestions.map((entry, index) => (
                      <button
                        key={entry.key}
                        className={'palette-row' + (index === active ? ' sel' : '')}
                        role="option"
                        aria-selected={index === active}
                        onMouseEnter={() => setSel(index)}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => complete(entry)}
                        type="button"
                      >
                        <span className="palette-key">{entry.usage}</span>
                        <span className="palette-hint">{entry.hint}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="composer">
                <span className="composer-caret">›</span>
                <input
                  ref={inputRef}
                  value={cmd}
                  onChange={onCmdChange}
                  onKeyDown={onCmdKeyDown}
                  placeholder={pending ? 'Komut çalışıyor…' : 'Komut yazın, liste için a'}
                  spellCheck={false}
                  disabled={pending}
                  aria-label="Komut girişi"
                />
                <button
                  className="send"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void run()}
                  disabled={pending || !cmd.trim()}
                  title="Çalıştır"
                  aria-label="Çalıştır"
                  type="button"
                >
                  <Glyph name="send" size={15} />
                </button>
              </div>
            </section>
          ) : null}
        </div>

        {dock ? (
          <section className="panel rec-panel" style={{ width: recSize }}>
            <div
              className="rec-grip"
              onPointerDown={beginRecDrag}
              role="separator"
              aria-orientation="vertical"
              aria-label="Panel genişliğini değiştir"
            />

            <header className="dock-head">
              <button
                className={'dock-tab' + (dock === 'record' ? ' sel' : '')}
                onClick={showRecord}
                type="button"
              >
                <Glyph name="record" size={13} />
                KAYIT
              </button>
              <button
                className={'dock-tab' + (dock === 'playback' ? ' sel' : '')}
                onClick={showPlayback}
                type="button"
              >
                <Glyph name="play" size={13} />
                OYNATMA
              </button>
              <span className="dock-push" />
              <button
                className="ghost-btn"
                title="Paneli kapat"
                aria-label="Paneli kapat"
                onClick={closeDock}
                type="button"
              >
                <Glyph name="collapse" size={15} />
              </button>
            </header>

            <div className="dock-body" hidden={dock !== 'record'}>
              <RecordPanel blocked={playing} onReport={report} onSaved={onSaved} />
            </div>

            <div className="dock-body" hidden={dock !== 'playback'}>
              <PlaybackPanel
                active={dock === 'playback'}
                revision={library}
                blocked={recording}
                onReport={report}
                onBusy={setPlaying}
              />
            </div>
          </section>
        ) : null}
      </div>

      {settingsOpen ? (
        <div className="sheet" role="dialog" aria-modal="true" aria-label="Ayarlar">
          <div className="sheet-card" onKeyDown={onSheetKeyDown}>
            <header className="sheet-head">
              <span className="sheet-title">AYARLAR</span>
              <button
                ref={closeSettingsRef}
                className="ghost-btn"
                title="Ayarları kapat"
                aria-label="Ayarları kapat"
                onClick={closeSettings}
                type="button"
              >
                <Glyph name="close" size={15} />
              </button>
            </header>

            <div className="sheet-body">
              <section className="sheet-block">
                <h3 className="sheet-label">Tema</h3>
                <div className="theme-grid">
                  {THEMES.map((item) => (
                    <button
                      key={item.id}
                      className={'theme-card' + (item.id === theme ? ' sel' : '')}
                      onClick={() => setTheme(item.id)}
                      aria-pressed={item.id === theme}
                      type="button"
                    >
                      <span className="theme-swatch">
                        {item.swatch.map((color) => (
                          <span key={color} style={{ background: color }} />
                        ))}
                      </span>
                      <span className="theme-name">{item.label}</span>
                      <span className="theme-note">{item.note}</span>
                      {item.id === theme ? (
                        <span className="theme-mark">
                          <Glyph name="check" size={12} />
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </section>

              <section className="sheet-block">
                <h3 className="sheet-label">Kısayollar</h3>
                <div className="key-rows">
                  {SHORTCUTS.map((item) => (
                    <div key={item.code} className="key-row">
                      <span className="key-name">{item.name}</span>
                      <span className="key-code">{item.code}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : null}

      <footer className="shell-foot">
        <span className={'status-live' + (state.loading ? ' busy' : '')} />
        <span className="status-item">{state.loading ? 'yükleniyor' : 'hazır'}</span>
        <span className="status-sep" />
        <span className="status-item">{elements} öğe</span>
        <span className="status-sep" />
        <span className="status-item">son işlem {lastMs ? formatMs(lastMs) : '—'}</span>
        <span className="status-sep" />
        <span className="status-item">görüş {state.vision ? 'açık' : 'kapalı'}</span>
        <span className="status-push" />
      </footer>
    </div>
  )
}
