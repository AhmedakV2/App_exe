import { app, BaseWindow, WebContentsView } from 'electron'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PlaybackAdapter } from '../bridge/PlaybackAdapter'
import { RecordAdapter } from '../bridge/RecordAdapter'
import { BrowserController } from '../browser/BrowserController'
import { delay } from '../discovery'
import type { ElementGraph } from '../discovery'
import { DEFAULT_HEALING, IdentityService } from '../identity'
import { FixtureServer } from '../regression/FixtureServer'
import { PlaybackEngine, renderText } from '../scenario'
import type { ScenarioStep } from '../scenario'
import { RECORD_FRAME_PAGE, RECORD_PAGE, RECORD_RESULT_PAGE } from './fixture'
import { Recorder } from './Recorder'
import type { RecordSession } from './types'

const VIEWPORT = { width: 1280, height: 900 }

const SETTLE_MS = 420

interface Check {
  name: string
  ok: boolean
  detail: string
}

const checks: Check[] = []

function expect(name: string, ok: boolean, detail: string): void {
  checks.push({ name, ok, detail })
  process.stdout.write((ok ? 'GECTI ' : 'KALDI ') + name + ' | ' + detail + '\n')
}

function step(name: string): void {
  process.stdout.write('... ' + name + '\n')
}

async function workspace(): Promise<{ server: FixtureServer; root: string }> {
  const root = await mkdtemp(join(tmpdir(), 'aft-record-'))
  await writeFile(join(root, 'index.html'), RECORD_PAGE, 'utf8')
  await writeFile(join(root, 'ic.html'), RECORD_FRAME_PAGE, 'utf8')
  await writeFile(join(root, 'tamam.html'), RECORD_RESULT_PAGE, 'utf8')

  const server = new FixtureServer(root)
  await server.start()
  return { server, root }
}

function ordinalOf(graph: ElementGraph, match: (attrs: Record<string, string>) => boolean): number {
  const node = graph.nodes.find((entry) => entry.index >= 0 && match(entry.attrs))
  return node ? node.index : -1
}

async function main(): Promise<number> {
  step('fixture sunucusu')
  const { server, root } = await workspace()

  step('pencere')
  const window = new BaseWindow({ ...VIEWPORT, show: true })
  const view = new WebContentsView({
    webPreferences: { sandbox: true, contextIsolation: true, partition: 'persist:aft-record' }
  })

  window.contentView.addChildView(view)
  view.setBounds({ x: 0, y: 0, ...VIEWPORT })

  const controller = new BrowserController(view)
  const identity = new IdentityService({
    historyPath: join(root, 'history.json'),
    healing: DEFAULT_HEALING,
    resolve: {}
  })

  await identity.load()
  controller.attach()

  const adapter = new RecordAdapter(controller, view.webContents)
  const recorder = new Recorder(adapter, identity, { options: { highlight: false } })

  try {
    step('kayit basliyor')
    await controller.dispatch({ kind: 'navigate', url: server.urlFor('index.html') })
    await recorder.start()
    await delay(SETTLE_MS)

    step('kullanici etkilesimleri')
    const graph = await controller.scanGraph(1, true)

    const ad = ordinalOf(graph, (attrs) => attrs['id'] === 'ad')
    const eposta = ordinalOf(graph, (attrs) => attrs['id'] === 'eposta')
    const sehir = ordinalOf(graph, (attrs) => attrs['id'] === 'sehir')
    const sozlesme = ordinalOf(graph, (attrs) => attrs['id'] === 'sozlesme')
    const kart = ordinalOf(graph, (attrs) => (attrs['class'] ?? '').includes('kart'))
    const golge = ordinalOf(graph, (attrs) => attrs['data-testid'] === 'golge-dugme')
    const cerceve = ordinalOf(graph, (attrs) => attrs['data-testid'] === 'cerceve-dugme')
    const gonder = ordinalOf(graph, (attrs) => attrs['data-testid'] === 'gonder')

    expect(
      'fixture elemanlari bulundu',
      [ad, eposta, sehir, sozlesme, kart, golge, cerceve, gonder].every((entry) => entry >= 0),
      'ad=' +
        ad +
        ' sehir=' +
        sehir +
        ' kart=' +
        kart +
        ' golge=' +
        golge +
        ' cerceve=' +
        cerceve +
        ' gonder=' +
        gonder
    )

    await controller.dispatch({ kind: 'clear-type', ordinal: ad, text: 'Ays' })
    await delay(160)
    await controller.dispatch({ kind: 'clear-type', ordinal: ad, text: 'Ayse Yilmaz' })
    await delay(160)
    await controller.dispatch({ kind: 'clear-type', ordinal: eposta, text: 'ayse@ornek.com' })
    await delay(160)
    await controller.dispatch({ kind: 'select-option', ordinal: sehir, optionValue: 'ist' })
    await delay(160)
    await controller.dispatch({ kind: 'click', ordinal: sozlesme })
    await delay(160)
    await controller.dispatch({ kind: 'click', ordinal: kart })
    await delay(160)
    await controller.dispatch({ kind: 'click', ordinal: golge })
    await delay(160)
    await controller.dispatch({ kind: 'click', ordinal: cerceve })
    await delay(SETTLE_MS)

    step('kayit durduruluyor')
    const session = await recorder.stop()
    if (!session) throw new Error('Kayit oturumu olusmadi')

    process.stdout.write('\n' + summary(session) + '\n')

    expect('adim uretildi', session.steps.length >= 6, 'adim=' + session.steps.length)
    expect(
      'yazma adimlari birlestirildi',
      session.steps.filter((entry) => entry.kind === 'clear-type').length === 2,
      'yazma adimi=' + session.steps.filter((entry) => entry.kind === 'clear-type').length
    )
    expect(
      'gurultu bastirildi',
      session.counters.suppressed + session.counters.merged > 0,
      'elenen=' + session.counters.suppressed + ' birlesen=' + session.counters.merged
    )
    expect(
      'kayit sirasinda kimlik puanlandi',
      session.steps.every((entry) => entry.advice.state !== undefined),
      'zayif=' + session.counters.weak
    )

    const weak = session.steps.find((entry) => entry.advice.level !== 'strong')
    expect(
      'zayif kimlikte alternatif onerildi',
      !weak || weak.advice.alternatives.length > 0,
      weak
        ? 'oneri=' + weak.advice.alternatives.length + ' adim=' + weak.step.title
        : 'zayif adim yok'
    )

    const shadow = session.steps.find((entry) => entry.shadowDepth > 0)
    const framed = session.steps.find((entry) => entry.frameDepth > 0)
    expect('shadow dom adimi kaydedildi', Boolean(shadow), shadow?.step.title ?? 'yok')
    expect('cerceve adimi kaydedildi', Boolean(framed), framed?.step.title ?? 'yok')

    step('senaryoya cevriliyor')
    const composition = recorder.compose({})
    const scenario = composition.scenario

    expect(
      'senaryo dogrulandi',
      composition.report.ok,
      'hata=' +
        composition.report.errors.length +
        ' uyari=' +
        composition.report.warnings.length +
        (composition.report.errors[0] ? ' | ' + composition.report.errors[0].message : '')
    )
    expect('kalici hedefleme', !hasOrdinalTarget(scenario.steps), 'sira ile hedeflenen adim yok')
    expect(
      'baslangic adresi yazildi',
      scenario.baseUrl.startsWith(server.origin()),
      scenario.baseUrl
    )

    step('duzenlenmeden playback')
    await recorder.discard()
    await controller.dispatch({ kind: 'navigate', url: server.urlFor('index.html') })

    const engine = new PlaybackEngine(new PlaybackAdapter(controller, view.webContents), identity, {
      options: { contextDir: join(root, 'contexts'), reportDir: '' }
    })

    const run = await engine.run(scenario)
    process.stdout.write('\n' + renderText(run) + '\n')

    expect(
      'kayit duzenlenmeden kosuyor',
      run.ok,
      run.status + ' | ' + (run.failures[0] ?? 'hata yok')
    )
    expect(
      'cozumleme kesin',
      run.metrics.resolvedMissing === 0 && run.metrics.resolvedLow === 0,
      'kesin=' +
        run.metrics.resolvedExact +
        ' dusuk=' +
        run.metrics.resolvedLow +
        ' bulunamayan=' +
        run.metrics.resolvedMissing
    )

    return verdict()
  } finally {
    await recorder.discard().catch(() => undefined)
    controller.dispose()
    await identity.dispose()
    await server.stop()
    if (!view.webContents.isDestroyed()) view.webContents.close()
    if (!window.isDestroyed()) window.destroy()
  }
}

function summary(session: RecordSession): string {
  const lines = ['Kayit ozeti: ' + session.title, 'Adres: ' + session.baseUrl, '']

  session.steps.forEach((entry) => {
    lines.push(
      String(entry.order + 1).padStart(2, ' ') +
        '. [' +
        entry.advice.level.padEnd(7, ' ') +
        '] ' +
        entry.step.title +
        (entry.advice.strategies.length ? '  <' + entry.advice.strategies.join(',') + '>' : '')
    )
  })

  lines.push('')
  lines.push(
    'yakalanan=' +
      session.counters.captured +
      ' islenen=' +
      session.counters.committed +
      ' elenen=' +
      session.counters.suppressed +
      ' birlesen=' +
      session.counters.merged +
      ' zayif=' +
      session.counters.weak +
      ' tarama=' +
      session.counters.scans
  )

  return lines.join('\n')
}

function hasOrdinalTarget(steps: readonly ScenarioStep[]): boolean {
  for (const entry of steps) {
    if (entry.target?.kind === 'ordinal') return true
    if (hasOrdinalTarget(entry.steps)) return true
  }
  return false
}

function verdict(): number {
  const failed = checks.filter((check) => !check.ok).length
  process.stdout.write('\nToplam ' + checks.length + ', basarisiz ' + failed + '\n')
  return failed === 0 ? 0 : 1
}

app.whenReady().then(() => {
  step('electron hazir')
  main().then(
    (code) => app.exit(code),
    (error: unknown) => {
      process.stderr.write((error instanceof Error ? error.stack : String(error)) + '\n')
      app.exit(3)
    }
  )
})

app.on('window-all-closed', () => undefined)
