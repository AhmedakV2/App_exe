import React, { memo, useCallback, useEffect, useRef, useState } from 'react'
import type {
  AgentAction,
  BrowserState,
  ExecuteResult,
  NavKind,
  WindowAction
} from '../../main/browser/types'

type ParsedCommand = { kind: 'help' } | { kind: 'action'; action: AgentAction } | null
type LineKind = 'in' | 'ok' | 'err' | 'el'
type Line = { id: number; kind: LineKind; text: string }

const MAX_LINES = 300
const PIN_SLACK = 48

const COLORS: Record<LineKind, string> = {
  err: '#ff6b6b',
  in: '#ef6c1a',
  el: '#8a8a8a',
  ok: '#cfcfcf'
}

const COMMANDS: Record<string, { usage: string; build: (a: string[]) => AgentAction }> = {
  go: { usage: 'go <url>', build: (a) => ({ action: 'go_to_url', url: a[0] }) },
  click: { usage: 'click <index>', build: (a) => ({ action: 'click', index: Number(a[0]) }) },
  dbclick: {
    usage: 'dbclick <index>',
    build: (a) => ({ action: 'double_click', index: Number(a[0]) })
  },
  rclick: {
    usage: 'rclick <index>',
    build: (a) => ({ action: 'right_click', index: Number(a[0]) })
  },
  type: {
    usage: 'type <index> <metin>',
    build: (a) => ({ action: 'type', index: Number(a[0]), text: a.slice(1).join(' ') })
  },
  clear: { usage: 'clear <index>', build: (a) => ({ action: 'clear_type', index: Number(a[0]) }) },
  move: { usage: 'move <index>', build: (a) => ({ action: 'mouse_move', index: Number(a[0]) }) },
  scroll: { usage: 'scroll <deltaY>', build: (a) => ({ action: 'scroll', deltaY: Number(a[0]) }) },
  snap: { usage: 'snap', build: () => ({ action: 'snapshot' }) },
  press: {
    usage: 'press <index> <key>',
    build: (a) => ({ action: 'press_key', key: a[1], index: a[0] ? Number(a[0]) : undefined })
  },
  sel: {
    usage: 'sel <index> <deger>',
    build: (a) => ({
      action: 'select_option',
      index: Number(a[0]),
      optionValue: a.slice(1).join(' ')
    })
  },
  upload: {
    usage: 'upload <index> <dosya...>',
    build: (a) => ({ action: 'upload', index: Number(a[0]), files: a.slice(1) })
  },
  wait: { usage: 'wait', build: () => ({ action: 'wait' }) }
}

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
  )
}

const Logo = memo(function Logo(): React.JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 512 512"
      fill="currentColor"
      aria-hidden="true"
      role="img"
    >
      <path d="M212 60 L300 60 L458 428 L352 428 L258 188 L182 348 L250 348 L296 398 L258 398 L222 428 L54 428 Z" />
    </svg>
  )
})

const Glyph = memo(function Glyph({ name, size = 18 }: { name: string; size?: number }) {
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
  danger
}: {
  name: string
  title: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
  danger?: boolean
}) {
  const cls = 'icon-btn' + (active ? ' on' : '') + (danger ? ' danger' : '')
  return (
    <button className={cls} title={title} onClick={onClick} disabled={disabled} type="button">
      <Glyph name={name} />
    </button>
  )
})

const Row = memo(function Row({ line }: { line: Line }) {
  return (
    <div className="row" style={{ color: COLORS[line.kind] }}>
      {line.text}
    </div>
  )
})

function diagnose(result: ExecuteResult): string[] {
  const outcome = result.outcome
  if (!outcome) return []

  const lines: string[] = []
  if (!result.ok && outcome.code) lines.push('kod: ' + outcome.code)
  if (result.ok && outcome.mode === 'direct-call') lines.push('yol: dogrudan cagri')

  const report = outcome.actionability
  if (!result.ok && report) {
    lines.push(
      'hazirlik: ' +
        report.reason +
        ' (gorunur ' +
        report.visible +
        ', etkin ' +
        report.enabled +
        ', kararli ' +
        report.stable +
        ', ustu acik ' +
        report.unobstructed +
        ')'
    )
  }
  for (const dialog of outcome.dialogs) lines.push('diyalog: ' + dialog.type + ' ' + dialog.policy)
  for (const download of outcome.downloads) {
    lines.push('indirme: ' + download.fileName + ' ' + download.state)
  }
  return lines
}

const EMPTY_STATE: BrowserState = {
  url: '',
  title: '',
  canGoBack: false,
  canGoForward: false,
  loading: false,
  chatOpen: true,
  vision: false,
  maximized: false,
  fullscreen: false
}

export default function App(): React.JSX.Element {
  const [cmd, setCmd] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [chatOpen, setChatOpen] = useState(true)
  const [state, setState] = useState<BrowserState>(EMPTY_STATE)

  const logRef = useRef<HTMLDivElement | null>(null)
  const pinnedRef = useRef(true)
  const seqRef = useRef(0)
  const cmdRef = useRef('')

  const push = useCallback((kind: LineKind, text: string): void => {
    seqRef.current += 1
    const line: Line = { id: seqRef.current, kind, text }
    setLines((prev) => {
      const next = prev.length >= MAX_LINES ? prev.slice(prev.length - MAX_LINES + 1) : prev.slice()
      next.push(line)
      return next
    })
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
    if (!chatOpen || !pinnedRef.current) return
    const log = logRef.current
    if (!log) return
    log.scrollTop = log.scrollHeight
  }, [lines, chatOpen])

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

  const toggleVision = useCallback(async (): Promise<void> => {
    const next = !state.vision
    setState((prev) => ({ ...prev, vision: next }))
    try {
      const res: ExecuteResult = await window.aft.setVision(next)
      if (!res.ok) {
        push('err', res.result)
        return
      }
      const snap: ExecuteResult = await window.aft.execute({ action: 'snapshot' })
      push(snap.ok ? 'ok' : 'err', snap.result)
    } catch (err) {
      push('err', 'KOPRU HATASI: ' + (err as Error).message)
    }
  }, [push, state.vision])

  const parse = useCallback((input: string): ParsedCommand => {
    const [head = '', ...rest] = input.trim().split(/\s+/)
    const key = head.toLowerCase()
    if (key === 'a') return { kind: 'help' }
    const entry = COMMANDS[key]
    return entry ? { kind: 'action', action: entry.build(rest) } : null
  }, [])

  const run = useCallback(async (): Promise<void> => {
    const input = cmdRef.current.trim()
    if (!input) return

    const parsed = parse(input)
    if (!parsed) {
      push('err', 'Bilinmeyen komut. Liste icin: a')
      return
    }

    push('in', '> ' + input)
    cmdRef.current = ''
    setCmd('')

    if (parsed.kind === 'help') {
      push('ok', 'Kullanilabilir aksiyonlar:')
      Object.values(COMMANDS).forEach((c) => push('el', '  ' + c.usage))
      return
    }

    try {
      const res = await window.aft.execute(parsed.action)
      push(res.ok ? 'ok' : 'err', res.result)
      for (const detail of diagnose(res)) push('el', '  ' + detail)
    } catch (err) {
      push('err', 'KOPRU HATASI: ' + (err as Error).message)
    }
  }, [parse, push])

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
    cmdRef.current = e.target.value
    setCmd(e.target.value)
  }, [])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>): void => {
      if (e.key !== 'Enter') return
      e.preventDefault()
      void run()
    },
    [run]
  )

  return (
    <div className="shell">
      <header className="shell-bar">
        <div className="bar-left">
          <span className="logo" title="AFT">
            <Logo />
          </span>

          <IconButton name="back" title="Geri" onClick={goBack} disabled={!state.canGoBack} />
          <IconButton
            name="forward"
            title="Ileri"
            onClick={goForward}
            disabled={!state.canGoForward}
          />
          <IconButton
            name={state.loading ? 'stop' : 'reload'}
            title={state.loading ? 'Durdur' : 'Yenile'}
            onClick={refreshPage}
          />
          <IconButton
            name={state.vision ? 'eye' : 'eyeOff'}
            title={state.vision ? 'Gorusu kapat' : 'Gorusu ac'}
            onClick={() => void toggleVision()}
            active={state.vision}
          />
          <IconButton name="home" title="Ana sayfa" onClick={goHome} />
        </div>

        <div className="bar-drag" onDoubleClick={maximizeWindow}>
          <span className="bar-title">{state.title || 'AFT'}</span>
        </div>

        <div className="bar-right">
          <IconButton name="minimize" title="Simge durumuna kucult" onClick={minimizeWindow} />
          <IconButton
            name={state.maximized ? 'restore' : 'maximize'}
            title={state.maximized ? 'Onceki boyut' : 'Ekrani kapla'}
            onClick={maximizeWindow}
          />
          <IconButton name="close" title="Kapat" onClick={closeWindow} danger />
        </div>
      </header>

      <aside className="shell-side">
        <IconButton
          name="chat"
          title={chatOpen ? 'Agent chat kapat' : 'Agent chat ac'}
          onClick={toggleChat}
          active={chatOpen}
        />
      </aside>

      <div className="workspace">
        {chatOpen && (
          <section className="panel">
            <header className="panel-head">
              <span className="brand">AGENT CHAT</span>
              <button className="collapse" title="Chati kapat" onClick={toggleChat} type="button">
                <Glyph name="collapse" size={15} />
              </button>
            </header>

            <div className="log" ref={logRef} onScroll={onLogScroll}>
              {lines.map((line) => (
                <Row key={line.id} line={line} />
              ))}
            </div>

            <div className="composer">
              <input
                value={cmd}
                onChange={onChange}
                onKeyDown={onKeyDown}
                placeholder="Komutlar için 'a' yaz."
                spellCheck={false}
              />
              <button className="send" onClick={() => void run()} type="button">
                <Glyph name="send" size={16} />
              </button>
            </div>
          </section>
        )}

        <div className="stage" />
      </div>
    </div>
  )
}
