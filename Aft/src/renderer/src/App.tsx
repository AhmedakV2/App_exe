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
import { clamp, formatMs } from './format'
import { useConsole } from './useConsole'
import type { Report } from './report'
import type { PlaybackOptions, StepResult } from '../../main/scenario/types'
import BrowserPage from './pages/BrowserPage'
import type { DockTab } from './pages/BrowserPage'
import ScenarioPage from './pages/ScenarioPage'
import ResultPage from './pages/ResultPage'
import IdentityPage from './pages/IdentityPage'
import CoveragePage from './pages/CoveragePage'
import DataPage from './pages/DataPage'
import Drawer from './parts/Drawer'

type PageId = 'browser' | 'scenarios' | 'results' | 'stats' | 'identity' | 'coverage' | 'data'

type NavItem = { id: PageId; label: string; glyph: string; suite?: boolean }

const NAV: NavItem[] = [
  { id: 'browser', label: 'Tarayıcı', glyph: 'globe' },
  { id: 'browser', label: 'Kayıt ve oynatma', glyph: 'suite', suite: true },
  { id: 'scenarios', label: 'Senaryolar', glyph: 'library' },
  { id: 'results', label: 'Sonuçlar', glyph: 'history' },
  { id: 'stats', label: 'İstatistik', glyph: 'spark' },
  { id: 'identity', label: 'Kimlik', glyph: 'pulse' },
  { id: 'coverage', label: 'Kapsam', glyph: 'radar' },
  { id: 'data', label: 'Veri', glyph: 'database' }
]

const PAGE_LABELS: Record<PageId, string> = {
  browser: 'Tarayıcı',
  scenarios: 'Senaryolar',
  results: 'Sonuçlar',
  stats: 'İstatistik',
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
const DEV_KEY = 'aft:devtools-width'
const DOCK_TAB_KEY = 'aft:dock-tab'
const PAGE_KEY = 'aft:page'
const RAIL_KEY = 'aft:rail-mini'
const AUTO_TERM_KEY = 'aft:auto-terminal'
const AUTO_BACK_KEY = 'aft:auto-terminal-restore'
const SHOT_KEY = 'aft:play-screenshot'
const STOP_KEY = 'aft:play-stop'
const STATE_KEY = 'aft:play-verify'

const LIST_SIZE = 300
const TERM_SIZE = 268
const DOCK_SIZE = 380
const DEV_SIZE = 520
const LIST_MIN = 220
const TERM_MIN = 120
const DOCK_MIN = 300
const DEV_MIN = 260
const LIST_MAX_RATIO = 0.5
const TERM_MAX_RATIO = 0.72
const DOCK_MAX_RATIO = 0.62
const DEV_MAX_RATIO = 0.8

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

const Brand = memo(function Brand(): React.JSX.Element {
  return (
    <span className="brand" title="AFT">
      <svg width="18" height="18" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
        <path d="M212 60 L300 60 L458 428 L352 428 L258 188 L182 348 L250 348 L296 398 L258 398 L222 428 L54 428 Z" />
      </svg>
    </span>
  )
})

const STEP_LABELS: Record<string, string> = {
  passed: 'geçti',
  failed: 'kaldı',
  errored: 'hata',
  skipped: 'atlandı'
}

function stepDetail(step: StepResult): string[] {
  const detail: string[] = []
  if (step.resolution) {
    detail.push(
      'kimlik: ' +
        step.resolution.state +
        ' · güven ' +
        Math.round(step.resolution.confidence * 100) +
        '%'
    )
  }
  for (const check of step.assertions) {
    detail.push(
      'doğrulama: ' +
        check.kind +
        ' · beklenen "' +
        check.expected +
        '" · gelen "' +
        check.actual +
        '"'
    )
  }
  if (step.stateCheck && !step.stateCheck.ok) {
    detail.push('durum: ' + step.stateCheck.reasons.join(', '))
  }
  if (step.outcome?.code) detail.push('kod: ' + step.outcome.code)
  if (step.contextId) detail.push('bağlam: ' + step.contextId)
  if (step.message) detail.push(step.message)
  return detail
}

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
  devtoolsOpen: false,
  maximized: false,
  fullscreen: false
}

export default function App(): React.JSX.Element {
  const [state, setState] = useState<BrowserState>(EMPTY_STATE)
  const [page, setPage] = useState<PageId>(() => readPage())
  const [listOpen, setListOpen] = useState(false)
  const [drag, setDrag] = useState<DragAxis | null>(null)
  const [recording, setRecording] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [library, setLibrary] = useState(0)
  const [runRequest, setRunRequest] = useState('')
  const [focusSeed, setFocusSeed] = useState(0)
  const [urlSeed, setUrlSeed] = useState(0)
  const [theme, setTheme] = useState<ThemeId>(() => readTheme())
  const [railMini, setRailMini] = useState(() => readFlag(RAIL_KEY, false))
  const [autoTerm, setAutoTerm] = useState(() => readFlag(AUTO_TERM_KEY, true))
  const [autoBack, setAutoBack] = useState(() => readFlag(AUTO_BACK_KEY, false))
  const [playOptions, setPlayOptions] = useState<Partial<PlaybackOptions>>(() => ({
    screenshotOnFailure: readFlag(SHOT_KEY, true),
    stopOnFailure: readFlag(STOP_KEY, true),
    verifyState: readFlag(STATE_KEY, true)
  }))
  const [listWidth, setListWidth] = useState(() => readSize(LIST_KEY, LIST_SIZE))
  const [termHeight, setTermHeight] = useState(() => readSize(TERM_KEY, TERM_SIZE))
  const [dockWidth, setDockWidth] = useState(() => readSize(DOCK_KEY, DOCK_SIZE))
  const [devWidth, setDevWidth] = useState(() => readSize(DEV_KEY, DEV_SIZE))
  const [dock, setDock] = useState<DockTab>(() => readDock())
  const [space, setSpace] = useState({ width: 0, height: 0 })
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null)
  const [stageWidth, setStageWidth] = useState(0)

  const term = useConsole()
  const { push: pushLine, absorb: absorbResult } = term

  const spaceRef = useRef<HTMLDivElement | null>(null)
  const stageBoxRef = useRef<StageBox | null>(null)
  const stageElRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<DragAxis | null>(null)
  const autoTermRef = useRef(autoTerm)
  const autoBackRef = useRef(autoBack)
  const termOpenRef = useRef(false)
  const autoOpenedRef = useRef(false)
  const lastTabRef = useRef<Exclude<DockTab, null>>('record')

  const terminalOpen = state.terminalOpen
  const settingsOpen = state.settingsOpen
  const devtoolsOpen = state.devtoolsOpen
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
  const devSize = stageWidth
    ? clamp(devWidth, DEV_MIN, Math.floor(stageWidth * DEV_MAX_RATIO))
    : devWidth

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
    storeFlag(RAIL_KEY, railMini)
  }, [railMini])

  useEffect(() => {
    window.aft.setStageShown(hasStage)
  }, [hasStage])

  useEffect(() => {
    if (!stageEl) return

    const observer = new ResizeObserver(() => {
      setStageWidth(Math.round(stageEl.getBoundingClientRect().width))
      reportStage()
    })
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
    storeFlag(SHOT_KEY, Boolean(playOptions.screenshotOnFailure))
    storeFlag(STOP_KEY, Boolean(playOptions.stopOnFailure))
    storeFlag(STATE_KEY, Boolean(playOptions.verifyState))
  }, [playOptions])

  useEffect(() => {
    window.aft.publishPrefs({
      theme,
      autoTerminal: autoTerm,
      autoTerminalRestore: autoBack,
      screenshotOnFailure: Boolean(playOptions.screenshotOnFailure),
      stopOnFailure: Boolean(playOptions.stopOnFailure),
      verifyState: Boolean(playOptions.verifyState)
    })
  }, [autoBack, autoTerm, playOptions, theme])

  useEffect(() => {
    return window.aft.onPrefsPatch((patch) => {
      if (isThemeId(patch.theme)) setTheme(patch.theme)
      if (typeof patch.autoTerminal === 'boolean') setAutoTerm(patch.autoTerminal)
      if (typeof patch.autoTerminalRestore === 'boolean') setAutoBack(patch.autoTerminalRestore)

      const keys = ['screenshotOnFailure', 'stopOnFailure', 'verifyState'] as const
      const next: Partial<PlaybackOptions> = {}
      for (const key of keys) if (typeof patch[key] === 'boolean') next[key] = patch[key]
      if (Object.keys(next).length) setPlayOptions((prev) => ({ ...prev, ...next }))
    })
  }, [])

  useEffect(() => {
    return window.aftPlayback.onProgress((payload) => {
      const step = payload.step
      const label = STEP_LABELS[step.status] ?? step.status
      const head =
        'Adım ' + (step.index + 1) + '/' + payload.total + ' · ' + step.title + ' · ' + label
      pushLine(step.status === 'passed' ? 'ok' : step.status === 'skipped' ? 'note' : 'err', head, {
        ms: step.durationMs,
        detail: stepDetail(step)
      })
    })
  }, [pushLine])

  useEffect(() => {
    termOpenRef.current = terminalOpen
  }, [terminalOpen])

  useEffect(() => {
    if (dock) lastTabRef.current = dock
  }, [dock])

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
    return window.aft.onFocusUrl(() => {
      setPage('browser')
      setUrlSeed((prev) => prev + 1)
    })
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
      if (axis === 'devtools') {
        const stage = stageElRef.current?.getBoundingClientRect()
        if (!stage) return
        setDevWidth(Math.round(stage.right - spot.x * view.clientWidth))
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
    storeSize(DEV_KEY, devSize)
  }, [drag, listSize, termSize, dockSize, devSize])

  useEffect(() => {
    if (!devtoolsOpen || !stageWidth) return
    window.aft.setDevtoolsSplit(devSize / stageWidth)
  }, [devSize, devtoolsOpen, stageWidth])

  const nav = useCallback((kind: NavKind): void => window.aft.nav(kind), [])
  const winAction = useCallback((action: WindowAction): void => window.aft.window(action), [])

  const minimizeWindow = useCallback(() => winAction('minimize'), [winAction])
  const maximizeWindow = useCallback(() => winAction('maximize'), [winAction])
  const closeWindow = useCallback(() => winAction('close'), [winAction])

  const toggleList = useCallback((): void => {
    setPage('browser')
    setListOpen((prev) => {
      const next = !prev
      window.aft.setChat(next)
      return next
    })
  }, [])

  const toggleDrawer = useCallback((): void => {
    window.aft.setTerminal(!terminalOpen)
  }, [terminalOpen])

  const closeDrawer = useCallback((): void => window.aft.setTerminal(false), [])

  const openPalette = useCallback((): void => {
    if (!terminalOpen) window.aft.setTerminal(true)
    setFocusSeed((prev) => prev + 1)
  }, [terminalOpen])

  const toggleSettings = useCallback((): void => {
    window.aft.setSettings(!settingsOpen)
  }, [settingsOpen])

  const toggleRail = useCallback((): void => setRailMini((prev) => !prev), [])

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
  const beginDevDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => beginDrag('devtools', event),
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
      if (!item.suite) {
        setPage(item.id)
        return
      }
      if (page === 'browser' && dock) {
        setDock(null)
        return
      }
      setPage('browser')
      setDock(dock ?? lastTabRef.current)
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

  const onVision = useCallback((): void => void toggleVision(), [toggleVision])

  const status = useMemo(() => {
    if (recording) return { label: 'kayıtta', tone: 'rec' }
    if (playing) return { label: 'koşumda', tone: 'run' }
    if (state.loading) return { label: 'yükleniyor', tone: 'busy' }
    return { label: 'hazır', tone: 'idle' }
  }, [playing, recording, state.loading])

  return (
    <div className={'shell' + (drag ? ' drag-' + drag : '') + (railMini ? ' rail-mini' : '')}>
      <header className="titlebar">
        <div className="title-brand">
          <Brand />
          <span className="title-name">AFT</span>
        </div>

        <div className="title-drag" onDoubleClick={maximizeWindow} />

        <button className="cmd-trigger" onClick={openPalette} type="button">
          <Glyph name="search" size={13} />
          <span className="cmd-text">Komut çalıştır veya ara</span>
          <span className="cmd-key">Ctrl K</span>
        </button>

        <div className="title-drag" onDoubleClick={maximizeWindow} />

        <div className="title-win">
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

      <aside className="sidebar">
        <span className="rail-label">Çalışma alanı</span>

        <nav className="rail-group" aria-label="Ana gezinme">
          {NAV.map((item) => {
            const on = item.suite ? Boolean(dock) : item.id === page && !item.suite
            return (
              <button
                key={item.label}
                className={'nav-item' + (on ? ' sel' : '')}
                title={item.label}
                aria-pressed={on}
                onClick={() => pick(item)}
                type="button"
              >
                <Glyph name={item.glyph} size={16} />
                <span className="nav-text">{item.label}</span>
                {item.suite && recording ? <span className="nav-dot rec" /> : null}
                {item.suite && !recording && playing ? <span className="nav-dot run" /> : null}
              </button>
            )
          })}
        </nav>

        <span className="rail-gap" />

        <span className="rail-label">Araçlar</span>

        <nav className="rail-group" aria-label="Yardımcı araçlar">
          <button
            className={'nav-item' + (listOpen && page === 'browser' ? ' sel' : '')}
            title="Öğeler"
            aria-pressed={listOpen && page === 'browser'}
            onClick={toggleList}
            type="button"
          >
            <Glyph name="grid" size={16} />
            <span className="nav-text">Öğeler</span>
          </button>
          <button
            className={'nav-item' + (terminalOpen ? ' sel' : '')}
            title="Yardımcı panel Ctrl+K"
            aria-pressed={terminalOpen}
            onClick={toggleDrawer}
            type="button"
          >
            <Glyph name="terminal" size={16} />
            <span className="nav-text">Panel</span>
          </button>
          <button
            className={'nav-item' + (settingsOpen ? ' sel' : '')}
            title="Ayarlar"
            aria-pressed={settingsOpen}
            onClick={toggleSettings}
            type="button"
          >
            <Glyph name="settings" size={16} />
            <span className="nav-text">Ayarlar</span>
          </button>
        </nav>

        <div className="rail-foot">
          <button
            className="ghost-btn"
            title={railMini ? 'Kenar çubuğunu genişlet' : 'Kenar çubuğunu daralt'}
            aria-label={railMini ? 'Kenar çubuğunu genişlet' : 'Kenar çubuğunu daralt'}
            onClick={toggleRail}
            type="button"
          >
            <Glyph name={railMini ? 'expand' : 'collapse'} size={15} />
          </button>
        </div>
      </aside>

      <main className="stagearea" ref={spaceRef}>
        <div className="workspace">
          {page === 'browser' ? (
            <BrowserPage
              stageRef={setStageEl}
              state={state}
              visionCount={term.elements.length}
              urlSeed={urlSeed}
              elements={term.elements}
              listOpen={listOpen}
              listWidth={listSize}
              dock={dock}
              dockWidth={dockSize}
              revision={library}
              runRequest={runRequest}
              recording={recording}
              playing={playing}
              onNav={nav}
              onVision={onVision}
              onListGrip={beginListDrag}
              onDockGrip={beginDockDrag}
              onCloseList={toggleList}
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

        {terminalOpen ? (
          <Drawer
            api={term}
            height={termSize}
            focusSeed={focusSeed}
            onGrip={beginTermDrag}
            onClose={closeDrawer}
          />
        ) : null}
      </main>

      <footer className="statusbar">
        <span className={'status-live ' + status.tone} />
        <span className="status-item">{status.label}</span>
        <span className="status-sep" />
        <span className="status-item">{PAGE_LABELS[page]}</span>
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
