import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AgentAction,
  BrowserState,
  ExecuteResult,
  NavKind,
  WindowAction
} from '../../main/browser/types'

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
type Entry = { key: string; usage: string; hint: string }
type ActionEntry = Entry & { build: (args: string[]) => AgentAction | null }

const MAX_LINES = 400
const PIN_SLACK = 48
const MAX_SUGGESTIONS = 6

const ROLES: Record<LineKind, { label: string; glyph: string }> = {
  in: { label: 'Komut', glyph: 'prompt' },
  ok: { label: 'Tamamlandı', glyph: 'check' },
  err: { label: 'Yapılamadı', glyph: 'alert' },
  note: { label: 'Bilgi', glyph: 'info' }
}

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
    usage: 'wait',
    hint: 'Sayfanın durulmasını bekler',
    build: () => ({ action: 'wait' })
  }
]

const BUILTINS: Entry[] = [
  { key: 'a', usage: 'a', hint: 'Komut listesini yazdırır' },
  { key: 'cls', usage: 'cls', hint: 'Terminal geçmişini temizler' }
]

const PALETTE: Entry[] = [...ACTIONS, ...BUILTINS]
const ACTION_MAP = new Map(ACTIONS.map((entry) => [entry.key, entry]))
const PALETTE_KEYS = new Set(PALETTE.map((entry) => entry.key))

const GLYPHS: Record<string, React.JSX.Element> = {
  chat: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  back: <path d="M15 18l-6-6 6-6" />,
  forward: <path d="M9 18l6-6-6-6" />,
  reload: (
    <>
      <path d="M3 12a9 9 0 0 1 15.3-6.4" />
      <path d="M18 4v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.3 6.4" />
      <path d="M6 20v-5h5" />
    </>
  ),
  stop: (
    <>
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </>
  ),
  home: (
    <>
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10h14V10" />
    </>
  ),
  eye: (
    <>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <path d="M1 1l22 22" />
    </>
  ),
  send: (
    <>
      <path d="M12 19V5" />
      <path d="M6 11l6-6 6 6" />
    </>
  ),
  collapse: <path d="M15 18l-6-6 6-6" />,
  minimize: <path d="M5 12h14" />,
  maximize: <rect x="5" y="5" width="14" height="14" rx="2" />,
  restore: (
    <>
      <path d="M8 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2" />
      <rect x="4" y="8" width="12" height="12" rx="2" />
    </>
  ),
  close: (
    <>
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </>
  ),
  terminal: (
    <>
      <path d="M4 17l6-5-6-5" />
      <path d="M12 19h8" />
    </>
  ),
  prompt: (
    <>
      <path d="M4 17l6-5-6-5" />
      <path d="M12 19h8" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M9 7V4h6v3" />
    </>
  ),
  check: <path d="M20 6L9 17l-5-5" />,
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6" />
      <path d="M12 16.5v.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6" />
      <path d="M12 7.5v.01" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18z" />
    </>
  )
}

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

const Logo = memo(function Logo(): React.JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
      <path d="M212 60 L300 60 L458 428 L352 428 L258 188 L182 348 L250 348 L296 398 L258 398 L222 428 L54 428 Z" />
    </svg>
  )
})

const Glyph = memo(function Glyph({
  name,
  size = 18
}: {
  name: string
  size?: number
}): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {GLYPHS[name]}
    </svg>
  )
})

const IconButton = memo(function IconButton({
  name,
  title,
  onClick,
  active,
  disabled,
  danger,
  small,
  badge
}: {
  name: string
  title: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
  danger?: boolean
  small?: boolean
  badge?: number
}): React.JSX.Element {
  const cls =
    'icon-btn' +
    (active ? ' on' : '') +
    (danger ? ' danger' : '') +
    (small ? ' small' : '') +
    (badge ? ' badged' : '')

  return (
    <button
      className={cls}
      title={title}
      aria-label={title}
      aria-pressed={active === undefined ? undefined : active}
      onClick={onClick}
      disabled={disabled}
      type="button"
    >
      <Glyph name={name} size={small ? 15 : 18} />
      {badge ? <span className="icon-badge">{badge > 99 ? '99+' : badge}</span> : null}
    </button>
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
  terminalHeight: 0,
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
  const [resizing, setResizing] = useState(false)
  const [urlFocused, setUrlFocused] = useState(false)
  const [urlDraft, setUrlDraft] = useState('')
  const [elements, setElements] = useState(0)
  const [lastMs, setLastMs] = useState(0)

  const logRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const urlRef = useRef<HTMLInputElement | null>(null)
  const pinnedRef = useRef(true)
  const seqRef = useRef(0)
  const cmdRef = useRef('')
  const pendingRef = useRef(false)
  const historyRef = useRef<string[]>([])
  const cursorRef = useRef(-1)
  const wasOpenRef = useRef(false)

  const terminalOpen = state.terminalOpen
  const terminalHeight = state.terminalHeight

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

  useEffect(() => {
    const off = window.aft.onState((next) => {
      setState(next)
      setChatOpen(next.chatOpen)
    })
    window.aft.requestState()
    return off
  }, [])

  useEffect(() => {
    return window.aft.onFocusUrl(() => urlRef.current?.focus())
  }, [])

  useEffect(() => {
    if (!terminalOpen || !pinnedRef.current) return
    const log = logRef.current
    if (!log) return
    log.scrollTop = log.scrollHeight
  }, [lines, terminalOpen, terminalHeight])

  useEffect(() => {
    if (terminalOpen && !wasOpenRef.current) inputRef.current?.focus()
    wasOpenRef.current = terminalOpen
  }, [terminalOpen])

  useEffect(() => {
    if (!resizing) return

    const stop = (): void => {
      setResizing(false)
      window.aft.resizeTerminal(false)
    }

    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    window.addEventListener('blur', stop)

    return () => {
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      window.removeEventListener('blur', stop)
    }
  }, [resizing])

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

  const openTerminal = useCallback((): void => {
    window.aft.setTerminal(true)
  }, [])

  const closeTerminal = useCallback((): void => {
    window.aft.setTerminal(false)
  }, [])

  const clearLog = useCallback((): void => {
    setLines([])
    pinnedRef.current = true
  }, [])

  const startResize = useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    event.preventDefault()
    setResizing(true)
    window.aft.resizeTerminal(true)
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
      return
    }

    push('in', input)

    if (key === 'a' || key === '?') {
      printHelp()
      return
    }

    const entry = ACTION_MAP.get(key)
    if (!entry) {
      push('err', 'Bilinmeyen komut: ' + head, { detail: ['Tüm komutlar için: a'] })
      return
    }

    const action = entry.build(rest)
    if (!action) {
      push('err', 'Komut eksik veya geçersiz değer içeriyor.', {
        detail: ['Kullanım: ' + entry.usage]
      })
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
    }
  }, [clearLog, printHelp, push, writeCmd])

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

  const secure = state.url.startsWith('https://')

  return (
    <div className={'shell' + (resizing ? ' resizing' : '')}>
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
          <span className={'omni-mark' + (secure ? ' secure' : '')}>
            <Glyph name={secure ? 'lock' : 'globe'} size={13} />
          </span>
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

        <div className="bar-drag" onDoubleClick={maximizeWindow}>
          <span className="bar-title">{state.title}</span>
        </div>

        <div className="bar-right">
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
        <span className="side-gap" />
        <IconButton
          name="terminal"
          title={terminalOpen ? 'Terminali kapat (Ctrl+`)' : 'Terminali aç (Ctrl+`)'}
          onClick={toggleTerminal}
          active={terminalOpen}
        />
      </aside>

      <div className="workspace">
        {chatOpen ? (
          <section className="panel">
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

            <div className="panel-empty">
              <span className="panel-badge">Ayrıldı</span>
              <p className="panel-lead">Bu panel ajan konuşması için ayrıldı.</p>
              <p className="panel-note">
                Aksiyon komutları alttaki terminale taşındı. Terminali açmak için Ctrl+` veya
                soldaki terminal düğmesini kullanın.
              </p>
              <button className="panel-action" onClick={openTerminal} type="button">
                <Glyph name="terminal" size={14} />
                Terminali aç
              </button>
            </div>
          </section>
        ) : null}

        <div className="main">
          <div className="stage" />

          {terminalOpen && terminalHeight > 0 ? (
            <section className="terminal" style={{ height: terminalHeight }}>
              <div
                className="term-grip"
                onPointerDown={startResize}
                role="separator"
                aria-orientation="horizontal"
                aria-label="Terminal yüksekliğini değiştir"
              />

              <header className="term-head">
                <span className="term-tab">
                  <Glyph name="terminal" size={13} />
                  aksiyonlar
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
                  {lines.length ? (
                    lines.map((line) => <LogRow key={line.id} line={line} />)
                  ) : (
                    <div className="log-empty">
                      <p className="log-empty-title">Aksiyon terminali hazır.</p>
                      <p className="log-empty-note">
                        Bir komut yazın, tamamlama listesi kendiliğinden açılır. Geçmiş için yukarı
                        ok, tüm liste için a, temizlemek için cls.
                      </p>
                      <div className="log-chips">
                        {['go', 'snap', 'click', 'type'].map((key) => {
                          const entry = ACTION_MAP.get(key)
                          if (!entry) return null
                          return (
                            <button
                              key={key}
                              className="chip"
                              onClick={() => complete(entry)}
                              type="button"
                            >
                              {entry.usage}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
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
      </div>

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
        <span className="status-key">Ctrl+` terminal</span>
        <span className="status-key">Ctrl+L adres</span>
      </footer>
    </div>
  )
}
