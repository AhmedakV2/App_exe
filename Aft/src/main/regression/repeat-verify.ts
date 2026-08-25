import { app, BaseWindow, WebContentsView } from 'electron'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RecordAdapter } from '../bridge/RecordAdapter'
import { BrowserController } from '../browser/BrowserController'
import { delay } from '../discovery'
import type { ElementGraph } from '../discovery'
import { DEFAULT_HEALING, IdentityService } from '../identity'
import { Recorder } from '../record/Recorder'
import { TargetResolver } from '../scenario/TargetResolver'
import { FixtureServer } from './FixtureServer'

const VIEWPORT = { width: 1280, height: 900 }
const SETTLE_MS = 420

const STYLE = `
body { margin: 0; font: 14px sans-serif; }
#contents { display: flex; flex-wrap: wrap; gap: 12px; padding: 12px; }
.tile { width: 280px; }
.thumb { position: relative; display: block; width: 280px; height: 158px; background: #333; }
.overlay { position: absolute; inset: 0; }
.meta { padding: 6px 0; }
.title { display: block; color: #111; text-decoration: none; }
table { border-collapse: collapse; margin: 12px; }
td { border: 1px solid #999; padding: 6px 10px; }
`

function tile(slug: string, title: string, channel: string): string {
  return `
  <div class="style-scope tile">
    <a id="thumbnail" class="style-scope thumb" href="#v=${slug}" aria-label="${title} - ${channel}">
      <div class="style-scope overlay"></div>
    </a>
    <div class="style-scope meta">
      <a id="video-title-link" class="style-scope title" href="#v=${slug}">${title}</a>
      <span class="style-scope">${channel}</span>
    </div>
  </div>`
}

function row(name: string): string {
  return `<tr><td>${name}</td><td><button class="sil">Sil</button></td></tr>`
}

function page(rows: [string, string, string][], names: string[]): string {
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><title>Akis</title><style>${STYLE}</style></head>
<body>
<div id="contents" class="style-scope">${rows.map((r) => tile(r[0], r[1], r[2])).join('')}</div>
<table><tbody>${names.map(row).join('')}</tbody></table>
</body></html>`
}

const HEDEF: [string, string, string] = ['hedef', 'Kayitli hedef video', 'Kanal Hedef']
const SATIRLAR = ['Ali', 'Veli', 'Ayse', 'Fatma']

const PAGE_V1 = page(
  [
    ['a1', 'Bir numarali video', 'Kanal Bir'],
    ['a2', 'Iki numarali video', 'Kanal Iki'],
    HEDEF,
    ['a4', 'Dort numarali video', 'Kanal Dort'],
    ['a5', 'Bes numarali video', 'Kanal Bes'],
    ['a6', 'Alti numarali video', 'Kanal Alti']
  ],
  SATIRLAR
)

const PAGE_V2 = page(
  [
    ['b1', 'Yepyeni bir icerik', 'Kanal Yeni'],
    ['b2', 'Baska bir icerik', 'Kanal Baska'],
    ['b3', 'Ucuncu yeni icerik', 'Kanal Ucuncu'],
    ['b4', 'Dorduncu yeni icerik', 'Kanal Dorduncu'],
    HEDEF,
    ['b6', 'Altinci yeni icerik', 'Kanal Altinci']
  ],
  SATIRLAR
)

const checks: { name: string; ok: boolean; detail: string }[] = []

function expect(name: string, ok: boolean, detail: string): void {
  checks.push({ name, ok, detail })
  process.stdout.write((ok ? 'GECTI ' : 'KALDI ') + name + ' | ' + detail + '\n')
}

async function fixtures(): Promise<{ server: FixtureServer; root: string }> {
  const root = await mkdtemp(join(tmpdir(), 'aft-probe-'))
  await writeFile(join(root, 'v1.html'), PAGE_V1, 'utf8')
  await writeFile(join(root, 'v2.html'), PAGE_V2, 'utf8')
  const server = new FixtureServer(root)
  await server.start()
  return { server, root }
}

function nthByClass(graph: ElementGraph, klass: string, nth: number): number {
  const found = graph.nodes.filter(
    (node) => node.index >= 0 && (node.attrs['class'] ?? '').includes(klass)
  )
  return found[nth] ? found[nth].index : -1
}

function label(graph: ElementGraph, ref: string): string {
  const node = graph.get(ref)
  if (!node) return 'bulunamadi'
  return (
    node.tag + ' href=' + (node.attrs['href'] || '-') + ' metin=' + (node.text || '-').slice(0, 32)
  )
}

async function main(): Promise<number> {
  const { server, root } = await fixtures()
  const window = new BaseWindow({ ...VIEWPORT, show: true })
  const view = new WebContentsView({
    webPreferences: { sandbox: true, contextIsolation: true, partition: 'persist:aft-probe' }
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
    await controller.dispatch({ kind: 'navigate', url: server.urlFor('v1.html') })
    await recorder.start()
    await delay(SETTLE_MS)

    const graph = await controller.scanGraph(1, true)
    const overlay = nthByClass(graph, 'overlay', 2)
    const silme = nthByClass(graph, 'sil', 2)
    expect(
      'fixture hedefleri bulundu',
      overlay >= 0 && silme >= 0,
      'ortu=' + overlay + ' sil=' + silme
    )

    await controller.dispatch({ kind: 'click', ordinal: overlay })
    await delay(SETTLE_MS)
    await controller.dispatch({ kind: 'click', ordinal: silme })
    await delay(SETTLE_MS)

    const session = await recorder.stop()
    if (!session) throw new Error('kayit oturumu olusmadi')

    const steps = session.steps.filter((entry) => entry.kind === 'click')
    process.stdout.write('\n--- KAYIT ---\n')
    for (const entry of steps) {
      const target = entry.step.target
      process.stdout.write(
        '  ' +
          entry.step.title +
          ' | hedef=' +
          (target?.kind ?? '-') +
          (target?.query ? ' sorgu=' + target.query.kind + ':' + target.query.value : '') +
          ' | tavsiye=' +
          entry.advice.level +
          ' | descriptor=' +
          (target?.descriptor ? 'var' : 'yok') +
          '\n'
      )
    }

    const kart = steps[0]
    expect(
      'kart adimi tekil sorguya baglandi',
      kart?.step.target?.kind === 'query' && kart.step.target.query?.kind === 'accessible-name',
      kart?.step.target?.kind + ':' + (kart?.step.target?.query?.kind ?? '-')
    )
    expect(
      'kart adimi descriptor yedegini tasiyor',
      Boolean(kart?.step.target?.descriptor),
      kart?.step.target?.descriptor ? 'descriptor var' : 'descriptor yok'
    )

    await controller.dispatch({ kind: 'navigate', url: server.urlFor('v2.html') })
    await controller.scanGraph(1, true)
    const second = controller.currentGraph()
    if (!second) throw new Error('ikinci tarama yok')

    const index = identity.index(second)
    const resolver = new TargetResolver(identity, null)

    process.stdout.write('\n--- OYNATMA (akis yenilendi) ---\n')
    for (const entry of steps) {
      const target = entry.step.target
      if (!target) continue
      const outcome = resolver.resolve(target, index, false)
      process.stdout.write(
        '  ' +
          entry.step.title +
          '\n    sonuc=' +
          (outcome.ok ? 'COZUMLENDI' : 'DUSTU') +
          ' durum=' +
          (outcome.record?.state ?? '-') +
          ' guven=' +
          (outcome.record?.confidence ?? 0) +
          ' belirsiz=' +
          String(outcome.record?.ambiguous ?? false) +
          '\n    eleman=' +
          (outcome.element ? label(second, outcome.element.identity.ref) : outcome.reason) +
          '\n'
      )
    }

    const kartSonuc = resolver.resolve(steps[0].step.target!, index, false)
    expect(
      'kart adimi dogru karta cozumlendi',
      kartSonuc.ok && label(second, kartSonuc.element!.identity.ref).includes('v=hedef'),
      kartSonuc.ok ? label(second, kartSonuc.element!.identity.ref) : kartSonuc.reason
    )

    const silAdimi = steps[1]
    expect('tekrar eden satir adimi kaydedildi', Boolean(silAdimi), 'adim=' + steps.length)
    if (silAdimi?.step.target) {
      const silSonuc = resolver.resolve(silAdimi.step.target, index, false)
      const beklenen = nthByClass(second, 'sil', 2)
      const bulunan = silSonuc.element?.identity.ordinal ?? -1
      expect(
        'tekrar eden satir dogru satira cozumlendi',
        silSonuc.ok && bulunan === beklenen,
        'beklenen sira=' + beklenen + ' bulunan sira=' + bulunan + ' | ' + silSonuc.reason
      )
    }

    const failed = checks.filter((entry) => !entry.ok).length
    process.stdout.write('\nToplam ' + checks.length + ', basarisiz ' + failed + '\n')
    return failed === 0 ? 0 : 1
  } finally {
    await recorder.discard().catch(() => undefined)
    controller.dispose()
    await identity.dispose()
    await server.stop()
    if (!view.webContents.isDestroyed()) view.webContents.close()
    if (!window.isDestroyed()) window.destroy()
  }
}

app.whenReady().then(() => {
  main()
    .then((code) => app.exit(code))
    .catch((error) => {
      process.stdout.write('HATA ' + String(error) + '\n')
      app.exit(1)
    })
})
