import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AgentAction,
  BrowserState,
  DragAxis,
  NavKind,
  StageBox,
  WindowAction
} from '../../main/browser/types'
import type { ScenarioEntry } from '../../main/scenario/ScenarioStore'
import type { FragileStep, RunRow } from '../../main/data'
import type { HealingProposal } from '../../main/identity'
import { isThemeId, paintTheme, readTheme, storeTheme, themeOf, THEMES } from './themes'
import type { ThemeId } from './themes'
import { Glyph } from './icons'
import { clamp, formatMs, shortUrl } from './format'
import { useConsole } from './useConsole'
import type { Report } from './report'
import { BROWSER_TAB, FIXED_TABS, TAB_GLYPH, readJson, scenarioTab, writeJson } from './workbench'
import type { Activity, BottomTab, OutlineItem, RightTab, Tab } from './workbench'
import TitleBar from './parts/TitleBar'
import type { MenuDef } from './parts/TitleBar'
import ActivityBar from './parts/ActivityBar'
import SidePanel from './parts/SidePanel'
import BottomPanel from './parts/BottomPanel'
import Inspector from './parts/Inspector'
import CommandPalette from './parts/CommandPalette'
import type { PaletteItem } from './parts/CommandPalette'
import BrowserPage from './pages/BrowserPage'
import OverviewPage from './pages/OverviewPage'
import ScenarioPage from './pages/ScenarioPage'
import ResultPage from './pages/ResultPage'
import IdentityPage from './pages/IdentityPage'
import CoveragePage from './pages/CoveragePage'
import DataPage from './pages/DataPage'

const SIDE_KEY = 'aft:wb:side'
const RIGHT_KEY = 'aft:wb:right'
const BOTTOM_KEY = 'aft:wb:bottom'
const SIDE_OPEN_KEY = 'aft:wb:side-open'
const RIGHT_OPEN_KEY = 'aft:wb:right-open'
const RIGHT_TAB_KEY = 'aft:wb:right-tab'
const TABS_KEY = 'aft:wb:tabs'
const ACTIVE_KEY = 'aft:wb:active'
const ACTIVITY_KEY = 'aft:wb:activity'
const AUTO_TERM_KEY = 'aft:auto-terminal'
const AUTO_BACK_KEY = 'aft:auto-terminal-restore'

const SIDE_SIZE = 260
const RIGHT_SIZE = 360
const BOTTOM_SIZE = 220
const SIDE_MIN = 180
const RIGHT_MIN = 280
const BOTTOM_MIN = 110
const ACT_WIDTH = 46

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

function sameBox(a: StageBox | null, b: StageBox): boolean {
  if (!a) return false
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

function part(value: number, total: number): number {
  if (!total) return 0
  return Math.round((value / total) * 10000) / 10000
}

function readSize(key: string, fallback: number): number {
  const raw = readJson<number>(key, fallback)
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : fallback
}

function readTabs(): Tab[] {
  const stored = readJson<Tab[]>(TABS_KEY, [])
  const valid = stored.filter((tab) => tab && typeof tab.id === 'string' && tab.id !== 'browser')
  return [BROWSER_TAB, ...(valid.length ? valid : [FIXED_TABS.overview])]
}

export default function App(): React.JSX.Element {
  const [state, setState] = useState<BrowserState>(EMPTY_STATE)
  const [activity, setActivity] = useState<Activity>(() =>
    readJson<Activity>(ACTIVITY_KEY, 'files')
  )
  const [tabs, setTabs] = useState<Tab[]>(() => readTabs())
  const [active, setActive] = useState<string>(() => readJson<string>(ACTIVE_KEY, 'overview'))
  const [sideOpen, setSideOpen] = useState(() => readJson<boolean>(SIDE_OPEN_KEY, true))
  const [rightOpen, setRightOpen] = useState(() => readJson<boolean>(RIGHT_OPEN_KEY, true))
  const [rightTab, setRightTab] = useState<RightTab>(() =>
    readJson<RightTab>(RIGHT_TAB_KEY, 'record')
  )
  const [bottomTab, setBottomTab] = useState<BottomTab>('console')
  const [sideWidth, setSideWidth] = useState(() => readSize(SIDE_KEY, SIDE_SIZE))
  const [rightWidth, setRightWidth] = useState(() => readSize(RIGHT_KEY, RIGHT_SIZE))
  const [bottomHeight, setBottomHeight] = useState(() => readSize(BOTTOM_KEY, BOTTOM_SIZE))
  const [drag, setDrag] = useState<DragAxis | null>(null)
  const [space, setSpace] = useState({ width: 0, height: 0 })
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null)
  const [palette, setPalette] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [recording, setRecording] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [library, setLibrary] = useState(0)
  const [runRequest, setRunRequest] = useState('')
  const [focusSeed, setFocusSeed] = useState(0)
  const [urlSeed, setUrlSeed] = useState(0)
  const [theme, setTheme] = useState<ThemeId>(() => readTheme())
  const [autoTerm, setAutoTerm] = useState(() => readJson<boolean>(AUTO_TERM_KEY, true))
  const [autoBack, setAutoBack] = useState(() => readJson<boolean>(AUTO_BACK_KEY, false))
  const [scenarios, setScenarios] = useState<ScenarioEntry[]>([])
  const [runs, setRuns] = useState<RunRow[]>([])
  const [approvals, setApprovals] = useState<HealingProposal[]>([])
  const [fragile, setFragile] = useState<FragileStep[]>([])
  const [outline, setOutline] = useState<OutlineItem[]>([])
  const [outlineSel, setOutlineSel] = useState('')
  const [outlineSeed, setOutlineSeed] = useState({ id: '', n: 0 })
  const [runFocus, setRunFocus] = useState('')
  const [identityTab, setIdentityTab] = useState('approvals')
  const [dirtyTabs, setDirtyTabs] = useState<Record<string, boolean>>({})

  const term = useConsole()
  const { push: pushLine, absorb: absorbResult } = term

  const mainRef = useRef<HTMLDivElement | null>(null)
  const stageBoxRef = useRef<StageBox | null>(null)
  const dragRef = useRef<DragAxis | null>(null)
  const autoTermRef = useRef(autoTerm)
  const autoBackRef = useRef(autoBack)
  const termOpenRef = useRef(false)
  const autoOpenedRef = useRef(false)

  const terminalOpen = state.terminalOpen
  const settingsOpen = state.settingsOpen
  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === active) ?? BROWSER_TAB,
    [active, tabs]
  )
  const hasStage = activeTab.kind === 'browser'

  const sideSize = space.width
    ? clamp(sideWidth, SIDE_MIN, Math.floor(space.width * 0.45))
    : sideWidth
  const rightSize = space.width
    ? clamp(rightWidth, RIGHT_MIN, Math.floor(space.width * 0.55))
    : rightWidth
  const bottomSize = space.height
    ? clamp(bottomHeight, BOTTOM_MIN, Math.floor(space.height * 0.7))
    : bottomHeight

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
    writeJson(
      TABS_KEY,
      tabs.filter((tab) => tab.id !== 'browser')
    )
    writeJson(ACTIVE_KEY, active)
    writeJson(ACTIVITY_KEY, activity)
  }, [active, activity, tabs])

  useEffect(() => {
    writeJson(SIDE_OPEN_KEY, sideOpen)
    writeJson(RIGHT_OPEN_KEY, rightOpen)
    writeJson(RIGHT_TAB_KEY, rightTab)
  }, [rightOpen, rightTab, sideOpen])

  useEffect(() => {
    window.aft.setStageShown(hasStage)
  }, [hasStage])

  useEffect(() => {
    window.aft.setChat(sideOpen)
  }, [sideOpen])

  useEffect(() => {
    window.aft.setModal(palette || menuOpen)
  }, [menuOpen, palette])

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
    const el = mainRef.current
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
    writeJson(AUTO_TERM_KEY, autoTerm)
  }, [autoTerm])

  useEffect(() => {
    autoBackRef.current = autoBack
    writeJson(AUTO_BACK_KEY, autoBack)
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
    return window.aft.onFocusUrl(() => {
      setActive('browser')
      setUrlSeed((prev) => prev + 1)
    })
  }, [])

  useEffect(() => {
    return window.aft.onFocusTerminal(() => {
      setBottomTab('console')
      setFocusSeed((prev) => prev + 1)
    })
  }, [])

  useEffect(() => {
    return window.aft.onPointer((spot) => {
      const axis = dragRef.current
      const box = mainRef.current?.getBoundingClientRect()
      if (!axis || !box) return
      const view = document.documentElement
      if (axis === 'chat') {
        setSideWidth(Math.round(spot.x * view.clientWidth - box.left - ACT_WIDTH))
        return
      }
      if (axis === 'record') {
        setRightWidth(Math.round(box.right - spot.x * view.clientWidth))
        return
      }
      setBottomHeight(Math.round(box.bottom - spot.y * view.clientHeight))
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
    writeJson(SIDE_KEY, sideSize)
    writeJson(RIGHT_KEY, rightSize)
    writeJson(BOTTOM_KEY, bottomSize)
  }, [drag, sideSize, rightSize, bottomSize])

  const loadSide = useCallback(async (): Promise<void> => {
    try {
      const [list, recent, health, pending] = await Promise.all([
        window.aftPlayback.list(),
        window.aftData.runs({ limit: 60, offset: 0 }),
        window.aftData.health(),
        window.aftIdentity.approvals()
      ])
      if (list.ok && list.data) setScenarios(list.data.entries)
      if (recent.ok && recent.data) setRuns(recent.data.rows)
      if (health.ok && health.data) setFragile(health.data.fragile)
      if (pending.ok && pending.data) setApprovals(pending.data)
    } catch (error) {
      pushLine('err', 'Köprü hatası: ' + (error as Error).message)
    }
  }, [pushLine])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSide(), 0)
    return () => window.clearTimeout(timer)
  }, [library, loadSide, playing, recording])

  const openTab = useCallback((tab: Tab): void => {
    setTabs((prev) => (prev.some((item) => item.id === tab.id) ? prev : prev.concat(tab)))
    setActive(tab.id)
  }, [])

  const closeTab = useCallback(
    (id: string): void => {
      if (id === 'browser') return
      setTabs((prev) => {
        const index = prev.findIndex((tab) => tab.id === id)
        if (index < 0) return prev
        const next = prev.filter((tab) => tab.id !== id)
        if (active === id) setActive(next[Math.max(0, index - 1)]?.id ?? 'browser')
        return next
      })
      setDirtyTabs((prev) => {
        if (!prev[id]) return prev
        const next = { ...prev }
        delete next[id]
        return next
      })
    },
    [active]
  )

  const openScenario = useCallback(
    (id: string, title: string): void => {
      openTab(scenarioTab(id, title))
      setActivity('files')
    },
    [openTab]
  )

  const openRun = useCallback(
    (id: string): void => {
      setRunFocus(id)
      openTab(FIXED_TABS.results)
    },
    [openTab]
  )

  const openIdentity = useCallback(
    (tab: string): void => {
      setIdentityTab(tab)
      openTab(FIXED_TABS.identity)
    },
    [openTab]
  )

  const pickActivity = useCallback(
    (next: Activity): void => {
      if (next === activity && sideOpen && next === 'files') {
        setSideOpen(false)
        return
      }
      setActivity(next)
      setSideOpen(true)
      if (next === 'browser') setActive('browser')
      if (next === 'runs') openTab(FIXED_TABS.results)
      if (next === 'identity') openTab(FIXED_TABS.identity)
      if (next === 'coverage') openTab(FIXED_TABS.coverage)
      if (next === 'data') openTab(FIXED_TABS.data)
    },
    [activity, openTab, sideOpen]
  )

  const nav = useCallback((kind: NavKind): void => window.aft.nav(kind), [])
  const winAction = useCallback((action: WindowAction): void => window.aft.window(action), [])
  const toggleSettings = useCallback(
    (): void => window.aft.setSettings(!settingsOpen),
    [settingsOpen]
  )
  const toggleBottom = useCallback(
    (): void => window.aft.setTerminal(!terminalOpen),
    [terminalOpen]
  )
  const closeBottom = useCallback((): void => window.aft.setTerminal(false), [])

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

  const showRight = useCallback((tab: RightTab): void => {
    setRightTab(tab)
    setRightOpen(true)
  }, [])

  const onSaved = useCallback((): void => {
    setLibrary((prev) => prev + 1)
    showRight('playback')
  }, [showRight])

  const onLibraryChanged = useCallback((): void => setLibrary((prev) => prev + 1), [])

  const requestRun = useCallback(
    (scenarioId: string): void => {
      setRunRequest(scenarioId)
      setActive('browser')
      showRight('playback')
    },
    [showRight]
  )

  const startRecord = useCallback((): void => {
    setActive('browser')
    showRight('record')
    void window.aftRecord.start({}).then((result) => {
      if (!result.ok) pushLine('err', 'Kayıt başlatılamadı: ' + result.message)
    })
  }, [pushLine, showRight])

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

  const scanPage = useCallback(
    async (level = 1): Promise<void> => {
      try {
        const result = await window.aft.scan(level)
        absorbResult(result)
        pushLine(result.ok ? 'ok' : 'err', result.result)
        setLibrary((prev) => prev + 1)
      } catch (error) {
        pushLine('err', 'Köprü hatası: ' + (error as Error).message)
      }
    },
    [absorbResult, pushLine]
  )

  const onOutline = useCallback((items: OutlineItem[], selected: string): void => {
    setOutline(items)
    setOutlineSel(selected)
  }, [])

  const onDirty = useCallback((id: string, dirty: boolean): void => {
    setDirtyTabs((prev) => (prev[id] === dirty ? prev : { ...prev, [id]: dirty }))
  }, [])

  const onScenarioOpened = useCallback((previousId: string, id: string, title: string): void => {
    const next = scenarioTab(id, title)
    setTabs((prev) => prev.map((tab) => (tab.id === previousId ? next : tab)))
    setActive((prev) => (prev === previousId ? next.id : prev))
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!event.ctrlKey || event.altKey || event.metaKey) return
      const key = event.key.toLowerCase()
      if (key === 'p') {
        event.preventDefault()
        setPalette((prev) => !prev)
        return
      }
      if (key === 'n') {
        event.preventDefault()
        openScenario('', '')
        return
      }
      if (key === 'b') {
        event.preventDefault()
        setSideOpen((prev) => !prev)
        return
      }
      if (key === 'j') {
        event.preventDefault()
        setRightOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openScenario])

  const problems = useMemo(
    () => term.lines.filter((line) => line.kind === 'err').slice(-60),
    [term.lines]
  )

  const status = useMemo(() => {
    if (recording) return { label: 'kayıtta', tone: 'rec' }
    if (playing) return { label: 'koşumda', tone: 'run' }
    if (state.loading) return { label: 'yükleniyor', tone: 'idle' }
    return { label: 'hazır', tone: 'idle' }
  }, [playing, recording, state.loading])

  const menus = useMemo<MenuDef[]>(
    () => [
      {
        label: 'Dosya',
        items: [
          { label: 'Yeni senaryo', kbd: 'Ctrl N', onPick: () => openScenario('', '') },
          { label: 'Genel bakış', onPick: () => openTab(FIXED_TABS.overview) },
          'sep',
          { label: 'Ayarlar', onPick: () => window.aft.setSettings(true) },
          'sep',
          { label: 'Çıkış', onPick: () => winAction('close') }
        ]
      },
      {
        label: 'Görünüm',
        items: [
          { label: 'Yan panel', kbd: 'Ctrl B', onPick: () => setSideOpen((prev) => !prev) },
          { label: 'Alt panel', kbd: 'Ctrl K', onPick: toggleBottom },
          { label: 'Denetçi', kbd: 'Ctrl J', onPick: () => setRightOpen((prev) => !prev) },
          'sep',
          { label: 'Tarayıcı', onPick: () => pickActivity('browser') },
          { label: 'Koşumlar', onPick: () => pickActivity('runs') },
          { label: 'Kimlik', onPick: () => pickActivity('identity') },
          { label: 'Kapsam', onPick: () => pickActivity('coverage') },
          { label: 'Veri', onPick: () => pickActivity('data') },
          'sep',
          ...THEMES.map((item) => ({
            label: (item.id === theme ? '● ' : '○ ') + item.label,
            onPick: () => setTheme(item.id)
          })),
          'sep',
          { label: 'Tam ekran', kbd: 'F11', onPick: () => winAction('fullscreen') }
        ]
      },
      {
        label: 'Çalıştır',
        items: [
          { label: 'Senaryo çalıştır', onPick: () => requestRun(''), disabled: recording },
          { label: 'Sayfayı tara (seviye 1)', onPick: () => void scanPage(1) },
          { label: 'Sayfayı tara (seviye 2)', onPick: () => void scanPage(2) },
          { label: 'Görüşü aç / kapat', onPick: () => void toggleVision() },
          'sep',
          { label: 'Adres çubuğu', kbd: 'Ctrl L', onPick: () => setUrlSeed((prev) => prev + 1) }
        ]
      },
      {
        label: 'Kayıt',
        items: [
          { label: 'Kaydı başlat', onPick: startRecord, disabled: recording || playing },
          {
            label: 'Kaydı durdur',
            onPick: () => void window.aftRecord.stop(),
            disabled: !recording
          },
          'sep',
          { label: 'Kayıt panelini aç', onPick: () => showRight('record') }
        ]
      },
      {
        label: 'Yardım',
        items: [
          { label: 'Komut paleti', kbd: 'Ctrl P', onPick: () => setPalette(true) },
          { label: 'Konsol komutları', onPick: () => void term.submit('a') }
        ]
      }
    ],
    [
      openScenario,
      openTab,
      pickActivity,
      playing,
      recording,
      requestRun,
      scanPage,
      showRight,
      startRecord,
      term,
      theme,
      toggleBottom,
      toggleVision,
      winAction
    ]
  )

  const paletteItems = useMemo<PaletteItem[]>(() => {
    const items: PaletteItem[] = [
      {
        id: 'c:record',
        group: 'Komutlar',
        label: recording ? 'Kaydı durdur' : 'Kaydı başlat',
        glyph: 'record',
        run: recording ? () => void window.aftRecord.stop() : startRecord
      },
      {
        id: 'c:play',
        group: 'Komutlar',
        label: 'Senaryo çalıştır',
        detail: 'oynatma panelini açar',
        glyph: 'play',
        run: () => requestRun('')
      },
      {
        id: 'c:scan1',
        group: 'Komutlar',
        label: 'Sayfayı tara',
        detail: 'seviye 1',
        glyph: 'radar',
        run: () => void scanPage(1)
      },
      {
        id: 'c:scan2',
        group: 'Komutlar',
        label: 'Sayfayı tara',
        detail: 'seviye 2',
        glyph: 'radar',
        run: () => void scanPage(2)
      },
      {
        id: 'c:vision',
        group: 'Komutlar',
        label: state.vision ? 'Görüşü kapat' : 'Görüşü aç',
        glyph: 'eye',
        run: () => void toggleVision()
      },
      {
        id: 'c:new',
        group: 'Komutlar',
        label: 'Yeni senaryo',
        glyph: 'plus',
        kbd: ['Ctrl', 'N'],
        run: () => openScenario('', '')
      },
      {
        id: 'c:term',
        group: 'Komutlar',
        label: terminalOpen ? 'Konsolu kapat' : 'Konsolu aç',
        glyph: 'terminal',
        kbd: ['Ctrl', 'K'],
        run: toggleBottom
      },
      {
        id: 'c:settings',
        group: 'Komutlar',
        label: 'Ayarlar',
        glyph: 'settings',
        run: () => window.aft.setSettings(true)
      },
      {
        id: 'v:browser',
        group: 'Görünümler',
        label: 'Tarayıcı',
        glyph: 'globe',
        run: () => pickActivity('browser')
      },
      {
        id: 'v:overview',
        group: 'Görünümler',
        label: 'Genel bakış',
        glyph: 'dash',
        run: () => openTab(FIXED_TABS.overview)
      },
      {
        id: 'v:results',
        group: 'Görünümler',
        label: 'Koşumlar',
        glyph: 'run',
        run: () => pickActivity('runs')
      },
      {
        id: 'v:identity',
        group: 'Görünümler',
        label: 'Kimlik',
        glyph: 'pulse',
        run: () => pickActivity('identity')
      },
      {
        id: 'v:coverage',
        group: 'Görünümler',
        label: 'Kapsam',
        glyph: 'radar',
        run: () => pickActivity('coverage')
      },
      {
        id: 'v:data',
        group: 'Görünümler',
        label: 'Veri',
        glyph: 'database',
        run: () => pickActivity('data')
      }
    ]
    for (const item of THEMES) {
      items.push({
        id: 't:' + item.id,
        group: 'Tema',
        label: item.label,
        detail: item.note,
        glyph: 'sliders',
        run: () => setTheme(item.id)
      })
    }
    for (const entry of scenarios) {
      items.push({
        id: 's:' + entry.id,
        group: 'Senaryolar',
        label: entry.title,
        detail: entry.steps + ' adım · aç',
        glyph: 'file',
        run: () => openScenario(entry.id, entry.title)
      })
      items.push({
        id: 'r:' + entry.id,
        group: 'Senaryolar',
        label: 'Çalıştır: ' + entry.title,
        detail: entry.steps + ' adım',
        glyph: 'play',
        run: () => requestRun(entry.id)
      })
    }
    for (const row of runs.slice(0, 12)) {
      items.push({
        id: 'run:' + row.id,
        group: 'Son koşumlar',
        label: row.scenarioTitle,
        detail: (row.ok ? 'başarılı' : 'başarısız') + ' · ' + formatMs(row.totalMs),
        glyph: 'history',
        run: () => openRun(row.id)
      })
    }
    return items
  }, [
    openRun,
    openScenario,
    openTab,
    pickActivity,
    recording,
    requestRun,
    runs,
    scanPage,
    scenarios,
    startRecord,
    state.vision,
    terminalOpen,
    toggleBottom,
    toggleVision
  ])

  const crumbs = useMemo(() => {
    if (activeTab.kind === 'browser') return ['Tarayıcı', shortUrl(state.url) || 'ana sayfa']
    if (activeTab.kind === 'scenario') return ['Senaryolar', activeTab.label]
    return [activeTab.label]
  }, [activeTab, state.url])

  const centerTitle =
    activeTab.kind === 'browser' ? state.title || shortUrl(state.url) || 'AFT' : activeTab.label

  const columns =
    (sideOpen ? sideSize + 'px ' : '0px ') + '1fr ' + (rightOpen ? rightSize + 'px' : '0px')

  return (
    <div className={'wb' + (drag ? ' drag-' + drag : '')}>
      <TitleBar
        menus={menus}
        title={centerTitle}
        maximized={state.maximized}
        sideOpen={sideOpen}
        bottomOpen={terminalOpen}
        rightOpen={rightOpen}
        onPalette={() => setPalette(true)}
        onSide={() => setSideOpen((prev) => !prev)}
        onBottom={toggleBottom}
        onRight={() => setRightOpen((prev) => !prev)}
        onWindow={winAction}
        onMenuState={setMenuOpen}
      />

      <div
        className="main"
        ref={mainRef}
        style={{ gridTemplateColumns: ACT_WIDTH + 'px ' + columns }}
      >
        <ActivityBar
          activity={activity}
          recording={recording}
          playing={playing}
          approvals={approvals.length}
          settingsOpen={settingsOpen}
          onPick={pickActivity}
          onSettings={toggleSettings}
        />

        <aside className="side" style={sideOpen ? undefined : { display: 'none' }}>
          <SidePanel
            activity={activity}
            scenarios={scenarios}
            activeScenarioId={activeTab.kind === 'scenario' ? activeTab.scenarioId : ''}
            outline={activeTab.kind === 'scenario' ? outline : []}
            outlineSel={activeTab.kind === 'scenario' ? outlineSel : ''}
            runs={runs}
            activeRunId={activeTab.kind === 'results' ? runFocus : ''}
            approvals={approvals}
            fragile={fragile}
            onOpenScenario={openScenario}
            onNewScenario={() => openScenario('', '')}
            onRunScenario={requestRun}
            onOutline={(id) => setOutlineSeed((prev) => ({ id, n: prev.n + 1 }))}
            onOpenRun={openRun}
            onOpenIdentity={openIdentity}
            onRefresh={() => void loadSide()}
          />
          <div
            className="grip-x right"
            onPointerDown={(event) => beginDrag('chat', event)}
            role="separator"
            aria-orientation="vertical"
            aria-label="Yan panel genişliği"
          />
        </aside>

        <section
          className="editor"
          style={{
            gridTemplateRows:
              'var(--tabs) var(--crumbs) 1fr ' + (terminalOpen ? bottomSize + 'px' : '0px')
          }}
        >
          <div className="tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={'tab' + (tab.id === active ? ' on' : '')}
                onClick={() => setActive(tab.id)}
                onAuxClick={(event) => {
                  if (event.button === 1) closeTab(tab.id)
                }}
                type="button"
              >
                <Glyph name={TAB_GLYPH[tab.kind]} size={13} />
                {tab.label}
                {tab.kind === 'browser' && recording ? <span className="chip bad">REC</span> : null}
                {tab.kind === 'browser' && !recording && playing ? (
                  <span className="chip info">RUN</span>
                ) : null}
                {dirtyTabs[tab.id] ? (
                  <span className="mod" />
                ) : tab.kind === 'browser' ? null : (
                  <span
                    className="x"
                    role="button"
                    aria-label="Sekmeyi kapat"
                    onClick={(event) => {
                      event.stopPropagation()
                      closeTab(tab.id)
                    }}
                  >
                    <Glyph name="close" size={11} />
                  </span>
                )}
              </button>
            ))}
            <span className="push" />
            <div className="ta">
              <button
                className="ib"
                title="Senaryo çalıştır"
                onClick={() => requestRun('')}
                type="button"
              >
                <Glyph name="run" size={13} />
              </button>
              <button
                className="ib"
                title="Kayıt"
                onClick={() => showRight('record')}
                type="button"
              >
                <Glyph name="record" size={13} />
              </button>
            </div>
          </div>

          <div className="crumbs">
            {crumbs.map((item, index) => (
              <React.Fragment key={index}>
                {index ? <span className="sep">›</span> : null}
                <span className={index === crumbs.length - 1 ? 'cur' : ''}>{item}</span>
              </React.Fragment>
            ))}
          </div>

          <div className="content">
            {activeTab.kind === 'browser' ? (
              <BrowserPage
                state={state}
                elementCount={term.elements.length}
                focusSeed={urlSeed}
                stageRef={setStageEl}
                onNav={nav}
                onAction={runAction}
                onVision={() => void toggleVision()}
                onScan={() => void scanPage(1)}
              />
            ) : null}
            {activeTab.kind === 'overview' ? (
              <OverviewPage
                revision={library}
                onReport={report}
                onOpenRun={openRun}
                onOpenIdentity={openIdentity}
                onOpenScenario={openScenario}
                onRecord={startRecord}
              />
            ) : null}
            {activeTab.kind === 'scenario' ? (
              <ScenarioPage
                key={activeTab.id}
                tabId={activeTab.id}
                scenarioId={activeTab.scenarioId}
                revision={library}
                busy={playing || recording}
                baseUrl={state.url}
                outlineSeed={outlineSeed}
                onReport={report}
                onRun={requestRun}
                onChanged={onLibraryChanged}
                onOutline={onOutline}
                onDirty={onDirty}
                onOpened={onScenarioOpened}
                onClose={closeTab}
              />
            ) : null}
            {activeTab.kind === 'results' ? (
              <ResultPage
                revision={library}
                focusRun={runFocus}
                onReport={report}
                onRun={requestRun}
                onFocus={setRunFocus}
              />
            ) : null}
            {activeTab.kind === 'identity' ? (
              <IdentityPage revision={library} initialTab={identityTab} onReport={report} />
            ) : null}
            {activeTab.kind === 'coverage' ? (
              <CoveragePage revision={library} onReport={report} />
            ) : null}
            {activeTab.kind === 'data' ? <DataPage revision={library} onReport={report} /> : null}
          </div>

          <div className="bottom" style={terminalOpen ? undefined : { display: 'none' }}>
            <div
              className="grip-y"
              onPointerDown={(event) => beginDrag('terminal', event)}
              role="separator"
              aria-orientation="horizontal"
              aria-label="Alt panel yüksekliği"
            />
            <BottomPanel
              tab={bottomTab}
              api={term}
              focusSeed={focusSeed}
              problems={problems}
              onTab={setBottomTab}
              onClose={closeBottom}
            />
          </div>
        </section>

        <aside className="right" style={rightOpen ? undefined : { display: 'none' }}>
          <div
            className="grip-x left"
            onPointerDown={(event) => beginDrag('record', event)}
            role="separator"
            aria-orientation="vertical"
            aria-label="Denetçi genişliği"
          />
          <Inspector
            tab={rightTab}
            recording={recording}
            playing={playing}
            vision={state.vision}
            elements={term.elements}
            revision={library}
            runRequest={runRequest}
            onTab={setRightTab}
            onClose={() => setRightOpen(false)}
            onAction={runAction}
            onReport={report}
            onSaved={onSaved}
            onBusy={onPlayBusy}
          />
        </aside>
      </div>

      <footer className="status">
        <span className={'st-item ' + (status.tone === 'idle' ? 'brand' : status.tone)}>
          {status.tone === 'idle' ? 'AFT' : status.label.toUpperCase()}
        </span>
        {state.loading ? <span className="st-item">yükleniyor</span> : null}
        <button
          className="st-item"
          onClick={() => openIdentity('approvals')}
          type="button"
          title="Bekleyen onay"
        >
          <Glyph name="pulse" size={12} />
          {approvals.length}
        </button>
        <button
          className="st-item"
          onClick={() => setBottomTab('problems')}
          type="button"
          title="Sorunlar"
        >
          <Glyph name="alert" size={12} />
          {problems.length}
        </button>
        <span className="push" />
        <span className="st-item dim">{state.title}</span>
        <span className="st-item">{term.elements.length} öğe</span>
        <span className="st-item mono">{term.lastMs ? formatMs(term.lastMs) : '—'}</span>
        <span className="st-item">görüş {state.vision ? 'açık' : 'kapalı'}</span>
        <button
          className="st-item"
          onClick={() => window.aft.setSettings(true)}
          type="button"
          title="Tema"
        >
          {themeOf(theme).label}
        </button>
      </footer>

      {palette ? (
        <CommandPalette
          items={paletteItems}
          onClose={() => setPalette(false)}
          onConsole={(command) => {
            window.aft.setTerminal(true)
            setBottomTab('console')
            void term.submit(command)
          }}
        />
      ) : null}
    </div>
  )
}
