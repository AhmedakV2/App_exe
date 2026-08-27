import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AgentAction,
  BrowserState,
  DragAxis,
  NavKind,
  StageBox,
  WindowAction
} from '../../main/browser/types'
import { isThemeId, paintTheme, readTheme, storeTheme, themeOf } from './themes'
import type { ThemeId } from './themes'
import { Glyph, IconButton } from './icons'
import { clamp, formatMs, shortUrl, toUrl } from './format'
import { useConsole } from './useConsole'
import type { Report } from './report'
import BrowserPage from './pages/BrowserPage'
import type { DockTab } from './pages/BrowserPage'
import ScenarioPage from './pages/ScenarioPage'
import ResultPage from './pages/ResultPage'
import IdentityPage from './pages/IdentityPage'
import CoveragePage from './pages/CoveragePage'
import DataPage from './pages/DataPage'

type PageId = 'browser' | 'scenarios' | 'results' | 'identity' | 'coverage' | 'data'

type NavItem = { id: PageId; label: string; glyph: string; stage: boolean; dock?: DockTab }

const NAV: NavItem[] = [
  { id: 'browser', label: 'Tarayıcı', glyph: 'globe', stage: true },
  { id: 'browser', label: 'Kayıt', glyph: 'record', stage: true, dock: 'record' },
  { id: 'browser', label: 'Oynatma', glyph: 'play', stage: true, dock: 'playback' },
  { id: 'scenarios', label: 'Senaryolar', glyph: 'library', stage: false },
  { id: 'results', label: 'Sonuçlar', glyph: 'history', stage: false },
  { id: 'identity', label: 'Kimlik', glyph: 'pulse', stage: false },
  { id: 'coverage', label: 'Kapsam', glyph: 'radar', stage: false },
  { id: 'data', label: 'Veri', glyph: 'database', stage: false }
]

const PAGE_LABELS: Record<PageId, string> = {
  browser: 'Tarayıcı',
  scenarios: 'Senaryolar',
  results: 'Sonuçlar',
  identity: 'Kimlik',
  coverage: 'Kapsam',
  data: 'Veri'
}

function isPageId(value: unknown): value is PageId {
  return typeof value === 'string' && value in PAGE_LABELS
}

const LIST_KEY = 'aft:list-width'
const TERM_KEY = 'aft:term-height'
const DOCK_KEY = 'aft:dock-width'
const DOCK_TAB_KEY = 'aft:dock-tab'
const PAGE_KEY = 'aft:page'
const AUTO_TERM_KEY = 'aft:auto-terminal'
const AUTO_BACK_KEY = 'aft:auto-terminal-restore'

const LIST_SIZE = 300
const TERM_SIZE = 268
const DOCK_SIZE = 380
const LIST_MIN = 220
const TERM_MIN = 120
const DOCK_MIN = 300
const LIST_MAX_RATIO = 0.5
const TERM_MAX_RATIO = 0.72
const DOCK_MAX_RATIO = 0.62

function sameBox(a: StageBox | null, b: StageBox): boolean {
  if (!a) return false
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

function part(value: number, total: number): number {
  if (!total) return 0
  return Math.round((value / total) * 10000) / 10000
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

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === '1') return true
    if (raw === '0') return false
    return fallback
  } catch {
    return fallback
  }
}

function storeFlag(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, value ? '1' : '0')
  } catch {
    return
  }
}

function readPage(): PageId {
  try {
    const raw = window.localStorage.getItem(PAGE_KEY)
    return isPageId(raw) ? raw : 'browser'
  } catch {
    return 'browser'
  }
}

function readDock(): DockTab {
  try {
    const raw = window.localStorage.getItem(DOCK_TAB_KEY)
    return raw === 'record' || raw === 'playback' ? raw : null
  } catch {
    return null
  }
}

const Logo = memo(function Logo(): React.JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
      <path d="M212 60 L300 60 L458 428 L352 428 L258 188 L182 348 L250 348 L296 398 L258 398 L222 428 L54 428 Z" />
    </svg>
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
  settingsOpen: false,
  vision: false,
  maximized: false,
  fullscreen: false
}

export default function App(): React.JSX.Element {
  const [state, setState] = useState<BrowserState>(EMPTY_STATE)
  const [page, setPage] = useState<PageId>(() => readPage())
  const [listOpen, setListOpen] = useState(false)
  const [drag, setDrag] = useState<DragAxis | null>(null)
  const [urlFocused, setUrlFocused] = useState(false)
  const [urlDraft, setUrlDraft] = useState('')
  const [recording, setRecording] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [library, setLibrary] = useState(0)
  const [runRequest, setRunRequest] = useState('')
  const [focusSeed, setFocusSeed] = useState(0)
  const [theme, setTheme] = useState<ThemeId>(() => readTheme())
  const [autoTerm, setAutoTerm] = useState(() => readFlag(AUTO_TERM_KEY, true))
  const [autoBack, setAutoBack] = useState(() => readFlag(AUTO_BACK_KEY, false))
  const [listWidth, setListWidth] = useState(() => readSize(LIST_KEY, LIST_SIZE))
  const [termHeight, setTermHeight] = useState(() => readSize(TERM_KEY, TERM_SIZE))
  const [dockWidth, setDockWidth] = useState(() => readSize(DOCK_KEY, DOCK_SIZE))
  const [dock, setDock] = useState<DockTab>(() => readDock())
  const [space, setSpace] = useState({ width: 0, height: 0 })
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null)

  const term = useConsole()
  const { push: pushLine, absorb: absorbResult } = term

  const urlRef = useRef<HTMLInputElement | null>(null)
  const spaceRef = useRef<HTMLDivElement | null>(null)
  const stageBoxRef = useRef<StageBox | null>(null)
  const dragRef = useRef<DragAxis | null>(null)
  const autoTermRef = useRef(autoTerm)
  const autoBackRef = useRef(autoBack)
  const termOpenRef = useRef(false)
  const autoOpenedRef = useRef(false)

  const terminalOpen = state.terminalOpen
  const settingsOpen = state.settingsOpen
  const hasStage = page === 'browser'

  const listSize = space.width
    ? clamp(listWidth, LIST_MIN, Math.floor(space.width * LIST_MAX_RATIO))
    : listWidth
  const termSize = space.height
    ? clamp(termHeight, TERM_MIN, Math.floor(space.height * TERM_MAX_RATIO))
    : termHeight
  const dockSize = space.width
    ? clamp(dockWidth, DOCK_MIN, Math.floor(space.width * DOCK_MAX_RATIO))
    : dockWidth

  const report = useCallback(
    (entry: Report): void => {
      pushLine(entry.level, entry.text, entry.detail?.length ? { detail: entry.detail } : undefined)
    },
    [pushLine]
  )

  const reportStage = useCallback((): void => {
    if (!stageEl) return

    const view = document.documentElement
    const width = view.clientWidth
    const height = view.clientHeight
    if (!width || !height) return

    const rect = stageEl.getBoundingClientRect()
    if (!rect.width || !rect.height) return

    const next: StageBox = {
      x: part(rect.left, width),
      y: part(rect.top, height),
      width: part(rect.width, width),
      height: part(rect.height, height)
    }

    if (sameBox(stageBoxRef.current, next)) return
    stageBoxRef.current = next
    window.aft.setStage(next)
  }, [stageEl])

  useEffect(() => {
    const off = window.aft.onState((next) => setState(next))
    window.aft.requestState()
    return off
  }, [])

  useEffect(() => {
    paintTheme(theme)
    storeTheme(theme)
    window.aft.setChrome(themeOf(theme).chrome)
  }, [theme])

  useEffect(() => {
    try {
      window.localStorage.setItem(PAGE_KEY, page)
      window.localStorage.setItem(DOCK_TAB_KEY, dock ?? '')
    } catch {
      return
    }
  }, [dock, page])

  useEffect(() => {
    window.aft.setStageShown(hasStage)
  }, [hasStage])

  useEffect(() => {
    if (!stageEl) return

    const observer = new ResizeObserver(() => reportStage())
    observer.observe(stageEl)
    observer.observe(document.documentElement)
    window.addEventListener('resize', reportStage)
    stageBoxRef.current = null
    reportStage()

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', reportStage)
    }
  }, [reportStage, stageEl])

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
    autoTermRef.current = autoTerm
    storeFlag(AUTO_TERM_KEY, autoTerm)
  }, [autoTerm])

  useEffect(() => {
    autoBackRef.current = autoBack
    storeFlag(AUTO_BACK_KEY, autoBack)
  }, [autoBack])

  useEffect(() => {
    window.aft.publishPrefs({ theme, autoTerminal: autoTerm, autoTerminalRestore: autoBack })
  }, [autoBack, autoTerm, theme])

  useEffect(() => {
    return window.aft.onPrefsPatch((patch) => {
      if (isThemeId(patch.theme)) setTheme(patch.theme)
      if (typeof patch.autoTerminal === 'boolean') setAutoTerm(patch.autoTerminal)
      if (typeof patch.autoTerminalRestore === 'boolean') setAutoBack(patch.autoTerminalRestore)
    })
  }, [])

  useEffect(() => {
    termOpenRef.current = terminalOpen
  }, [terminalOpen])

  useEffect(() => {
    const offUpdate = window.aftRecord.onUpdate((view) => {
      setRecording(view.status === 'recording' || view.status === 'paused')
    })

    const offNotice = window.aftRecord.onNotice((notice) => {
      if (notice.level === 'info') return
      pushLine(notice.level === 'error' ? 'err' : 'note', notice.message, {
        detail: notice.detail.length ? notice.detail : undefined
      })
    })

    return () => {
      offUpdate()
      offNotice()
    }
  }, [pushLine])

  useEffect(() => {
    return window.aft.onFocusUrl(() => urlRef.current?.focus())
  }, [])

  useEffect(() => {
    return window.aft.onFocusTerminal(() => setFocusSeed((prev) => prev + 1))
  }, [])

  useEffect(() => {
    return window.aft.onPointer((spot) => {
      const axis = dragRef.current
      const box = spaceRef.current?.getBoundingClientRect()
      if (!axis || !box) return

      const view = document.documentElement
      if (axis === 'chat') {
        setListWidth(Math.round(spot.x * view.clientWidth - box.left))
        return
      }
      if (axis === 'record') {
        setDockWidth(Math.round(box.right - spot.x * view.clientWidth))
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
    storeSize(LIST_KEY, listSize)
    storeSize(TERM_KEY, termSize)
    storeSize(DOCK_KEY, dockSize)
  }, [drag, listSize, termSize, dockSize])

  const nav = useCallback((kind: NavKind): void => window.aft.nav(kind), [])
  const winAction = useCallback((action: WindowAction): void => window.aft.window(action), [])

  const goBack = useCallback(() => nav('back'), [nav])
  const goForward = useCallback(() => nav('forward'), [nav])
  const goHome = useCallback(() => nav('home'), [nav])
  const refreshPage = useCallback(
    () => nav(state.loading ? 'stop' : 'reload'),
    [nav, state.loading]
  )

  const minimizeWindow = useCallback(() => winAction('minimize'), [winAction])
  const maximizeWindow = useCallback(() => winAction('maximize'), [winAction])
  const closeWindow = useCallback(() => winAction('close'), [winAction])

  const toggleList = useCallback((): void => {
    setListOpen((prev) => {
      const next = !prev
      window.aft.setChat(next)
      return next
    })
  }, [])

  const toggleTerminal = useCallback((): void => {
    window.aft.setTerminal(!terminalOpen)
  }, [terminalOpen])

  const closeTerminal = useCallback((): void => window.aft.setTerminal(false), [])

  const toggleSettings = useCallback((): void => {
    window.aft.setSettings(!settingsOpen)
  }, [settingsOpen])

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

  const beginListDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => beginDrag('chat', event),
    [beginDrag]
  )
  const beginTermDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => beginDrag('terminal', event),
    [beginDrag]
  )
  const beginDockDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => beginDrag('record', event),
    [beginDrag]
  )

  const onPlayBusy = useCallback((running: boolean): void => {
    setPlaying(running)

    if (running) {
      if (!autoTermRef.current || termOpenRef.current) return
      autoOpenedRef.current = true
      window.aft.setTerminal(true)
      return
    }

    if (!autoOpenedRef.current) return
    autoOpenedRef.current = false
    if (autoBackRef.current) window.aft.setTerminal(false)
  }, [])

  const openDock = useCallback((tab: DockTab): void => {
    setDock(tab)
  }, [])

  const pick = useCallback(
    (item: NavItem): void => {
      const next = item.dock ?? null
      setPage(item.id)
      if (item.id !== 'browser') return
      if (!next) {
        setDock(null)
        return
      }
      setDock(page === 'browser' && dock === next ? null : next)
    },
    [dock, page]
  )

  const onSaved = useCallback((): void => {
    setLibrary((prev) => prev + 1)
    setDock('playback')
  }, [])

  const onLibraryChanged = useCallback((): void => setLibrary((prev) => prev + 1), [])

  const requestRun = useCallback((scenarioId: string): void => {
    setRunRequest(scenarioId)
    setPage('browser')
    setDock('playback')
  }, [])

  const runAction = useCallback(
    (action: AgentAction): void => {
      void window.aft
        .execute(action)
        .then((result) => {
          absorbResult(result)
          if (!result.ok) pushLine('err', result.result)
        })
        .catch((error: Error) => pushLine('err', 'Köprü hatası: ' + error.message))
    },
    [absorbResult, pushLine]
  )

  const toggleVision = useCallback(async (): Promise<void> => {
    const next = !state.vision
    setState((prev) => ({ ...prev, vision: next }))
    try {
      const result = await window.aft.setVision(next)
      absorbResult(result)
      pushLine(result.ok ? 'note' : 'err', result.result)
    } catch (error) {
      pushLine('err', 'Köprü hatası: ' + (error as Error).message)
    }
  }, [absorbResult, pushLine, state.vision])

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
      runAction({ action: 'go_to_url', url })
    },
    [runAction, urlDraft]
  )

  const status = useMemo(() => {
    if (recording) return { label: 'kayıtta', tone: 'rec' }
    if (playing) return { label: 'koşumda', tone: 'run' }
    if (state.loading) return { label: 'yükleniyor', tone: 'busy' }
    return { label: 'hazır', tone: 'idle' }
  }, [playing, recording, state.loading])

  return (
    <div className={'shell' + (drag ? ' drag-' + drag : '')}>
      <header className="shell-bar">
        <div className="bar-left">
          <span className="logo" title="AFT">
            <Logo />
          </span>

          {hasStage ? (
            <>
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
                title="Görüş"
                onClick={() => void toggleVision()}
                active={state.vision}
                badge={state.vision ? term.elements.length : 0}
              />
            </>
          ) : (
            <span className="bar-page">{PAGE_LABELS[page]}</span>
          )}
        </div>

        <div className="bar-drag" onDoubleClick={maximizeWindow} />

        {hasStage ? (
          <div className={'omnibox' + (urlFocused ? ' focused' : '')}>
            <input
              ref={urlRef}
              className="omni-input"
              value={urlFocused ? urlDraft : shortUrl(state.url)}
              onChange={(event) => setUrlDraft(event.target.value)}
              onFocus={onUrlFocus}
              onBlur={onUrlBlur}
              onKeyDown={onUrlKeyDown}
              placeholder="Adres"
              spellCheck={false}
              aria-label="Adres çubuğu"
            />
            {state.loading ? <span className="omni-load" /> : null}
          </div>
        ) : null}

        <div className="bar-drag" onDoubleClick={maximizeWindow} />

        <div className="bar-right">
          {page === 'browser' ? (
            <>
              <IconButton name="grid" title="Öğeler" onClick={toggleList} active={listOpen} />
              <IconButton
                name="terminal"
                title="Terminal Ctrl+K"
                onClick={toggleTerminal}
                active={terminalOpen}
              />
            </>
          ) : null}
          <IconButton
            name="settings"
            title="Ayarlar"
            onClick={toggleSettings}
            active={settingsOpen}
          />
          <span className="bar-gap" />
          <IconButton name="minimize" title="Küçült" onClick={minimizeWindow} small />
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
        {NAV.map((item) => {
          const on =
            item.id === page && (item.dock ?? null) === (item.id === 'browser' ? dock : null)
          return (
            <button
              key={item.label}
              className={'nav-btn' + (on ? ' sel' : '')}
              title={item.label}
              aria-label={item.label}
              aria-pressed={on}
              onClick={() => pick(item)}
              type="button"
            >
              <Glyph name={item.glyph} size={17} />
              {item.dock === 'record' && recording ? <span className="nav-dot rec" /> : null}
              {item.dock === 'playback' && playing ? <span className="nav-dot run" /> : null}
            </button>
          )
        })}
      </aside>

      <div className="workspace" ref={spaceRef}>
        {page === 'browser' ? (
          <BrowserPage
            stageRef={setStageEl}
            api={term}
            vision={state.vision}
            listOpen={listOpen}
            listWidth={listSize}
            terminalOpen={terminalOpen}
            termHeight={termSize}
            focusSeed={focusSeed}
            dock={dock}
            dockWidth={dockSize}
            revision={library}
            runRequest={runRequest}
            recording={recording}
            playing={playing}
            onListGrip={beginListDrag}
            onTermGrip={beginTermDrag}
            onDockGrip={beginDockDrag}
            onCloseList={toggleList}
            onCloseTerminal={closeTerminal}
            onDock={openDock}
            onAction={runAction}
            onReport={report}
            onSaved={onSaved}
            onBusy={onPlayBusy}
          />
        ) : null}

        {page === 'scenarios' ? (
          <ScenarioPage
            revision={library}
            busy={playing || recording}
            baseUrl={state.url}
            onReport={report}
            onRun={requestRun}
            onChanged={onLibraryChanged}
          />
        ) : null}

        {page === 'results' ? <ResultPage revision={library} onReport={report} /> : null}
        {page === 'identity' ? <IdentityPage revision={library} onReport={report} /> : null}
        {page === 'coverage' ? <CoveragePage revision={library} onReport={report} /> : null}
        {page === 'data' ? <DataPage revision={library} onReport={report} /> : null}
      </div>

      <footer className="shell-foot">
        <span className={'status-live ' + status.tone} />
        <span className="status-item">{status.label}</span>
        <span className="status-sep" />
        <span className="status-item">{term.elements.length} öğe</span>
        <span className="status-sep" />
        <span className="status-item">{term.lastMs ? formatMs(term.lastMs) : '—'}</span>
        <span className="status-sep" />
        <span className="status-item">görüş {state.vision ? 'açık' : 'kapalı'}</span>
        <span className="status-push" />
        <span className="status-item dim">{state.title}</span>
      </footer>
    </div>
  )
}
