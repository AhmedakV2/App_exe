import { app, BaseWindow, BrowserWindow, WebContentsView, ipcMain, Menu, screen } from 'electron'
import type { Rectangle, WebContents } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { electronApp, is } from '@electron-toolkit/utils'
import {
  mountData,
  mountIdentity,
  mountPlayback,
  mountRecord,
  recordChannel,
  unmountData,
  unmountIdentity,
  unmountPlayback,
  unmountRecord
} from './bridge'
import { BrowserController } from './browser/BrowserController'
import {
  AgentAction,
  AppPrefs,
  BrowserState,
  DragAxis,
  ExecuteResult,
  NavKind,
  ScanReport,
  StageBox,
  WindowAction
} from './browser/types'
import type { ScanLevel } from './discovery'
import { HOME_URL, isHomeUrl, mountHome, registerHomeScheme, setHomeTheme } from './home'

const FRAME = 40
const STAGE_RADIUS = 8
const FRAME_COLOR = '#101114'
const AGENT_PARTITION = 'persist:aft-agent'
const DRAG_TICK = 16
const DRAG_MAX_MS = 30000
const SETTINGS_WIDTH = 392
const SETTINGS_HEIGHT = 620
const SETTINGS_MIN_WIDTH = 320
const SETTINGS_MIN_HEIGHT = 280
const DEVTOOLS_RATIO = 0.45
const DEVTOOLS_MIN = 260
const DEVTOOLS_GAP = 6
const DEVTOOLS_MIN_RATIO = 0.15
const DEVTOOLS_MAX_RATIO = 0.8
const iconPath = app.isPackaged
  ? join(process.resourcesPath, 'build', 'icon.png')
  : join(__dirname, '../../build/icon.png')

let win: BaseWindow
let chatView: WebContentsView
let targetView: WebContentsView
let devtoolsView: WebContentsView | null = null
let controller: BrowserController
let chatOpen = false
let terminalOpen = false
let dragTimer: ReturnType<typeof setInterval> | null = null
let dragAxis: DragAxis | null = null
let dragStartedAt = 0
let layoutQueued = false
let stateQueued = false
let stageBox: StageBox | null = null
let modalOpen = false
let stageShown = true
let pageHold = false
let settingsWin: BrowserWindow | null = null
let settingsSpot: { x: number; y: number } | null = null
let settingsSize = { width: SETTINGS_WIDTH, height: SETTINGS_HEIGHT }
let chromeColor = FRAME_COLOR
let devtoolsOpen = false
let devtoolsRatio = DEVTOOLS_RATIO
let prefs: AppPrefs | null = null

registerHomeScheme()

function preloadPath(): string {
  const mjs = join(__dirname, '../preload/index.mjs')
  return existsSync(mjs) ? mjs : join(__dirname, '../preload/index.js')
}

function visibleArea(): Rectangle {
  const bounds = win.getContentBounds()
  if (!win.isMaximized()) return { x: 0, y: 0, width: bounds.width, height: bounds.height }

  const work = screen.getDisplayMatching(bounds).workArea
  const left = Math.max(0, work.x - bounds.x)
  const top = Math.max(0, work.y - bounds.y)
  const right = Math.max(0, bounds.x + bounds.width - (work.x + work.width))
  const bottom = Math.max(0, bounds.y + bounds.height - (work.y + work.height))

  return {
    x: left,
    y: top,
    width: Math.max(0, bounds.width - left - right),
    height: Math.max(0, bounds.height - top - bottom)
  }
}

function fallbackStage(area: Rectangle): Rectangle {
  return {
    x: area.x + FRAME,
    y: area.y + FRAME,
    width: Math.max(0, area.width - FRAME * 2),
    height: Math.max(0, area.height - FRAME * 2)
  }
}

function stageBounds(area: Rectangle): Rectangle {
  if (!stageBox) return fallbackStage(area)

  const x = area.x + Math.round(stageBox.x * area.width)
  const y = area.y + Math.round(stageBox.y * area.height)
  const width = Math.round(stageBox.width * area.width)
  const height = Math.round(stageBox.height * area.height)

  return {
    x,
    y,
    width: Math.max(0, Math.min(width, area.x + area.width - x)),
    height: Math.max(0, Math.min(height, area.y + area.height - y))
  }
}

function layout(): void {
  if (!win || win.isDestroyed()) return
  const area = visibleArea()
  chatView.setBounds(area)

  const stage = stageBounds(area)
  if (!devtoolsOpen || !devtoolsView) {
    targetView.setBounds(stage)
    return
  }

  const panel = Math.min(
    Math.max(DEVTOOLS_MIN, Math.round(stage.width * devtoolsRatio)),
    Math.max(0, stage.width - DEVTOOLS_MIN - DEVTOOLS_GAP)
  )
  const pageWidth = Math.max(0, stage.width - panel - DEVTOOLS_GAP)

  targetView.setBounds({ x: stage.x, y: stage.y, width: pageWidth, height: stage.height })
  devtoolsView.setBounds({
    x: stage.x + pageWidth + DEVTOOLS_GAP,
    y: stage.y,
    width: panel,
    height: stage.height
  })
}

function readBox(value: unknown): StageBox | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const x = Number(raw.x)
  const y = Number(raw.y)
  const width = Number(raw.width)
  const height = Number(raw.height)

  if (![x, y, width, height].every((part) => Number.isFinite(part))) return null
  if (width <= 0 || height <= 0) return null

  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
    width: Math.min(1, Math.max(0, width)),
    height: Math.min(1, Math.max(0, height))
  }
}

function setStage(value: unknown): void {
  const box = readBox(value)
  if (!box) return
  const current = stageBox
  if (
    current &&
    current.x === box.x &&
    current.y === box.y &&
    current.width === box.width &&
    current.height === box.height
  ) {
    return
  }
  stageBox = box
  layout()
}

function applyStageVisible(): void {
  if (!targetView || targetView.webContents.isDestroyed()) return
  const visible = stageShown && !modalOpen
  targetView.setVisible(visible)
  if (devtoolsView && !devtoolsView.webContents.isDestroyed()) {
    devtoolsView.setVisible(visible && devtoolsOpen)
  }
  if (visible) layout()
}

function closeDevtools(): void {
  const panel = devtoolsView
  devtoolsView = null
  devtoolsOpen = false

  if (targetView && !targetView.webContents.isDestroyed()) targetView.webContents.closeDevTools()
  if (panel) {
    if (win && !win.isDestroyed()) win.contentView.removeChildView(panel)
    if (!panel.webContents.isDestroyed()) panel.webContents.close()
  }
}

function openDevtools(): void {
  if (!win || win.isDestroyed()) return
  if (!targetView || targetView.webContents.isDestroyed()) return
  if (devtoolsOpen && devtoolsView) return

  const panel = new WebContentsView({
    webPreferences: { sandbox: false, contextIsolation: true }
  })

  panel.setBackgroundColor(chromeColor)
  panel.setBorderRadius(STAGE_RADIUS)
  win.contentView.addChildView(panel)

  devtoolsView = panel
  devtoolsOpen = true

  panel.webContents.on('destroyed', () => {
    if (devtoolsView !== panel) return
    devtoolsView = null
    devtoolsOpen = false
    layout()
    pushState()
  })

  targetView.webContents.setDevToolsWebContents(panel.webContents)
  targetView.webContents.openDevTools({ mode: 'detach' })
  layout()
}

function setDevtoolsSplit(value: unknown): void {
  const ratio = Number(value)
  if (!Number.isFinite(ratio)) return

  const next = Math.min(DEVTOOLS_MAX_RATIO, Math.max(DEVTOOLS_MIN_RATIO, ratio))
  if (next === devtoolsRatio) return

  devtoolsRatio = next
  if (devtoolsOpen) layout()
}

function setDevtools(open: boolean): void {
  if (open === devtoolsOpen) return
  if (open) openDevtools()
  else closeDevtools()
  applyStageVisible()
  layout()
  pushState()
}

function setModal(open: boolean): void {
  if (open === modalOpen) return
  modalOpen = open
  applyStageVisible()
}

function setStageShown(open: boolean): void {
  if (open === stageShown) return
  stageShown = open
  applyStageVisible()
}

function setChrome(color: unknown): void {
  if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) return
  chromeColor = color
  if (win && !win.isDestroyed()) win.setBackgroundColor(color)
  if (chatView && !chatView.webContents.isDestroyed()) chatView.setBackgroundColor(color)
  if (settingsAlive()) (settingsWin as BrowserWindow).setBackgroundColor(color)
}

function scheduleLayout(): void {
  if (layoutQueued) return
  layoutQueued = true
  setImmediate(() => {
    layoutQueued = false
    layout()
  })
}

function snapshotState(): BrowserState {
  return {
    url: controller.url(),
    title: controller.title(),
    canGoBack: controller.canGoBack(),
    canGoForward: controller.canGoForward(),
    loading: controller.isLoading(),
    chatOpen,
    terminalOpen,
    settingsOpen: settingsAlive(),
    vision: controller.isVisionOn(),
    devtoolsOpen,
    maximized: !win || win.isDestroyed() ? false : win.isMaximized(),
    fullscreen: !win || win.isDestroyed() ? false : win.isFullScreen()
  }
}

function focusChat(): void {
  if (!chatView || chatView.webContents.isDestroyed()) return
  chatView.webContents.focus()
}

function focusTerminal(): void {
  if (!terminalOpen || modalOpen) return
  if (!chatView || chatView.webContents.isDestroyed()) return
  pageHold = false
  chatView.webContents.focus()
  chatView.webContents.send('aft:focus-terminal')
}

function openPalette(): void {
  if (!chatView || chatView.webContents.isDestroyed()) return
  pageHold = false
  chatView.webContents.focus()
  chatView.webContents.send('aft:open-palette')
}

function focusTerminalOnLoad(): void {
  if (pageHold) return
  focusTerminal()
}

function setChat(open: boolean): void {
  if (open === chatOpen) return
  chatOpen = open
  layout()
  pushState()
}

function settingsAlive(): boolean {
  return Boolean(settingsWin && !settingsWin.isDestroyed())
}

function settingsSpotFor(): { x: number; y: number } | null {
  if (settingsSpot) return settingsSpot
  if (!win || win.isDestroyed()) return null
  const bounds = win.getBounds()
  return {
    x: Math.round(bounds.x + (bounds.width - settingsSize.width) / 2),
    y: Math.round(bounds.y + (bounds.height - settingsSize.height) / 2)
  }
}

function openSettings(): void {
  if (settingsAlive()) {
    const open = settingsWin as BrowserWindow
    if (open.isMinimized()) open.restore()
    open.show()
    open.focus()
    return
  }

  const spot = settingsSpotFor()
  const next = new BrowserWindow({
    width: settingsSize.width,
    height: settingsSize.height,
    ...(spot ?? {}),
    minWidth: SETTINGS_MIN_WIDTH,
    minHeight: SETTINGS_MIN_HEIGHT,
    title: 'Ayarlar',
    icon: iconPath,
    frame: false,
    roundedCorners: false,
    show: false,
    skipTaskbar: true,
    backgroundColor: chromeColor,
    parent: win && !win.isDestroyed() ? win : undefined,
    webPreferences: { preload: preloadPath(), sandbox: false, contextIsolation: true }
  })

  settingsWin = next

  const remember = (): void => {
    if (next.isDestroyed()) return
    const bounds = next.getBounds()
    settingsSpot = { x: bounds.x, y: bounds.y }
    settingsSize = { width: bounds.width, height: bounds.height }
  }

  next.once('ready-to-show', () => {
    if (!next.isDestroyed()) next.show()
  })
  next.webContents.on('did-finish-load', () => {
    if (prefs && !next.isDestroyed()) next.webContents.send('aft:prefs', prefs)
  })
  next.on('move', remember)
  next.on('resize', remember)
  next.on('closed', () => {
    if (settingsWin === next) settingsWin = null
    pushState()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void next
      .loadURL(process.env['ELECTRON_RENDERER_URL'] + '?view=settings')
      .catch(() => undefined)
  } else {
    void next
      .loadFile(join(__dirname, '../renderer/index.html'), { query: { view: 'settings' } })
      .catch(() => undefined)
  }

  pushState()
}

function closeSettings(): void {
  if (!settingsAlive()) return
  ;(settingsWin as BrowserWindow).close()
}

function setSettings(open: boolean): void {
  if (open) openSettings()
  else closeSettings()
}

function repaintHome(): void {
  if (!targetView || targetView.webContents.isDestroyed()) return
  if (!isHomeUrl(targetView.webContents.getURL())) return
  if (controller) controller.reload()
  else targetView.webContents.reload()
}

function publishPrefs(value: unknown): void {
  if (!value || typeof value !== 'object') return
  const raw = value as Partial<AppPrefs>
  if (typeof raw.theme !== 'string') return

  prefs = {
    theme: raw.theme,
    autoTerminal: Boolean(raw.autoTerminal),
    autoTerminalRestore: Boolean(raw.autoTerminalRestore),
    screenshotOnFailure: Boolean(raw.screenshotOnFailure),
    stopOnFailure: Boolean(raw.stopOnFailure),
    verifyState: Boolean(raw.verifyState)
  }

  if (settingsAlive()) (settingsWin as BrowserWindow).webContents.send('aft:prefs', prefs)
  if (setHomeTheme(prefs.theme)) repaintHome()
}

function patchPrefs(patch: unknown): void {
  if (!patch || typeof patch !== 'object') return
  if (!chatView || chatView.webContents.isDestroyed()) return
  chatView.webContents.send('aft:prefs-patch', patch)
}

function setTerminal(open: boolean, focus: boolean): void {
  if (open !== terminalOpen) {
    terminalOpen = open
    if (!open) stopDrag()
    layout()
    pushState()
  }
  if (open && focus) focusTerminal()
}

function sendPointer(): void {
  if (!dragAxis || !win || win.isDestroyed()) {
    stopDrag()
    return
  }

  if (Date.now() - dragStartedAt > DRAG_MAX_MS) {
    stopDrag()
    return
  }

  if (!chatView || chatView.webContents.isDestroyed()) {
    stopDrag()
    return
  }

  const area = visibleArea()
  if (area.width <= 0 || area.height <= 0) return

  const bounds = win.getContentBounds()
  const point = screen.getCursorScreenPoint()

  chatView.webContents.send('aft:pointer', {
    x: (point.x - bounds.x - area.x) / area.width,
    y: (point.y - bounds.y - area.y) / area.height
  })
}

function startDrag(axis: DragAxis): void {
  if (dragTimer) return
  if (axis === 'chat' && !chatOpen) return
  if (axis === 'terminal' && !terminalOpen) return
  dragAxis = axis
  dragStartedAt = Date.now()
  dragTimer = setInterval(sendPointer, DRAG_TICK)
}

function stopDrag(): void {
  if (!dragTimer) return
  clearInterval(dragTimer)
  dragTimer = null
  dragAxis = null
  if (chatView && !chatView.webContents.isDestroyed()) chatView.webContents.send('aft:drag-end')
}

function pushState(): void {
  if (stateQueued) return
  stateQueued = true
  setImmediate(() => {
    stateQueued = false
    if (!chatView || chatView.webContents.isDestroyed()) return
    if (!targetView || targetView.webContents.isDestroyed()) return
    chatView.webContents.send('aft:state', snapshotState())
  })
}

function respond(
  handler: () => Promise<Omit<ExecuteResult, 'ok' | 'vision'> & { ok?: boolean }>
): Promise<ExecuteResult> {
  return handler().then(
    (out) => {
      pushState()
      focusTerminal()
      return {
        ok: out.ok ?? true,
        result: out.result,
        page: out.page,
        outcome: out.outcome,
        vision: controller.isVisionOn()
      }
    },
    (err: unknown) => {
      pushState()
      focusTerminal()
      return {
        ok: false,
        result: err instanceof Error ? err.message : String(err),
        page: null,
        outcome: null,
        vision: controller.isVisionOn()
      }
    }
  )
}
function normalizeLevel(value: unknown): ScanLevel {
  const level = Number(value)
  if (level === 0 || level === 1 || level === 2 || level === 3) return level
  return controller.getLevel()
}

function navigate(kind: NavKind): void {
  switch (kind) {
    case 'back':
      controller.back()
      break
    case 'forward':
      controller.forward()
      break
    case 'reload':
      controller.reload()
      break
    case 'home':
      controller.home(HOME_URL)
      break
    case 'stop':
      controller.stop()
      break
  }
  pushState()
  focusTerminal()
}

function toggleFullScreen(): void {
  if (!win || win.isDestroyed()) return
  win.setFullScreen(!win.isFullScreen())
}

function windowAction(action: WindowAction): void {
  if (!win || win.isDestroyed()) return
  switch (action) {
    case 'minimize':
      win.minimize()
      break
    case 'maximize':
      if (win.isMaximized()) win.unmaximize()
      else win.maximize()
      break
    case 'fullscreen':
      toggleFullScreen()
      break
    case 'close':
      win.close()
      break
  }
  pushState()
}

function toggleHoverCapture(): void {
  const channel = recordChannel()
  if (!channel || !channel.session()) return
  channel.toggleHover()
}

function bindShortcuts(wc: WebContents): void {
  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return

    if (input.key === 'F11') {
      event.preventDefault()
      toggleFullScreen()
      return
    }

    if (input.key === 'F12' && !input.alt && !input.control && !input.meta) {
      event.preventDefault()
      setDevtools(!devtoolsOpen)
      return
    }

    if (input.alt && !input.control && !input.meta && input.key === 'F12') {
      event.preventDefault()
      setTerminal(!terminalOpen, true)
      return
    }

    if (!input.control || input.alt || input.meta) return
    const key = input.key.toLowerCase()

    if (key === 'k') {
      event.preventDefault()
      setTerminal(!terminalOpen, true)
      return
    }

    if (key === 'p') {
      event.preventDefault()
      openPalette()
      return
    }

    if (key === 'h') {
      event.preventDefault()
      toggleHoverCapture()
      return
    }

    if (key === 'l') {
      event.preventDefault()
      focusChat()
      if (!chatView.webContents.isDestroyed()) chatView.webContents.send('aft:focus-url')
    }
  })

  wc.on('input-event', (_event, input) => {
    if (input.type === 'mouseUp') stopDrag()
  })
}

function bindPageFocus(): void {
  targetView.webContents.on('input-event', (_event, input) => {
    if (input.type === 'mouseDown' || input.type === 'keyDown') pageHold = true
  })

  chatView.webContents.on('input-event', (_event, input) => {
    if (input.type === 'mouseDown' || input.type === 'keyDown') pageHold = false
  })

  chatView.webContents.on('did-finish-load', () => {
    chatView.webContents.setZoomFactor(1)
    layout()
    pushState()
    focusTerminal()
  })
}

function bindWindowEvents(): void {
  const sync = (): void => {
    scheduleLayout()
    pushState()
  }
  win.on('resize', sync)
  win.on('maximize', sync)
  win.on('unmaximize', sync)
  win.on('enter-full-screen', sync)
  win.on('leave-full-screen', sync)
  win.on('blur', stopDrag)
}

function bindTargetEvents(): void {
  const wc = targetView.webContents

  wc.setWindowOpenHandler(({ url }) => {
    void wc.loadURL(url).catch(() => undefined)
    return { action: 'deny' }
  })

  wc.on('did-start-loading', pushState)
  wc.on('did-stop-loading', pushState)
  wc.on('page-title-updated', pushState)

  wc.on('did-navigate', () => {
    pushState()
    focusTerminalOnLoad()
  })

  wc.on('did-navigate-in-page', () => {
    controller.sync()
    pushState()
  })

  wc.on('did-finish-load', () => {
    controller.attach()
    controller.sync()
    pushState()
    focusTerminalOnLoad()
  })

  wc.on('did-fail-load', pushState)
}

function createWindow(): void {
  Menu.setApplicationMenu(null)
  win = new BaseWindow({
    width: 1600,
    height: 950,
    minWidth: 900,
    minHeight: 600,
    title: 'AFT',
    icon: iconPath,
    frame: false,
    roundedCorners: false,
    backgroundColor: FRAME_COLOR
  })

  chatView = new WebContentsView({
    webPreferences: { preload: preloadPath(), sandbox: false, contextIsolation: true }
  })

  targetView = new WebContentsView({
    webPreferences: { sandbox: true, contextIsolation: true, partition: AGENT_PARTITION }
  })

  chatView.setBackgroundColor(FRAME_COLOR)
  targetView.setBorderRadius(STAGE_RADIUS)

  win.contentView.addChildView(chatView)
  win.contentView.addChildView(targetView)
  layout()
  bindWindowEvents()
  bindShortcuts(chatView.webContents)
  bindShortcuts(targetView.webContents)
  bindPageFocus()

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    chatView.webContents.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    chatView.webContents.loadFile(join(__dirname, '../renderer/index.html'))
  }

  controller = new BrowserController(targetView)
  controller.attach()
  bindTargetEvents()

  void mountIdentity(controller)
    .then(async (identity) => {
      const playback = await mountPlayback(controller, {
        identity: identity.identity(),
        descriptors: identity.catalog(),
        target: targetView.webContents,
        renderer: chatView.webContents
      })

      const data = await mountData({ scenarios: playback.library() })
      playback.setIndexer(data.indexer())

      mountRecord(controller, {
        identity: identity.identity(),
        descriptors: identity.catalog(),
        scenarios: playback.library(),
        target: targetView.webContents,
        renderer: chatView.webContents
      })
    })
    .catch(() => undefined)
  void targetView.webContents.loadURL(HOME_URL).catch(() => undefined)

  win.on('closed', () => {
    stopDrag()
    closeDevtools()
    void unmountRecord()
      .catch(() => undefined)
      .then(() => unmountData())
      .catch(() => undefined)
      .then(() => unmountPlayback())
      .catch(() => undefined)
      .then(() => unmountIdentity())
      .catch(() => undefined)
      .finally(() => controller.dispose())
  })
  win.show()
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.aft.agent')
  mountHome(AGENT_PARTITION)

  ipcMain.handle('aft:execute', (_e, action: AgentAction): Promise<ExecuteResult> =>
    respond(() => controller.execute(action))
  )

  ipcMain.handle('aft:scan', (_e, level: unknown): Promise<ExecuteResult> =>
    respond(async () => {
      const target = normalizeLevel(level)
      controller.setLevel(target)
      const page = await controller.scan(target)
      return { result: 'Tarama tamamlandı: seviye ' + target, page, outcome: null }
    })
  )

  ipcMain.handle('aft:coverage', async (): Promise<ScanReport | null> => {
    const graph = controller.currentGraph()
    if (!graph) return null
    return {
      url: graph.url,
      title: graph.title,
      level: graph.coverage.level,
      coverage: graph.coverage,
      blindSpots: graph.blindSpots,
      frames: graph.frames.map((frame) => ({
        id: frame.frameId,
        url: frame.url,
        depth: frame.depth,
        failed: frame.failed
      })),
      viewport: {
        width: graph.viewport.width,
        height: graph.viewport.height,
        pageHeight: graph.viewport.pageHeight
      },
      capturedAt: Date.now()
    }
  })

  ipcMain.handle('aft:vision', (_e, on: boolean): Promise<ExecuteResult> =>
    respond(async () => {
      const page = await controller.setVision(on)
      return { result: on ? 'Görüş açıldı' : 'Görüş kapatıldı', page, outcome: null }
    })
  )

  ipcMain.on('aft:nav', (_e, kind: NavKind) => navigate(kind))

  ipcMain.on('aft:window', (_e, action: WindowAction) => windowAction(action))

  ipcMain.on('aft:chat', (_e, open: boolean) => setChat(Boolean(open)))

  ipcMain.on('aft:terminal', (_e, open: boolean) => setTerminal(Boolean(open), Boolean(open)))

  ipcMain.on('aft:drag', (_e, axis: unknown) => {
    if (axis === 'chat' || axis === 'terminal' || axis === 'record' || axis === 'devtools')
      startDrag(axis)
    else stopDrag()
  })

  ipcMain.on('aft:stage', (_e, rect: unknown) => setStage(rect))

  ipcMain.on('aft:modal', (_e, open: boolean) => setModal(Boolean(open)))

  ipcMain.on('aft:stage-shown', (_e, open: boolean) => setStageShown(Boolean(open)))

  ipcMain.on('aft:settings', (_e, open: boolean) => setSettings(Boolean(open)))

  ipcMain.on('aft:devtools', (_e, open: boolean) => setDevtools(Boolean(open)))

  ipcMain.on('aft:devtools-split', (_e, ratio: unknown) => setDevtoolsSplit(ratio))

  ipcMain.on('aft:prefs', (_e, value: unknown) => publishPrefs(value))

  ipcMain.on('aft:prefs-patch', (_e, patch: unknown) => patchPrefs(patch))

  ipcMain.on('aft:chrome', (_e, color: unknown) => setChrome(color))

  ipcMain.on('aft:state', () => pushState())

  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
