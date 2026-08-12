import { app, BaseWindow } from 'electron'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DEFAULT_HEALING, IdentityService } from '../identity'
import { ElectronHarness } from './ElectronHarness'
import { FixtureServer } from './FixtureServer'
import { PoolRunner } from './PoolRunner'
import { renderText, writeReport } from './Reporter'
import { DEFAULT_RUN, type CaseKind, type CaseResult, type RunOptions } from './types'

const KINDS: readonly CaseKind[] = [
  'classic-html',
  'spa',
  'shadow-dom',
  'nested-iframe',
  'virtual-list',
  'multi-step-form'
]

const WINDOW = { width: 1440, height: 900 }

interface Settings {
  options: Partial<RunOptions>
  fixtures: string
  reports: string
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

function settings(): Settings {
  const kinds = list(flag('kind')).filter((entry): entry is CaseKind =>
    KINDS.includes(entry as CaseKind)
  )

  return {
    options: {
      only: list(flag('only')),
      kinds,
      updateBaseline: flag('update-baseline') !== null,
      stopOnFailure: flag('stop-on-failure') !== null,
      thresholds: DEFAULT_RUN.thresholds
    },
    fixtures: resolve(
      flag('fixtures') || process.env['AFT_FIXTURES'] || join(process.cwd(), 'fixtures')
    ),
    reports: resolve(
      flag('reports') || process.env['AFT_REPORTS'] || join(app.getPath('userData'), 'regression')
    )
  }
}

async function main(): Promise<number> {
  const config = settings()

  if (!existsSync(config.fixtures)) {
    process.stdout.write(
      'Fixture koku bulunamadi: ' +
        config.fixtures +
        '\nHavuz sabitlenmis kopyalar olmadan kosturulamaz. --fixtures=<dizin> ile yol verin.\n'
    )
    return 2
  }

  const window = new BaseWindow({ ...WINDOW, show: false })
  const fixtures = new FixtureServer(config.fixtures)
  await fixtures.start()

  const harness = new ElectronHarness(fixtures)
  harness.attachTo(window.contentView)

  const identity = new IdentityService({
    historyPath: join(app.getPath('userData'), 'regression', 'history.json'),
    healing: DEFAULT_HEALING,
    resolve: {}
  })
  await identity.load()

  const runner = new PoolRunner(harness, identity, join(config.reports, 'baseline.json'))

  try {
    const run = await runner.run(config.options, (done, total, result) => {
      process.stdout.write(progress(done, total, result))
    })

    const written = await writeReport(run, config.reports)
    process.stdout.write('\n' + renderText(run) + '\n\n')
    for (const path of written) process.stdout.write('Rapor: ' + path + '\n')

    return run.ok ? 0 : 1
  } finally {
    await identity.dispose()
    await harness.dispose()
    if (!window.isDestroyed()) window.destroy()
  }
}

function progress(done: number, total: number, result: CaseResult): string {
  return (
    '[' +
    String(done).padStart(String(total).length, ' ') +
    '/' +
    total +
    '] ' +
    result.status.toUpperCase() +
    ' ' +
    result.caseId +
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
