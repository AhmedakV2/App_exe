import { app, BaseWindow, WebContentsView } from 'electron'
import { existsSync, statSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { PlaybackAdapter } from '../bridge/PlaybackAdapter'
import { BrowserController } from '../browser/BrowserController'
import { DEFAULT_HEALING, DescriptorStore, IdentityService } from '../identity'
import { compareRuns, renderConsistency } from './Consistency'
import { PlaybackEngine } from './PlaybackEngine'
import { renderText, writeReport } from './Reporter'
import { ScenarioStore } from './ScenarioStore'
import { DEFAULT_PLAYBACK, type PlaybackOptions, type RunResult, type StepResult } from './types'

const WINDOW = { width: 1440, height: 900 }

interface Settings {
  file: string
  reportDir: string
  repeat: number
  options: Partial<PlaybackOptions>
}

function flag(name: string): string | null {
  const prefix = '--' + name + '='
  const hit = process.argv.find((entry) => entry.startsWith(prefix))
  if (hit) return hit.slice(prefix.length)
  return process.argv.includes('--' + name) ? '' : null
}

function list(value: string | null): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function path(value: string | null, fallback: string): string {
  if (!value) return fallback
  return isAbsolute(value) ? value : resolve(process.cwd(), value)
}

function settings(): Settings {
  const userData = app.getPath('userData')
  const level = Number(flag('level'))
  const wanted = flag('scenario') ?? process.env['AFT_SCENARIO'] ?? ''

  const repeat = Number(flag('repeat'))

  return {
    file: wanted ? path(wanted, '') : '',
    reportDir: path(flag('reports'), join(userData, 'playback', 'reports')),
    repeat: Number.isInteger(repeat) && repeat > 1 ? Math.min(repeat, 20) : 1,
    options: {
      scanLevel:
        level === 0 || level === 1 || level === 2 || level === 3
          ? level
          : DEFAULT_PLAYBACK.scanLevel,
      inputMode: flag('input-mode') === 'direct-call' ? 'direct-call' : null,
      stopOnFailure: flag('keep-going') === null,
      allowLowConfidence: flag('allow-low-confidence') !== null,
      screenshotOnFailure: flag('screenshot') !== null,
      only: list(flag('only')),
      contextDir: path(flag('contexts'), join(userData, 'playback', 'contexts')),
      reportDir: ''
    }
  }
}

function readable(file: string): boolean {
  if (!file || !existsSync(file)) return false
  return statSync(file).isFile()
}

async function main(): Promise<number> {
  const config = settings()

  if (!readable(config.file)) {
    process.stdout.write(
      'Senaryo dosyasi bulunamadi: ' +
        (config.file || '<bos>') +
        '\n--scenario=<dosya> ile yol verin.\n'
    )
    return 2
  }

  const userData = app.getPath('userData')
  const window = new BaseWindow({ ...WINDOW, show: false })
  const view = new WebContentsView({
    webPreferences: { sandbox: true, contextIsolation: true, partition: 'persist:aft-playback' }
  })

  window.contentView.addChildView(view)
  view.setBounds({ x: 0, y: 0, width: WINDOW.width, height: WINDOW.height })

  const identity = new IdentityService({
    historyPath: join(userData, 'playback', 'history.json'),
    healing: DEFAULT_HEALING,
    resolve: {}
  })
  const descriptors = new DescriptorStore(join(userData, 'identity', 'catalog.json'))

  await identity.load()
  await descriptors.load()

  const controller = new BrowserController(view)
  controller.attach()

  const scenarios = new ScenarioStore(join(userData, 'scenarios'))
  const scenario = await scenarios.read(config.file)

  const engine = new PlaybackEngine(new PlaybackAdapter(controller, view.webContents), identity, {
    descriptors,
    options: config.options
  })

  try {
    const runs: RunResult[] = []

    for (let pass = 1; pass <= config.repeat; pass++) {
      if (config.repeat > 1) {
        process.stdout.write('\n--- kosum ' + pass + '/' + config.repeat + ' ---\n')
      }

      const run = await engine.run(scenario, {}, (done, total, step) => {
        process.stdout.write(progress(done, total, step))
      })

      runs.push(run)
      const written = await writeReport(run, config.reportDir)
      process.stdout.write('\n' + renderText(run) + '\n\n')
      for (const file of written) process.stdout.write('Rapor: ' + file + '\n')
    }

    if (config.repeat > 1) {
      const consistency = compareRuns(runs)
      process.stdout.write('\n' + renderConsistency(consistency) + '\n')
      if (!consistency.stable) return 1
    }

    return runs.every((run) => run.ok) ? 0 : 1
  } finally {
    descriptors.dispose()
    await identity.dispose()
    controller.dispose()
    if (!window.isDestroyed()) window.destroy()
  }
}

function progress(done: number, total: number, step: StepResult): string {
  return (
    '[' +
    String(done).padStart(String(total).length, ' ') +
    '/' +
    total +
    '] ' +
    step.status.toUpperCase() +
    ' ' +
    step.title +
    '\n'
  )
}

app.whenReady().then(() => {
  main().then(
    (code) => app.exit(code),
    (error: unknown) => {
      process.stderr.write((error instanceof Error ? error.stack : String(error)) + '\n')
      app.exit(3)
    }
  )
})

app.on('window-all-closed', () => undefined)
