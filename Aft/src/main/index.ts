import { app, BaseWindow, WebContentsView, ipcMain, Menu, screen } from 'electron'
import type { Rectangle, WebContents } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { electronApp, is } from '@electron-toolkit/utils'
import {
  mountData,
  mountIdentity,
  mountPlayback,
  mountRecord,
  unmountData,
  unmountIdentity,
  unmountPlayback,
  unmountRecord
} from './bridge'
import { BrowserController } from './browser/BrowserController'
import {
  AgentAction,
  BrowserState,
  DragAxis,
  ExecuteResult,
  NavKind,
  StageBox,
  WindowAction
} from './browser/types'
import type { CoverageSummary, ScanLevel } from './discovery'

const FRAME = 40
const STAGE_RADIUS = 0
const FRAME_COLOR = '#1e1f22'
const HOME_URL = 'https://www.google.com'
const DRAG_TICK = 16
const DRAG_MAX_MS = 30000
const iconPath = app.isPackaged
  ? join(process.resourcesPath, 'build', 'icon.png')
  : join(__dirname, '../../build/icon.png')

let win: BaseWindow
let chatView: WebContentsView
let targetView: WebContentsView
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
let pageHold = false

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
  targetView.setBounds(stageBounds(area))
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

function setModal(open: boolean): void {
  if (open === modalOpen) return
  modalOpen = open
  if (!targetView || targetView.webContents.isDestroyed()) return
  targetView.setVisible(!open)
  if (!open) layout()
}

function setChrome(color: unknown): void {
  if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) return
  if (win && !win.isDestroyed()) win.setBackgroundColor(color)
  if (chatView && !chatView.webContents.isDestroyed()) chatView.setBackgroundColor(color)
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
    vision: controller.isVisionOn(),
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

function bindShortcuts(wc: WebContents): void {
  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return

    if (input.key === 'F11') {
      event.preventDefault()
      toggleFullScreen()
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
    webPreferences: { sandbox: true, contextIsolation: true, partition: 'persist:aft-agent' }
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

  ipcMain.handle('aft:coverage', async (): Promise<CoverageSummary | null> => {
    const graph = controller.currentGraph()
    return graph ? graph.coverage : null
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
    if (axis === 'chat' || axis === 'terminal' || axis === 'record') startDrag(axis)
    else stopDrag()
  })

  ipcMain.on('aft:stage', (_e, rect: unknown) => setStage(rect))

  ipcMain.on('aft:modal', (_e, open: boolean) => setModal(Boolean(open)))

  ipcMain.on('aft:chrome', (_e, color: unknown) => setChrome(color))

  ipcMain.on('aft:state', () => pushState())

  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
