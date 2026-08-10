import { app, BaseWindow, WebContentsView, ipcMain, Menu } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { electronApp, is } from '@electron-toolkit/utils'
import { BrowserController } from './browser/BrowserController'
import { AgentAction, ExecuteResult } from './browser/types'
import type { CoverageSummary, ScanLevel } from './discovery'

const CHAT_WIDTH = 420
const HOME_URL = 'https://www.google.com'
const iconPath = app.isPackaged
  ? join(process.resourcesPath, 'build', 'icon.png')
  : join(__dirname, '../../build/icon.png')

let win: BaseWindow
let chatView: WebContentsView
let targetView: WebContentsView
let controller: BrowserController

function preloadPath(): string {
  const mjs = join(__dirname, '../preload/index.mjs')
  return existsSync(mjs) ? mjs : join(__dirname, '../preload/index.js')
}

function layout(): void {
  const { width, height } = win.getContentBounds()
  chatView.setBounds({ x: 0, y: 0, width: CHAT_WIDTH, height })
  targetView.setBounds({ x: CHAT_WIDTH, y: 0, width: width - CHAT_WIDTH, height })
}

function respond(
  handler: () => Promise<{ result: string; page: ExecuteResult['page'] }>
): Promise<ExecuteResult> {
  return handler().then(
    (out) => ({ ok: true, result: out.result, page: out.page, vision: controller.isVisionOn() }),
    (err: unknown) => ({
      ok: false,
      result: err instanceof Error ? err.message : String(err),
      page: null,
      vision: controller.isVisionOn()
    })
  )
}

function normalizeLevel(value: unknown): ScanLevel {
  const level = Number(value)
  if (level === 0 || level === 1 || level === 2 || level === 3) return level
  return controller.getLevel()
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
  win.on('resize', layout)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    chatView.webContents.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    chatView.webContents.loadFile(join(__dirname, '../renderer/index.html'))
  }

  targetView.webContents.setWindowOpenHandler(({ url }) => {
    targetView.webContents.loadURL(url)
    return { action: 'deny' }
  })

  controller = new BrowserController(targetView)

  controller.attach()
  targetView.webContents.on('did-finish-load', () => {
    controller.attach()
    controller.invalidate()
  })
  targetView.webContents.on('did-navigate-in-page', () => controller.invalidate())

  targetView.webContents.loadURL(HOME_URL)

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

  ipcMain.handle('aft:home', (): Promise<ExecuteResult> =>
    respond(() => controller.execute({ action: 'go_to_url', url: HOME_URL }))
  )

  ipcMain.handle('aft:back', (): Promise<ExecuteResult> => respond(() => controller.back()))

  ipcMain.handle('aft:forward', (): Promise<ExecuteResult> => respond(() => controller.forward()))

  ipcMain.handle('aft:reload', (): Promise<ExecuteResult> => respond(() => controller.reload()))

  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
