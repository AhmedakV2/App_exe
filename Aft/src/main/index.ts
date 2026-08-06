import { app, BaseWindow, WebContentsView, ipcMain } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { electronApp, is } from '@electron-toolkit/utils'
import { BrowserController } from './browser/BrowserController'
import { AgentAction, ExecuteResult } from './browser/types'

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

function createWindow(): void {
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

  targetView.webContents.loadURL(HOME_URL)

  targetView.webContents.setWindowOpenHandler(({ url }) => {
    targetView.webContents.loadURL(url)
    return { action: 'deny' }
  })

  controller = new BrowserController(targetView)
  targetView.webContents.once('did-finish-load', () => controller.attach())

  win.show()
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.aft.agent')

  ipcMain.handle('agent:execute', async (_e, action: AgentAction): Promise<ExecuteResult> => {
    try {
      const out = await controller.execute(action)
      return { ok: true, result: out.result, page: out.page, vision: controller.isVisionOn() }
    } catch (err) {
      return {
        ok: false,
        result: (err as Error).message,
        page: null,
        vision: controller.isVisionOn()
      }
    }
  })

  ipcMain.handle('agent:vision', async (_e, on: boolean): Promise<ExecuteResult> => {
    try {
      const page = await controller.setVision(on)
      return { ok: true, result: on ? 'Gorus acildi' : 'Gorus kapatildi', page, vision: on }
    } catch (err) {
      return {
        ok: false,
        result: (err as Error).message,
        page: null,
        vision: controller.isVisionOn()
      }
    }
  })

  ipcMain.handle('agent:home', async (): Promise<ExecuteResult> => {
    try {
      const out = await controller.execute({ action: 'go_to_url', url: HOME_URL })
      return { ok: true, result: out.result, page: out.page, vision: controller.isVisionOn() }
    } catch (err) {
      return {
        ok: false,
        result: (err as Error).message,
        page: null,
        vision: controller.isVisionOn()
      }
    }
  })

  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
