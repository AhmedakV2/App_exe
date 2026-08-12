import { WebContentsView } from 'electron'
import { DiscoveryEngine } from '../discovery'
import type { ElementGraph } from '../discovery'
import { delay } from '../discovery'
import type { ScanLevel } from '../discovery'
import type { FixtureServer } from './FixtureServer'
import type { Harness } from './types'

const VIEWPORT = { width: 1440, height: 900 }
const SETTLE_MS = 120
const RELOAD_TIMEOUT = 20000

export class ElectronHarness implements Harness {
  private readonly view: WebContentsView
  private readonly engine: DiscoveryEngine
  constructor(private readonly fixtures: FixtureServer | null = null) {
    this.view = new WebContentsView({
      webPreferences: { sandbox: true, contextIsolation: true, partition: 'persist:aft-regression' }
    })
    this.view.setBounds({ x: 0, y: 0, ...VIEWPORT })
    this.engine = new DiscoveryEngine(this.view.webContents)
  }
  attachTo(container: { addChildView: (view: WebContentsView) => void }): void {
    container.addChildView(this.view)
    this.view.setBounds({ x: 0, y: 0, ...VIEWPORT })
  }
  urlOf(location: string): string {
    if (/^https?:\/\//i.test(location)) return location
    if (!this.fixtures) throw new Error('Fixture sunucusu tanimli degil')
    return this.fixtures.urlFor(location)
  }
  async goto(url: string, timeoutMs: number): Promise<void> {
    const load = this.view.webContents.loadURL(url)
    await withTimeout(load, timeoutMs, 'Sayfa yuklenmedi: ' + url)
    this.engine.invalidate()
    await delay(SETTLE_MS)
  }
  scan(level: ScanLevel): Promise<ElementGraph> {
    return this.engine.scan({ level, force: true })
  }
  async reset(): Promise<void> {
    const wc = this.view.webContents
    const done = new Promise<void>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | null = null
      const finish = (): void => {
        if (timer) clearTimeout(timer)
        timer = null
        wc.removeListener('did-finish-load', finish)
        wc.removeListener('did-fail-load', finish)
        resolve()
      }
      timer = setTimeout(finish, RELOAD_TIMEOUT)
      wc.on('did-finish-load', finish)
      wc.on('did-fail-load', finish)
    })

    wc.reload()
    this.engine.invalidate()
    await done
    await delay(SETTLE_MS)
  }
  async dispose(): Promise<void> {
    this.engine.dispose()
    const wc = this.view.webContents
    if (!wc.isDestroyed()) {
      wc.removeAllListeners()
      wc.close()
    }
    await this.fixtures?.stop()
  }
}
function withTimeout<T>(task: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs)
    task.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    )
  })
}
