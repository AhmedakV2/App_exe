import { app, BaseWindow, WebContentsView } from 'electron'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import {
  mountIdentity,
  mountPlayback,
  mountRecord,
  recordChannel,
  unmountIdentity,
  unmountPlayback,
  unmountRecord
} from './bridge'
import { BrowserController } from './browser/BrowserController'
import { delay } from './discovery'
import type { ElementGraph } from './discovery'
import { RECORD_FRAME_PAGE, RECORD_PAGE, RECORD_RESULT_PAGE } from './record/fixture'
import { FixtureServer } from './regression/FixtureServer'

const VIEWPORT = { width: 1280, height: 900 }

const SETTLE_MS = 420

const SHELL_PAGE = `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><title>AFT kabuk</title></head>
<body><div id="root"></div></body></html>`

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

function preloadPath(): string {
  const mjs = join(__dirname, '../preload/index.mjs')
  return existsSync(mjs) ? mjs : join(__dirname, '../preload/index.js')
}

function ordinalOf(graph: ElementGraph, match: (attrs: Record<string, string>) => boolean): number {
  const node = graph.nodes.find((entry) => entry.index >= 0 && match(entry.attrs))
  return node ? node.index : -1
}

async function main(): Promise<number> {
  step('calisma alani')
  const root = await mkdtemp(join(tmpdir(), 'aft-uctan-uca-'))
  app.setPath('userData', join(root, 'veri'))

  await writeFile(join(root, 'index.html'), RECORD_PAGE, 'utf8')
  await writeFile(join(root, 'ic.html'), RECORD_FRAME_PAGE, 'utf8')
  await writeFile(join(root, 'tamam.html'), RECORD_RESULT_PAGE, 'utf8')
  await writeFile(join(root, 'kabuk.html'), SHELL_PAGE, 'utf8')

  const server = new FixtureServer(root)
  await server.start()

  step('pencere ve koprular')
  const window = new BaseWindow({ ...VIEWPORT, show: true })

  const shell = new WebContentsView({
    webPreferences: { preload: preloadPath(), sandbox: false, contextIsolation: true }
  })
  const target = new WebContentsView({
    webPreferences: { sandbox: true, contextIsolation: true, partition: 'persist:aft-uctan-uca' }
  })

  window.contentView.addChildView(shell)
  window.contentView.addChildView(target)
  shell.setBounds({ x: 0, y: 0, width: 360, height: VIEWPORT.height })
  target.setBounds({ x: 360, y: 0, width: VIEWPORT.width - 360, height: VIEWPORT.height })

  await shell.webContents.loadURL(server.urlFor('kabuk.html'))

  const controller = new BrowserController(target)
  controller.attach()

  const identity = await mountIdentity(controller)
  const playback = await mountPlayback(controller, {
    identity: identity.identity(),
    descriptors: identity.catalog(),
    target: target.webContents,
    renderer: shell.webContents
  })
  mountRecord(controller, {
    identity: identity.identity(),
    descriptors: identity.catalog(),
    scenarios: playback.library(),
    target: target.webContents,
    renderer: shell.webContents
  })

  const ask = <T>(expression: string): Promise<T> =>
    shell.webContents.executeJavaScript(expression, true) as Promise<T>

  try {
    expect(
      'koprular yuklendi',
      await ask<boolean>(
        'Boolean(window.aft && window.aftIdentity && window.aftPlayback && window.aftRecord)'
      ),
      'aft, aftIdentity, aftPlayback, aftRecord'
    )

    await ask<boolean>(
      'window.__ilerleme = [], window.aftPlayback.onProgress(function (p) { window.__ilerleme.push(p) }), true'
    )

    step('kayit baslatiliyor')
    await controller.dispatch({ kind: 'navigate', url: server.urlFor('index.html') })

    const started = await ask<{ ok: boolean; message: string }>(
      'window.aftRecord.start({ options: { highlight: false } })'
    )
    expect('kayit basladi', started.ok, started.message)
    await delay(SETTLE_MS)

    step('kullanici etkilesimleri')
    const graph = await controller.scanGraph(1, true)
    const ad = ordinalOf(graph, (attrs) => attrs['id'] === 'ad')
    const eposta = ordinalOf(graph, (attrs) => attrs['id'] === 'eposta')
    const sehir = ordinalOf(graph, (attrs) => attrs['id'] === 'sehir')
    const sozlesme = ordinalOf(graph, (attrs) => attrs['id'] === 'sozlesme')
    const golge = ordinalOf(graph, (attrs) => attrs['data-testid'] === 'golge-dugme')
    const cerceve = ordinalOf(graph, (attrs) => attrs['data-testid'] === 'cerceve-dugme')

    await controller.dispatch({ kind: 'clear-type', ordinal: ad, text: 'Ayse Yilmaz' })
    await delay(160)
    await controller.dispatch({ kind: 'clear-type', ordinal: eposta, text: 'ayse@ornek.com' })
    await delay(160)
    await controller.dispatch({ kind: 'select-option', ordinal: sehir, optionValue: 'ist' })
    await delay(160)
    await controller.dispatch({ kind: 'click', ordinal: sozlesme })
    await delay(160)
    await controller.dispatch({ kind: 'click', ordinal: golge })
    await delay(160)
    await controller.dispatch({ kind: 'click', ordinal: cerceve })
    await delay(SETTLE_MS)

    const live = await ask<{ ok: boolean; data: { steps: { id: string; title: string }[] } }>(
      'window.aftRecord.state()'
    )
    expect('adimlar yakalandi', live.data.steps.length >= 5, 'adim=' + live.data.steps.length)

    step('imlec kisayolu')
    const channel = recordChannel()
    const turnedOff = channel ? channel.toggleHover() : true
    const afterOff = await ask<{ ok: boolean; data: { options: { captureHover: boolean } } }>(
      'window.aftRecord.state()'
    )
    expect(
      'ctrl+h imlec adimlarini kapatti',
      turnedOff === false && afterOff.data.options.captureHover === false,
      'captureHover=' + String(afterOff.data.options.captureHover)
    )

    const turnedOn = channel ? channel.toggleHover() : false
    const afterOn = await ask<{ ok: boolean; data: { options: { captureHover: boolean } } }>(
      'window.aftRecord.state()'
    )
    expect(
      'ctrl+h imlec adimlarini geri acti',
      turnedOn === true && afterOn.data.options.captureHover === true,
      'captureHover=' + String(afterOn.data.options.captureHover)
    )

    step('kayit sonrasi duzenleme')
    const lastStep = live.data.steps[live.data.steps.length - 1]?.id ?? ''
    const edited = await ask<{
      ok: boolean
      data: { ok: boolean; message: string; view: { steps: { kind: string }[] } }
    }>(
      'window.aftRecord.edit(' +
        JSON.stringify({ kind: 'wait', stepId: lastStep, timeoutMs: 500 }) +
        ')'
    )
    expect(
      'bekleme adimi eklendi',
      edited.data.ok && edited.data.view.steps.some((entry) => entry.kind === 'wait'),
      edited.data.message
    )

    const stopped = await ask<{ ok: boolean; data: { status: string; steps: unknown[] } }>(
      'window.aftRecord.stop()'
    )
    expect('kayit durduruldu', stopped.data.status === 'stopped', 'durum=' + stopped.data.status)

    step('senaryo kaydediliyor')
    const saved = await ask<{
      ok: boolean
      message: string
      data: {
        file: string
        scenario: { id: string; title: string; steps: unknown[] }
        report: { ok: boolean; warnings: unknown[] }
        entries: { id: string }[]
      }
    }>(
      'window.aftRecord.save(' +
        JSON.stringify({ meta: { title: 'Uctan uca kayit' }, keepSession: false }) +
        ')'
    )

    expect('senaryo kaydedildi', saved.ok && saved.data.report.ok, saved.message)
    expect('senaryo dosyaya yazildi', saved.data.file.endsWith('.scenario.json'), saved.data.file)

    const scenarioId = saved.data.scenario.id

    const listed = await ask<{ ok: boolean; data: { entries: { id: string; steps: number }[] } }>(
      'window.aftPlayback.list()'
    )
    expect(
      'kutuphanede goruldu',
      listed.data.entries.some((entry) => entry.id === scenarioId),
      'senaryo=' + listed.data.entries.length
    )

    const detail = await ask<{ ok: boolean; data: { report: { ok: boolean; errors: unknown[] } } }>(
      'window.aftPlayback.get(' + JSON.stringify(scenarioId) + ')'
    )
    expect('senaryo dogrulandi', detail.data.report.ok, 'hata=' + detail.data.report.errors.length)

    step('kaydedilen senaryo oynatiliyor')
    await controller.dispatch({ kind: 'navigate', url: server.urlFor('index.html') })

    const played = await ask<{
      ok: boolean
      message: string
      data: {
        run: {
          ok: boolean
          status: string
          failures: string[]
          contexts: string[]
          metrics: {
            steps: number
            passed: number
            scans: number
            resolvedExact: number
            resolvedLow: number
            resolvedMissing: number
            totalMs: number
          }
        }
        reports: string[]
      }
    }>(
      'window.aftPlayback.run(' +
        JSON.stringify({ scenarioId, options: { screenshotOnFailure: true } }) +
        ')'
    )

    const run = played.data.run
    process.stdout.write(
      '\nKosum ' +
        run.status +
        ' | adim ' +
        run.metrics.steps +
        ' | gecen ' +
        run.metrics.passed +
        ' | tarama ' +
        run.metrics.scans +
        ' | sure ' +
        run.metrics.totalMs +
        ' ms\n\n'
    )

    expect(
      'kaydedilen senaryo oynatildi',
      run.ok,
      run.status + ' | ' + (run.failures[0] ?? 'hata yok')
    )
    expect(
      'cozumleme kesin',
      run.metrics.resolvedLow === 0 && run.metrics.resolvedMissing === 0,
      'kesin=' +
        run.metrics.resolvedExact +
        ' dusuk=' +
        run.metrics.resolvedLow +
        ' bulunamayan=' +
        run.metrics.resolvedMissing
    )
    expect(
      'tarama tetiklendi, dayatilmadi',
      run.metrics.scans > 0 && run.metrics.scans <= run.metrics.steps,
      'tarama=' + run.metrics.scans + ' adim=' + run.metrics.steps
    )
    expect('rapor uretildi', played.data.reports.length > 0, 'rapor=' + played.data.reports.length)

    const progress = await ask<number>('window.__ilerleme.length')
    expect('ilerleme olaylari akti', progress >= run.metrics.steps, 'olay=' + progress)

    const last = await ask<{ ok: boolean; data: { id: string } | null }>(
      'window.aftPlayback.last()'
    )
    expect('son kosum okundu', Boolean(last.data?.id), 'kosum=' + (last.data?.id ?? ''))

    step('kimlik katalogu')
    const catalog = await ask<{ ok: boolean; data: { id: string; tier: string }[] }>(
      'window.aftIdentity.list()'
    )
    expect(
      'descriptor katalogu doldu',
      catalog.data.length > 0,
      'descriptor=' + catalog.data.length
    )

    const projection = await ask<{
      ok: boolean
      message: string
      data: { projection: { elements: unknown[] }; validation: { ok: boolean } } | null
    }>('window.aftIdentity.project("record")')
    expect(
      'record projeksiyonu',
      Boolean(
        projection.data &&
        projection.data.validation.ok &&
        projection.data.projection.elements.length > 0
      ),
      projection.data ? 'eleman=' + projection.data.projection.elements.length : projection.message
    )

    step('hata yolu ve baglam paketi')
    const brokenId = scenarioId + '-hata'
    const stored = await ask<{ ok: boolean; message: string }>(
      'window.aftPlayback.save(' +
        JSON.stringify({
          version: 'scenario/1.0.0',
          id: brokenId,
          title: 'Bulunamayan hedef',
          baseUrl: server.urlFor('index.html'),
          defaults: { scanLevel: 1, retries: 0, stopOnFailure: true },
          steps: [
            {
              id: 'olmayan',
              kind: 'click',
              title: 'Olmayan dugmeye tikla',
              retries: 0,
              target: { queryKind: 'test-id', query: 'olmayan-dugme' }
            }
          ]
        }) +
        ')'
    )

    expect('elle yazilan senaryo kaydedildi', stored.ok, stored.message)

    const reread = await ask<{
      ok: boolean
      data: {
        scenario: { steps: { target: { kind: string; query: { value: string } | null } }[] }
      } | null
    }>('window.aftPlayback.get(' + JSON.stringify(brokenId) + ')')

    expect(
      'sorgu hedefi kayit turunu atlatti',
      reread.data?.scenario.steps[0]?.target.kind === 'query' &&
        reread.data.scenario.steps[0]?.target.query?.value === 'olmayan-dugme',
      'hedef=' + (reread.data?.scenario.steps[0]?.target.kind ?? 'yok')
    )

    const broken = await ask<{
      ok: boolean
      message: string
      data: { run: { ok: boolean; contexts: string[]; failures: string[] } } | null
    }>(
      'window.aftPlayback.run(' +
        JSON.stringify({ scenarioId: brokenId, options: { screenshotOnFailure: true } }) +
        ')'
    )

    expect(
      'bulunamayan hedef raporlandi',
      Boolean(broken.data && !broken.data.run.ok),
      broken.data ? (broken.data.run.failures[0] ?? 'hata yok') : broken.message
    )
    expect(
      'baglam paketi uretildi',
      broken.data?.run.contexts.length === 1,
      'paket=' + (broken.data?.run.contexts.length ?? 0)
    )

    const packet = await ask<{
      ok: boolean
      message: string
      data: {
        context: {
          elements: unknown[]
          resolution: { trace: unknown[] } | null
          screenshot: string
        }
      } | null
    }>('window.aftPlayback.context(' + JSON.stringify(broken.data?.run.contexts[0] ?? '') + ')')

    const packed = packet.data?.context ?? null
    expect(
      'baglam paketi arayuze acildi',
      Boolean(
        packed &&
        packed.elements.length > 0 &&
        (packed.resolution?.trace.length ?? 0) > 0 &&
        packed.screenshot.length > 0
      ),
      packed
        ? 'eleman=' +
            packed.elements.length +
            ' strateji=' +
            (packed.resolution?.trace.length ?? 0) +
            ' goruntu=' +
            packed.screenshot.length +
            ' bayt'
        : 'paket okunamadi'
    )

    return verdict()
  } finally {
    await unmountRecord().catch(() => undefined)
    await unmountPlayback().catch(() => undefined)
    await unmountIdentity().catch(() => undefined)
    controller.dispose()
    await server.stop()
    if (!shell.webContents.isDestroyed()) shell.webContents.close()
    if (!target.webContents.isDestroyed()) target.webContents.close()
    if (!window.isDestroyed()) window.destroy()
  }
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
