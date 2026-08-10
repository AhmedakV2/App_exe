import { WebContentsView } from 'electron'
import { DiscoveryEngine } from '../discovery'
import type { ElementGraph } from '../discovery'
import type { GraphNode, ScanLevel } from '../discovery'
import { Overlay } from './Overlay'
import { AgentAction, PageState } from './types'

interface Target {
  x: number
  y: number
  text: string
  node: GraphNode
}

interface KeyEvent {
  windowsVirtualKeyCode: number
  key: string
  code: string
}

const NAMED_KEYS: Record<string, KeyEvent> = {
  enter: { windowsVirtualKeyCode: 13, key: 'Enter', code: 'Enter' },
  space: { windowsVirtualKeyCode: 32, key: ' ', code: 'Space' },
  tab: { windowsVirtualKeyCode: 9, key: 'Tab', code: 'Tab' },
  escape: { windowsVirtualKeyCode: 27, key: 'Escape', code: 'Escape' },
  backspace: { windowsVirtualKeyCode: 8, key: 'Backspace', code: 'Backspace' },
  delete: { windowsVirtualKeyCode: 46, key: 'Delete', code: 'Delete' },
  arrowup: { windowsVirtualKeyCode: 38, key: 'ArrowUp', code: 'ArrowUp' },
  arrowdown: { windowsVirtualKeyCode: 40, key: 'ArrowDown', code: 'ArrowDown' },
  arrowleft: { windowsVirtualKeyCode: 37, key: 'ArrowLeft', code: 'ArrowLeft' },
  arrowright: { windowsVirtualKeyCode: 39, key: 'ArrowRight', code: 'ArrowRight' }
}

export class BrowserController {
  private readonly engine: DiscoveryEngine
  private readonly overlay: Overlay
  private graph: ElementGraph | null = null
  private vision = false
  private level: ScanLevel = 1
  private actionQueue: Promise<void> = Promise.resolve()

  constructor(private readonly view: WebContentsView) {
    this.engine = new DiscoveryEngine(view.webContents)
    this.overlay = new Overlay(this.engine.transport)
  }

  isVisionOn(): boolean {
    return this.vision
  }

  getLevel(): ScanLevel {
    return this.level
  }

  setLevel(level: ScanLevel): void {
    this.level = level
  }

  attach(): void {
    void this.engine.transport.start()
  }

  invalidate(): void {
    this.engine.invalidate()
  }

  dispose(): void {
    this.graph = null
    this.engine.dispose()
  }

  currentGraph(): ElementGraph | null {
    return this.graph
  }

  async scan(level?: ScanLevel): Promise<PageState> {
    return this.enqueue(() => this.refresh(level ?? this.level, true))
  }

  async setVision(on: boolean): Promise<PageState | null> {
    return this.enqueue(async () => {
      this.vision = on
      if (!on) {
        await this.overlay.clear(this.graph)
        return null
      }
      return this.refresh(this.level, true)
    })
  }

  async execute(a: AgentAction): Promise<{ result: string; page: PageState }> {
    return this.enqueue(async () => {
      let result: string

      switch (a.action) {
        case 'go_to_url':
          result = await this.navigate(a.url ?? '')
          break
        case 'click':
          result = await this.click(a.index ?? -1)
          break
        case 'double_click':
          result = await this.doubleClick(a.index ?? -1)
          break
        case 'right_click':
          result = await this.rightClick(a.index ?? -1)
          break
        case 'mouse_move':
          result = await this.mouseMove(a.index ?? -1)
          break
        case 'type':
          result = await this.type(a.index ?? -1, a.text ?? '')
          break
        case 'clear_type':
          result = await this.clearType(a.index ?? -1)
          break
        case 'scroll':
          result = await this.scroll(a.deltaY ?? 0)
          break
        case 'press_key':
          result = await this.press(a.key ?? '', a.index)
          break
        case 'snapshot':
          result = 'Sayfa tarandi'
          break
        default:
          throw new Error('Bilinmeyen aksiyon: ' + a.action)
      }

      await this.settle(a.action === 'go_to_url' ? 160 : 80)
      return { result, page: await this.refresh(this.level, a.action === 'snapshot') }
    })
  }

  async back(): Promise<{ result: string; page: PageState }> {
    return this.enqueue(async () => {
      if (!this.view.webContents.navigationHistory.canGoBack())
        throw new Error('Geri gidilecek sayfa yok')

      const loaded = this.waitForLoad()
      this.view.webContents.navigationHistory.goBack()
      await loaded

      return this.finish('Geri gidildi', 120)
    })
  }

  async forward(): Promise<{ result: string; page: PageState }> {
    return this.enqueue(async () => {
      if (!this.view.webContents.navigationHistory.canGoForward())
        throw new Error('Ileri gidilecek sayfa yok')

      const loaded = this.waitForLoad()
      this.view.webContents.navigationHistory.goForward()
      await loaded

      return this.finish('Ileri gidildi', 120)
    })
  }

  async reload(): Promise<{ result: string; page: PageState }> {
    return this.enqueue(async () => {
      const loaded = this.waitForLoad()
      this.view.webContents.reloadIgnoringCache()
      await loaded

      return this.finish('Sayfa yenilendi', 120)
    })
  }

  private async refresh(level: ScanLevel, force: boolean): Promise<PageState> {
    this.graph = await this.engine.scan({ level, force })
    if (this.vision) await this.overlay.draw(this.graph)
    return this.graph.toPageState()
  }

  private async navigate(url: string): Promise<string> {
    if (!/^https?:\/\//.test(url)) throw new Error('Gecersiz URL: ' + url)
    const loaded = this.waitForLoad()
    await this.view.webContents.loadURL(url)
    await loaded
    this.invalidate()
    return 'Acilan sayfa: ' + this.view.webContents.getURL()
  }

  private async click(index: number): Promise<string> {
    const el = this.element(index)
    await this.mouse('mousePressed', el.x, el.y, 'left', 1)
    await this.mouse('mouseReleased', el.x, el.y, 'left', 1)
    return `Tiklandi: [${index}] ${el.text}`
  }

  private async doubleClick(index: number): Promise<string> {
    const el = this.element(index)
    await this.mouse('mousePressed', el.x, el.y, 'left', 2)
    await this.mouse('mouseReleased', el.x, el.y, 'left', 2)
    return `Cift tiklandi: [${index}] ${el.text}`
  }

  private async rightClick(index: number): Promise<string> {
    const el = this.element(index)
    await this.mouse('mousePressed', el.x, el.y, 'right', 1)
    await this.mouse('mouseReleased', el.x, el.y, 'right', 1)
    return `Sag tiklandi: [${index}] ${el.text}`
  }

  private async mouseMove(index: number): Promise<string> {
    const el = this.element(index)
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: el.x,
      y: el.y,
      buttons: 0
    })
    return `Fare tasindi: [${index}] ${el.text}`
  }

  private async type(index: number, text: string): Promise<string> {
    await this.click(index)
    for (const ch of text) {
      await this.send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch })
      await this.send('Input.dispatchKeyEvent', { type: 'keyUp' })
    }
    return `Yazildi: [${index}] "${text}"`
  }

  private async clearType(index: number): Promise<string> {
    await this.click(index)
    await this.selectAll()
    await this.dispatchKey(NAMED_KEYS.delete)
    return `Temizlendi: [${index}]`
  }

  private async selectAll(): Promise<void> {
    const key = { windowsVirtualKeyCode: 65, key: 'a', code: 'KeyA', modifiers: 2 }
    await this.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...key })
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key })
  }

  private async press(key: string, index?: number): Promise<string> {
    if (typeof index === 'number' && index >= 0) await this.click(index)

    const normalized = key.toLowerCase()
    let event: KeyEvent
    if (key.length === 1) {
      const upper = key.toUpperCase()
      event = { windowsVirtualKeyCode: upper.charCodeAt(0), key, code: 'Key' + upper }
    } else {
      event = NAMED_KEYS[normalized] ?? { windowsVirtualKeyCode: 0, key, code: key }
    }

    await this.dispatchKey(event)
    return `${key} tusuna basildi${typeof index === 'number' ? ' [' + index + ']' : ''}`
  }

  private async dispatchKey(event: KeyEvent): Promise<void> {
    await this.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...event })
    if (event.key.length === 1) {
      await this.send('Input.dispatchKeyEvent', { type: 'char', text: event.key })
    }
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...event })
  }

  private async scroll(deltaY: number): Promise<string> {
    const vp = this.graph?.viewport
    const x = vp ? Math.round(vp.width / 2) : 10
    const y = vp ? Math.round(vp.height / 2) : 10
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x,
      y,
      deltaX: 0,
      deltaY
    })
    return `Kaydirildi: ${deltaY}px`
  }

  private mouse(
    type: string,
    x: number,
    y: number,
    button: 'left' | 'right',
    clickCount: number
  ): Promise<unknown> {
    return this.send('Input.dispatchMouseEvent', { type, x, y, button, clickCount })
  }

  private send(method: string, params: object): Promise<unknown> {
    return this.engine.transport.send(method, params)
  }

  private element(index: number): Target {
    const node = this.graph?.at(index)
    if (!node) throw new Error(`Indeks bulunamadi: ${index}`)
    if (!node.center || !node.visible) throw new Error(`Eleman gorunur degil: ${index}`)
    if (!node.inViewport) throw new Error(`Eleman gorunum disinda: ${index}`)
    if (node.occluded) throw new Error(`Eleman ustu kapali: ${index}`)
    const label = node.text || node.ax?.name || node.tag
    return { x: Math.round(node.center.x), y: Math.round(node.center.y), text: label, node }
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.actionQueue.then(task, task)
    this.actionQueue = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }

  private waitForLoad(): Promise<void> {
    return new Promise((resolve) => {
      const wc = this.view.webContents
      const done = (): void => {
        wc.off('did-finish-load', done)
        wc.off('did-fail-load', done)
        resolve()
      }

      wc.once('did-finish-load', done)
      wc.once('did-fail-load', done)
    })
  }

  private async finish(result: string, delay = 120): Promise<{ result: string; page: PageState }> {
    await this.settle(delay)
    this.invalidate()
    return { result, page: await this.refresh(this.level, true) }
  }

  private settle(ms = 120): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
