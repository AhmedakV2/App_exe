import { app, BaseWindow, WebContentsView, ipcMain, Menu, screen } from 'electron'
import type { Rectangle, WebContents } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { electronApp, is } from '@electron-toolkit/utils'
import { mountIdentity, mountPlayback, unmountIdentity, unmountPlayback } from './bridge'
import { BrowserController } from './browser/BrowserController'
import { AgentAction, BrowserState, ExecuteResult, NavKind, WindowAction } from './browser/types'
import type { CoverageSummary, ScanLevel } from './discovery'

const FRAME = 40
const DIVIDER = 0
const CHAT_WIDTH = 320
const STAGE_RADIUS = 0
const FRAME_COLOR = '#1e1f22'
const HOME_URL = 'https://www.google.com'
const TERMINAL_HEIGHT = 268
const TERMINAL_MIN = 132
const TERMINAL_MAX_RATIO = 0.72
const RESIZE_TICK = 16
const RESIZE_MAX_MS = 20000
const iconPath = app.isPackaged
  ? join(process.resourcesPath, 'build', 'icon.png')
  : join(__dirname, '../../build/icon.png')

let win: BaseWindow
let chatView: WebContentsView
let targetView: WebContentsView
let controller: BrowserController
let chatOpen = false
let terminalOpen = true
let terminalHeight = TERMINAL_HEIGHT
let resizeTimer: ReturnType<typeof setInterval> | null = null
let resizeStartedAt = 0
let layoutQueued = false
let stateQueued = false

function preloadPath(): string {
  const mjs = join(__dirname, '../preload/index.mjs')
  return existsSync(mjs) ? mjs : join(__dirname, '../preload/index.js')
}

function chatBlock(total: number): number {
  const usable = Math.max(0, total - FRAME * 2)
  const wanted = chatOpen ? CHAT_WIDTH + DIVIDER : 0
  return Math.max(0, Math.min(wanted, usable))
}

function terminalLimit(height: number): number {
  const usable = Math.max(0, height - FRAME * 2)
  return Math.max(0, Math.floor(usable * TERMINAL_MAX_RATIO))
}

function terminalBlock(height: number): number {
  if (!terminalOpen) return 0
  return Math.max(0, Math.min(terminalHeight, terminalLimit(height)))
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

function layout(): void {
  if (!win || win.isDestroyed()) return
  const area = visibleArea()
  const x = area.x + FRAME + chatBlock(area.width)
  const y = area.y + FRAME
  const bottom = area.y + area.height - FRAME - terminalBlock(area.height)

  chatView.setBounds(area)
  targetView.setBounds({
    x,
    y,
    width: Math.max(0, area.x + area.width - FRAME - x),
    height: Math.max(0, bottom - y)
  })
}

function scheduleLayout(): void {
  if (layoutQueued) return
  layoutQueued = true
  setImmediate(() => {
    layoutQueued = false
    layout()
  })
}

function terminalSize(): number {
  if (!win || win.isDestroyed()) return terminalOpen ? terminalHeight : 0
  return terminalBlock(visibleArea().height)
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
    terminalHeight: terminalSize(),
    vision: controller.isVisionOn(),
    maximized: !win || win.isDestroyed() ? false : win.isMaximized(),
    fullscreen: !win || win.isDestroyed() ? false : win.isFullScreen()
  }
}

function focusChat(): void {
  if (!chatView || chatView.webContents.isDestroyed()) return
  chatView.webContents.focus()
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
    if (!open) stopResize()
    layout()
    pushState()
  }
  if (open && focus) focusChat()
}

function applyCursorHeight(): void {
  if (!win || win.isDestroyed() || !terminalOpen) {
    stopResize()
    return
  }

  if (Date.now() - resizeStartedAt > RESIZE_MAX_MS) {
    stopResize()
    return
  }

  const area = visibleArea()
  const bounds = win.getContentBounds()
  const limit = terminalLimit(area.height)
  const floor = Math.min(TERMINAL_MIN, limit)
  const localY = screen.getCursorScreenPoint().y - bounds.y
  const wanted = Math.round(area.y + area.height - FRAME - localY)
  const next = Math.max(floor, Math.min(limit, wanted))

  if (next === terminalHeight) return
  terminalHeight = next
  layout()
  pushState()
}

function startResize(): void {
  if (resizeTimer || !terminalOpen) return
  resizeStartedAt = Date.now()
  resizeTimer = setInterval(applyCursorHeight, RESIZE_TICK)
}

function stopResize(): void {
  if (!resizeTimer) return
  clearInterval(resizeTimer)
  resizeTimer = null
  pushState()
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

    if (key === '`') {
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
    if (input.type === 'mouseUp') stopResize()
  })
}

function bindWindowEvents(): void {
  const sync = (): void => {
    scheduleLayout()
    pushState()
  }
  win.on('resize', scheduleLayout)
  win.on('maximize', sync)
  win.on('unmaximize', sync)
  win.on('enter-full-screen', sync)
  win.on('leave-full-screen', sync)
  win.on('blur', stopResize)
}

function bindTargetEvents(): void {
  const wc = targetView.webContents

  wc.setWindowOpenHandler(({ url }) => {
    void wc.loadURL(url).catch(() => undefined)
    return { action: 'deny' }
  })

  wc.on('did-start-loading', pushState)
  wc.on('did-stop-loading', pushState)
  wc.on('did-navigate', pushState)
  wc.on('page-title-updated', pushState)

  wc.on('did-navigate-in-page', () => {
    controller.sync()
    pushState()
  })

  wc.on('did-finish-load', () => {
    controller.attach()
    controller.sync()
    pushState()
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
    roundedCorners: true,
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

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    chatView.webContents.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    chatView.webContents.loadFile(join(__dirname, '../renderer/index.html'))
  }

  controller = new BrowserController(targetView)
  controller.attach()
  bindTargetEvents()

  void mountIdentity(controller)
    .then((identity) =>
      mountPlayback(controller, {
        identity: identity.identity(),
        descriptors: identity.catalog(),
        target: targetView.webContents,
        renderer: chatView.webContents
      })
    )
    .catch(() => undefined)
  void targetView.webContents.loadURL(HOME_URL).catch(() => undefined)

  win.on('closed', () => {
    stopResize()
    void unmountPlayback()
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

  ipcMain.on('aft:terminal-resize', (_e, active: boolean) => {
    if (active) startResize()
    else stopResize()
  })

  ipcMain.on('aft:state', () => pushState())

  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
