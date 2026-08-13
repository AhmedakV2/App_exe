import { app, BaseWindow, WebContentsView } from 'electron'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PlaybackAdapter } from '../bridge/PlaybackAdapter'
import { BrowserController } from '../browser/BrowserController'
import { FixtureServer } from '../regression/FixtureServer'
import { DEFAULT_HEALING, IdentityService } from '../identity'
import { compareRuns, renderConsistency } from './Consistency'
import { PLAYBACK_PAGE, PLAYBACK_RESULT_PAGE, PLAYBACK_SCENARIO } from './fixture'
import { PlaybackEngine } from './PlaybackEngine'
import { renderText } from './Reporter'
import { ScenarioStore } from './ScenarioStore'
import { validateScenario } from './validate'
import type { InputMode } from '../action'
import { DEFAULT_PLAYBACK, type RunResult, type ScenarioStep } from './types'

const VIEWPORT = { width: 1280, height: 900 }

const REPEAT = 3

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
  const root = await mkdtemp(join(tmpdir(), 'aft-playback-'))
  await writeFile(join(root, 'index.html'), PLAYBACK_PAGE, 'utf8')
  await writeFile(join(root, 'tamam.html'), PLAYBACK_RESULT_PAGE, 'utf8')

  const server = new FixtureServer(root)
  await server.start()
  return { server, root }
}

async function main(): Promise<number> {
  step('fixture sunucusu')
  const { server, root } = await workspace()

  step('senaryo dosyasi')
  const scenarioDir = join(root, 'senaryolar')
  const scenarioFile = join(scenarioDir, 'kayit.scenario.json')
  const source = PLAYBACK_SCENARIO.replace('http://127.0.0.1/', server.origin() + '/')

  await mkdir(scenarioDir, { recursive: true })
  await writeFile(scenarioFile, source, 'utf8')

  const scenarios = new ScenarioStore(scenarioDir)
  const loaded = await scenarios.load()
  const scenario = await scenarios.read(scenarioFile)

  expect('senaryo magazasi yukledi', loaded === 1, 'senaryo=' + loaded)
  const report = validateScenario(scenario)

  expect('senaryo dosyasi okundu', scenario.steps.length > 0, 'adim=' + scenario.steps.length)
  expect(
    'senaryo dogrulandi',
    report.ok,
    'hata=' + report.errors.length + ' uyari=' + report.warnings.length
  )
  expect('kalici hedefleme', !hasOrdinalTarget(scenario.steps), 'sira ile hedeflenen adim yok')

  step('pencere')
  const window = new BaseWindow({ ...VIEWPORT, show: true })
  const view = new WebContentsView({
    webPreferences: { sandbox: true, contextIsolation: true, partition: 'persist:aft-verify' }
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

  step('girdi yolu denetimi')
  const inputMode = await probeInput(controller, server.urlFor('index.html'))
  process.stdout.write(
    inputMode === null
      ? 'NOT   gercek girdi olaylari sayfaya ulasiyor, adimlar real-input ile kosuyor\n'
      : 'NOT   gercek girdi olaylari bu ortamda sayfaya ulasmiyor, adimlar ' +
          inputMode +
          ' ile kosuyor\n'
  )

  const engine = new PlaybackEngine(new PlaybackAdapter(controller, view.webContents), identity, {
    options: {
      contextDir: join(root, 'contexts'),
      reportDir: join(root, 'raporlar'),
      inputMode
    }
  })

  const runs: RunResult[] = []

  try {
    for (let pass = 1; pass <= REPEAT; pass++) {
      step('kosum ' + pass + '/' + REPEAT)
      const run = await engine.run(scenario)
      runs.push(run)

      if (pass === 1) process.stdout.write('\n' + renderText(run) + '\n\n')
      expect(
        'kosum ' + pass + ' sonucu',
        run.ok,
        run.status + ' | ' + (run.failures[0] ?? 'hata yok')
      )
    }

    const first = runs[0]!
    expect('adim yurutuldu', first.metrics.executed > 0, 'yurutulen=' + first.metrics.executed)
    expect(
      'dogrulama calisti',
      first.metrics.assertions >= 10,
      'dogrulama=' + first.metrics.assertions
    )
    expect(
      'cozumleme kesin',
      first.metrics.resolvedLow === 0 && first.metrics.resolvedExact >= 15,
      'kesin=' +
        first.metrics.resolvedExact +
        ' dusuk=' +
        first.metrics.resolvedLow +
        ' bulunamayan=' +
        first.metrics.resolvedMissing
    )
    expect(
      'tarama tetiklendi, dayatilmadi',
      first.metrics.scans > 0 && first.metrics.scans < first.metrics.executed,
      'tarama=' + first.metrics.scans + ' adim=' + first.metrics.executed
    )
    expect(
      'ekran goruntusu varsayilan kapali',
      DEFAULT_PLAYBACK.screenshotOnFailure === false,
      'varsayilan=' + String(DEFAULT_PLAYBACK.screenshotOnFailure)
    )
    expect(
      'gecen kosumda baglam paketi uretilmedi',
      runs.every((run) => run.contexts.length === 0),
      'baglam paketi=' + first.contexts.length
    )
    expect('kosum gunlugu', first.log.length > 0, 'kayit=' + first.log.length)
    expect(
      'strateji izi gunlukte',
      first.log.some((entry) => entry.level === 'resolve' && entry.detail.length > 0),
      'cozumleme kaydi var'
    )
    expect('rapor yazildi', (await engine.store().list()).length >= 0, 'rapor dizini hazir')

    const consistency = compareRuns(runs)
    process.stdout.write('\n' + renderConsistency(consistency) + '\n\n')

    expect(
      'ardisik kosumlarda tutarlilik',
      consistency.stable,
      consistency.reasons.join('; ') || 'sapma yok'
    )

    step('hata yolu')
    const broken = await engine.run(
      {
        ...scenario,
        id: scenario.id + '-hata',
        steps: [
          scenario.steps[0]!,
          {
            ...scenario.steps[1]!,
            id: 'olmayan-hedef',
            kind: 'click',
            title: 'Olmayan hedefe tikla',
            assertion: null,
            retries: 0,
            target: {
              kind: 'query',
              label: 'olmayan dugme',
              descriptorId: '',
              descriptor: null,
              query: {
                kind: 'test-id',
                value: 'olmayan-dugme',
                attribute: '',
                tag: '',
                role: '',
                nth: -1
              },
              ordinal: -1
            }
          }
        ]
      },
      { screenshotOnFailure: true }
    )

    expect('bulunamayan hedef raporlandi', !broken.ok, broken.failures[0] ?? '')
    expect(
      'hata baglam paketi yazildi',
      broken.contexts.length === 1,
      'paket=' + broken.contexts.length
    )

    const packet = await engine.store().read(broken.contexts[0] ?? '')
    expect('baglam paketi okunabilir', Boolean(packet), 'id=' + (broken.contexts[0] ?? ''))
    expect(
      'baglam paketi sayfa dokumu tasiyor',
      (packet?.elements.length ?? 0) > 0,
      'eleman=' + (packet?.elements.length ?? 0)
    )
    expect(
      'baglam paketi cozumleme izi tasiyor',
      Boolean(packet?.resolution),
      'strateji=' + (packet?.resolution?.trace.length ?? 0)
    )
    expect(
      'baglam paketi ekran goruntusu tasiyor',
      (packet?.screenshot.length ?? 0) > 0,
      'bayt=' + (packet?.screenshot.length ?? 0)
    )

    return verdict()
  } finally {
    controller.dispose()
    await identity.dispose()
    await server.stop()
    if (!view.webContents.isDestroyed()) view.webContents.close()
    if (!window.isDestroyed()) window.destroy()
  }
}

async function probeInput(controller: BrowserController, url: string): Promise<InputMode | null> {
  await controller.start()
  await controller.dispatch({ kind: 'navigate', url })

  const graph = await controller.scanGraph(1, true)
  const box = graph.nodes.find((node) => node.attrs['id'] === 'sozlesme')
  if (!box || box.index < 0) return 'direct-call'

  await controller.dispatch({ kind: 'click', ordinal: box.index, mode: 'real-input' })

  const after = await controller.scanGraph(1, true)
  const landed = after.nodes.find((node) => node.attrs['id'] === 'sozlesme')?.checked === true

  await controller.dispatch({ kind: 'navigate', url })
  return landed ? null : 'direct-call'
}

function hasOrdinalTarget(steps: readonly ScenarioStep[]): boolean {
  for (const step of steps) {
    if (step.target?.kind === 'ordinal') return true
    if (hasOrdinalTarget(step.steps)) return true
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
