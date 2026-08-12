import { app, BaseWindow, WebContentsView } from 'electron'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BrowserController } from '../browser/BrowserController'
import type { GraphNode } from '../discovery'
import { DEFAULT_HEALING, IdentityService } from '../identity'
import type { Descriptor } from '../identity'
import { project, validateSnapshot } from '../model'
import { SMOKE_FRAME, SMOKE_PAGE } from './fixture'
import { FixtureServer } from './FixtureServer'

const VIEWPORT = { width: 1280, height: 900 }

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

async function fixtures(): Promise<FixtureServer> {
  const root = await mkdtemp(join(tmpdir(), 'aft-smoke-'))
  await writeFile(join(root, 'index.html'), SMOKE_PAGE, 'utf8')
  await writeFile(join(root, 'inner.html'), SMOKE_FRAME, 'utf8')

  const server = new FixtureServer(root)
  await server.start()
  return server
}

function byTestId(nodes: readonly GraphNode[], value: string): GraphNode | undefined {
  return nodes.find((node) => node.attrs['data-testid'] === value)
}

function byId(nodes: readonly GraphNode[], value: string): GraphNode | undefined {
  return nodes.find((node) => node.attrs['id'] === value)
}

async function main(): Promise<number> {
  step('fixture sunucusu')
  const server = await fixtures()
  step('pencere')
  const window = new BaseWindow({ ...VIEWPORT, show: false })
  const view = new WebContentsView({
    webPreferences: { sandbox: true, contextIsolation: true, partition: 'persist:aft-smoke' }
  })

  window.contentView.addChildView(view)
  view.setBounds({ x: 0, y: 0, ...VIEWPORT })

  const controller = new BrowserController(view)
  const identity = new IdentityService({
    historyPath: join(app.getPath('temp'), 'aft-smoke', 'history.json'),
    healing: DEFAULT_HEALING,
    resolve: {}
  })
  await identity.load()

  let pinned: Descriptor | null = null
  controller.setDescriptorResolver((descriptorId) => {
    const graph = controller.currentGraph()
    if (!pinned || pinned.id !== descriptorId || !graph) return null

    const outcome = identity.resolveOn(pinned, graph)
    const candidate = outcome.resolution.candidate
    if (!candidate) return null
    return {
      ref: candidate.ref,
      confidence: outcome.resolution.confidence,
      ambiguous: outcome.resolution.ambiguous
    }
  })

  try {
    step('baglanti')
    controller.attach()
    controller.setLevel(1)

    step('navigasyon')
    const opened = await controller.execute({
      action: 'go_to_url',
      url: server.urlFor('index.html')
    })
    expect('navigasyon', opened.ok, opened.result)

    await controller.scan(1)
    const graph = controller.currentGraph()
    if (!graph) {
      expect('kesif', false, 'tarama uretilemedi')
      return report()
    }

    const nodes = graph.nodes
    const coverage = graph.coverage

    expect('shadow kok', coverage.shadowRoots >= 2, 'shadowRoots=' + coverage.shadowRoots)
    expect('cerceve', coverage.frames >= 2, 'frames=' + coverage.frames)
    expect(
      'erisilemeyen cerceve yok',
      coverage.framesFailed === 0,
      'failed=' + coverage.framesFailed
    )

    expect('shadow dugme', Boolean(byTestId(nodes, 'shadow-action')), 'shadow-action')
    expect('ic ice shadow dugme', Boolean(byTestId(nodes, 'deep-action')), 'deep-action')
    expect('cerceve dugmesi', Boolean(byTestId(nodes, 'frame-action')), 'frame-action')

    const canvasSpot = graph.blindSpots.some((spot) => spot.kind === 'canvas')
    expect('canvas kor noktasi', canvasSpot, 'blindSpots=' + graph.blindSpots.length)

    const frameBox = byId(nodes, 'inner')?.viewRect
    const framed = byId(nodes, 'frame-input')?.viewRect
    const inside =
      Boolean(frameBox && framed) &&
      framed!.y >= frameBox!.y &&
      framed!.y + framed!.h <= frameBox!.y + frameBox!.h &&
      framed!.x >= frameBox!.x

    expect(
      'cerceve koordinat kaymasi',
      inside,
      'cerceve y=' + (frameBox?.y ?? -1) + ' girdi y=' + (framed?.y ?? -1)
    )

    const covered = byId(nodes, 'hidden-under')
    expect(
      'ustu kapali tespiti',
      covered?.occluded === true,
      'occluded=' + String(covered?.occluded)
    )

    const index = identity.index(graph)
    const validation = validateSnapshot(index.snapshot)
    expect('model dogrulama', validation.ok, 'hata=' + validation.errors.length)

    const agent = project(index, 'agent')
    const playback = project(index, 'playback')
    expect('agent projeksiyonu', agent.elements.length > 0, 'aday=' + agent.elements.length)
    expect(
      'playback projeksiyonu genis',
      playback.elements.length >= agent.elements.length,
      'playback=' + playback.elements.length + ' agent=' + agent.elements.length
    )

    const primary = byTestId(nodes, 'primary-action')
    if (!primary || primary.index < 0) {
      expect('hedef dugme', false, 'primary-action adreslenemedi')
      return report()
    }

    pinned = identity.captureFromIndex(index, primary.index)
    expect('descriptor kalitesi', pinned.quality.tier === 'strong', 'tier=' + pinned.quality.tier)
    expect(
      'test niteligi stratejisi',
      pinned.strategies.some((strategy) => strategy.kind === 'test-attribute'),
      'strateji=' + pinned.strategies.map((strategy) => strategy.kind).join(',')
    )

    const login = byId(nodes, 'user')
    if (login && login.index >= 0) {
      const typed = await controller.execute({ action: 'type', index: login.index, text: 'ahmet' })
      expect('metin yazma', typed.ok, typed.result)

      const after = controller.currentGraph()
      const field = after ? byId(after.nodes, 'user') : undefined
      expect('girdi degeri', field?.value === 'ahmet', 'value=' + String(field?.value))
    } else {
      expect('metin yazma', false, 'kullanici alani adreslenemedi')
    }

    const reloaded = await controller.execute({
      action: 'go_to_url',
      url: server.urlFor('index.html')
    })
    expect('yeniden yukleme', reloaded.ok, reloaded.result)
    await controller.scan(1)

    const second = controller.currentGraph()
    if (!second) {
      expect('ikinci kesif', false, 'tarama uretilemedi')
      return report()
    }

    const resolution = identity.resolveOn(pinned, second).resolution
    expect(
      'descriptor cozumleme',
      resolution.state === 'exact',
      resolution.state + ' guven=' + resolution.confidence
    )

    const resolved = resolution.candidate ? second.get(resolution.candidate.ref) : undefined
    expect(
      'cozumlenen hedef dogru',
      resolved?.attrs['data-testid'] === 'primary-action',
      'testid=' + String(resolved?.attrs['data-testid'])
    )

    const clicked = await controller.execute({ action: 'click', descriptorId: pinned.id })
    expect('descriptor ile tiklama', clicked.ok, clicked.result)
    expect(
      'eylem hazirlik raporu',
      clicked.outcome?.actionability?.ready === true,
      'reason=' + String(clicked.outcome?.actionability?.reason)
    )

    const third = controller.currentGraph()
    const result = third ? byId(third.nodes, 'result') : undefined
    expect('sayfa tepkisi', result?.text === 'tiklandi', 'text=' + String(result?.text))

    const stillCovered = byId(third?.nodes ?? [], 'hidden-under')
    const blocked = await controller.execute({ action: 'click', index: stillCovered?.index ?? -1 })
    expect(
      'kapali eleman reddedildi',
      !blocked.ok && blocked.outcome?.code === 'element-not-ready',
      'kod=' + String(blocked.outcome?.code)
    )

    const missing = await controller.execute({ action: 'click', descriptorId: 'yok' })
    expect(
      'bilinmeyen descriptor reddedildi',
      !missing.ok && missing.outcome?.code === 'element-not-found',
      'kod=' + String(missing.outcome?.code)
    )

    return report()
  } finally {
    controller.dispose()
    await identity.dispose()
    await server.stop()
    if (!view.webContents.isDestroyed()) view.webContents.close()
    if (!window.isDestroyed()) window.destroy()
  }
}

function report(): number {
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
