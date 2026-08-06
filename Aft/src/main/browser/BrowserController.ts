import { WebContentsView } from 'electron'
import { clearOverlay, snapshot } from './DomIndexer'
import { AgentAction, PageElement, PageState } from './types'

export class BrowserController {
  private lastState: PageState | null = null
  private vision = true

  constructor(private readonly view: WebContentsView) {}

  isVisionOn(): boolean {
    return this.vision
  }

  attach(): void {
    const wc = this.view.webContents
    if (!wc.debugger.isAttached()) wc.debugger.attach('1.3')
  }

  async setVision(on: boolean): Promise<PageState | null> {
    this.vision = on
    this.attach()
    if (!on) {
      await clearOverlay(this.view.webContents)
      return null
    }
    this.lastState = await snapshot(this.view.webContents, true)
    return this.lastState
  }

  async execute(a: AgentAction): Promise<{ result: string; page: PageState }> {
    this.attach()
    let result: string
    switch (a.action) {
      case 'go_to_url':
        result = await this.navigate(a.url ?? '')
        break
      case 'click':
        result = await this.click(a.index ?? -1)
        break
      case 'double_click':
        result = await this.DbClick(a.index ?? -1)
        break
      case 'right_click':
        result = await this.RClick(a.index ?? -1)
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
        result=await this.scroll(a.deltaY ?? 0)
        break
      case 'press_enter':
        result = await this.pressEnter()
        break
      case 'snapshot':
        result = 'Sayfa tarandi'
        break
      default:
        throw new Error('Bilinmeyen aksiyon: ' + a.action)
    }
    await this.settle()

    this.lastState = await snapshot(this.view.webContents, this.vision)
    return { result, page: this.lastState }
  }

  private async navigate(url: string): Promise<string> {
    if (!/^https?:\/\//.test(url)) throw new Error('Gecersiz URL: ' + url)
    await this.view.webContents.loadURL(url)
    return 'Acilan sayfa: ' + this.view.webContents.getURL()
  }

  private async click(index: number): Promise<string> {
    const el = this.element(index)
    await this.mouse('mousePressed', el.x, el.y)
    await this.mouse('mouseReleased', el.x, el.y)
    return `Tiklandi: [${index}] ${el.text}`
  }

  private async DbClick(index: number): Promise<string> {
    const el = await this.element(index)
    await this.mousedb('mousePressed', el.x, el.y)
    await this.mousedb('mouseReleased', el.x, el.y)
    return 'ikii kez tiklandi'
  }

  private async RClick(index: number): Promise<string> {
    const el = await this.element(index)
    await this.mouser('mousePressed', el.x, el.y)
    await this.mouser('mouseReleased', el.x, el.y)
    return 'Sag tiklandi'
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
    const key = { windowsVirtualKeyCode: 46, key: 'Delete', code: 'Delete' }
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', ...key })
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key })
    return `Temizlendi: [${index}]`
  }

  private async selectAll(): Promise<void> {
    const key = { windowsVirtualKeyCode: 65, key: 'a', code: 'KeyA', modifiers: 2 }
    await this.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...key })
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key })
  }

  private async pressEnter(): Promise<string> {
    const key = { windowsVirtualKeyCode: 13, key: 'Enter', code: 'Enter' }
    await this.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...key })
    await this.send('Input.dispatchKeyEvent', { type: 'char', text: '\r' })
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key })
    return 'Enter gonderildi'
  }

  private async mouseMove(index: number): Promise<string> {
    const el = await this.element(index)
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: el.x,
      y: el.y,
      buttons: 0
    })
    return `Fare taşindi: [${index}] ${el.text}`
  }

  private async scroll(deltaY: number): Promise<string> {
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: 0,
      y: 0,
      deltaX: 0,
      deltaY
    })
    return ' Kaydırıldı: ${deltaY}px;'
  }

  private mouse(type: string, x: number, y: number): Promise<unknown> {
    return this.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 })
  }

  private mousedb(type: string, x: number, y: number): Promise<unknown> {
    return this.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 2 })
  }

  private mouser(type: string, x: number, y: number): Promise<unknown> {
    return this.send('Input.dispatchMouseEvent', { type, x, y, button: 'right', clickCount: 1 })
  }

  private send(method: string, params: object): Promise<unknown> {
    return this.view.webContents.debugger.sendCommand(method, params)
  }

  private element(index: number): PageElement {
    const el = this.lastState?.elements.find((e) => e.i === index)
    if (!el) throw new Error(`Indeks bulunamadi: ${index}`)
    return el
  }

  private settle(): Promise<void> {
    return new Promise((r) => setTimeout(r, 700))
  }
}
