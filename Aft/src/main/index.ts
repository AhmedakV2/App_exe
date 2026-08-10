import { app, BaseWindow, WebContentsView, ipcMain, Menu } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { electronApp, is } from '@electron-toolkit/utils'
import { BrowserController } from './browser/BrowserController'
import { AgentAction, BrowserState, ExecuteResult, NavKind } from './browser/types'
import type { CoverageSummary, ScanLevel } from './discovery'

const RAIL_WIDTH = 56
const CHAT_WIDTH = 400
const HOME_URL = 'https://www.google.com'
const iconPath = app.isPackaged
  ? join(process.resourcesPath, 'build', 'icon.png')
  : join(__dirname, '../../build/icon.png')

let win: BaseWindow
let chatView: WebContentsView
let targetView: WebContentsView
let controller: BrowserController
let chatOpen = true
let layoutQueued = false
let stateQueued = false

function preloadPath(): string {
  const mjs = join(__dirname, '../preload/index.mjs')
  return existsSync(mjs) ? mjs : join(__dirname, '../preload/index.js')
}

function sideWidth(total: number): number {
  const wanted = chatOpen ? RAIL_WIDTH + CHAT_WIDTH : RAIL_WIDTH
  return Math.max(RAIL_WIDTH, Math.min(wanted, total))
}

function layout(): void {
  if (!win || win.isDestroyed()) return
  const { width, height } = win.getContentBounds()
  const side = sideWidth(width)
  chatView.setBounds({ x: 0, y: 0, width: side, height })
  targetView.setBounds({ x: side, y: 0, width: Math.max(0, width - side), height })
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
    vision: controller.isVisionOn()
  }
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
  handler: () => Promise<{ result: string; page: ExecuteResult['page'] }>
): Promise<ExecuteResult> {
  return handler().then(
    (out) => {
      pushState()
      return { ok: true, result: out.result, page: out.page, vision: controller.isVisionOn() }
    },
    (err: unknown) => {
      pushState()
      return {
        ok: false,
        result: err instanceof Error ? err.message : String(err),
        page: null,
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
  win = new BaseWindow({ width: 1600, height: 950, title: 'AFT', icon: iconPath })

  chatView = new WebContentsView({
    webPreferences: { preload: preloadPath(), sandbox: false, contextIsolation: true }
  })

  targetView = new WebContentsView({
    webPreferences: { sandbox: true, contextIsolation: true, partition: 'persist:aft-agent' }
  })

  win.contentView.addChildView(chatView)
  win.contentView.addChildView(targetView)
  layout()
  win.on('resize', scheduleLayout)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    chatView.webContents.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    chatView.webContents.loadFile(join(__dirname, '../renderer/index.html'))
  }

  controller = new BrowserController(targetView)
  controller.attach()
  bindTargetEvents()

  void targetView.webContents.loadURL(HOME_URL).catch(() => undefined)

  win.on('closed', () => controller.dispose())
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
      return { result: 'Tarama tamam: seviye ' + target, page }
    })
  )

  ipcMain.handle('aft:coverage', async (): Promise<CoverageSummary | null> => {
    const graph = controller.currentGraph()
    return graph ? graph.coverage : null
  })

  ipcMain.handle('aft:vision', (_e, on: boolean): Promise<ExecuteResult> =>
    respond(async () => {
      const page = await controller.setVision(on)
      return { result: on ? 'Gorus acildi' : 'Gorus kapatildi', page }
    })
  )

  ipcMain.on('aft:nav', (_e, kind: NavKind) => navigate(kind))

  ipcMain.on('aft:chat', (_e, open: boolean) => {
    const next = Boolean(open)
    if (next === chatOpen) return
    chatOpen = next
    layout()
    pushState()
  })

  ipcMain.on('aft:state', () => pushState())

  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
