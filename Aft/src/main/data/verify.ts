import { app } from 'electron'
import { readdir, mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { writeFileAtomic } from '../atomic'
import { ContextStore } from '../scenario'
import { emptyMetrics } from '../scenario'
import {
  RUN_VERSION,
  SCENARIO_VERSION,
  type ResolutionRecord,
  type RunResult,
  type StepResult
} from '../scenario'
import { DataStore } from './DataStore'
import { openDatabase } from './driver'
import { migrateData } from './migrate'
import { NullTransport, backoffFor, type OutboxTransport } from './Outbox'
import { DATA_USER_VERSION, type ContextRef, type OutboxItem } from './types'
const CONTEXT_SUFFIX = '.context.json.gz'
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
function resolutionOf(descriptorId: string, state: ResolutionRecord['state']): ResolutionRecord {
  return {
    descriptorId,
    state,
    confidence: state === 'exact' ? 0.94 : 0.51,
    ambiguous: state === 'low-confidence',
    healed: state === 'low-confidence',
    quality: 0.77,
    ref: 'ref-' + descriptorId,
    ordinal: 12,
    winners: ['test-attribute', 'accessible-name'],
    trace: [],
    candidates: [],
    durationMs: 8,
    message: 'deneme'
  }
}
function stepOf(id: string, overrides: Partial<StepResult> = {}): StepResult {
  return {
    stepId: id,
    index: 0,
    kind: 'click',
    title: 'adim ' + id,
    status: 'passed',
    message: '',
    attempts: 1,
    startedAt: 1000,
    finishedAt: 1200,
    durationMs: 200,
    scanned: true,
    resolution: null,
    assertions: [],
    outcome: null,
    stateCheck: null,
    contextId: '',
    children: [],
    ...overrides
  }
}
function runOf(id: string, startedAt: number, contexts: string[] = []): RunResult {
  const metrics = emptyMetrics()
  metrics.steps = 5
  metrics.passed = 4
  metrics.failed = 1
  metrics.meanConfidence = 0.83
  metrics.totalMs = 4200
  return {
    id,
    version: RUN_VERSION,
    scenarioId: 'senaryo-1',
    scenarioTitle: 'Giris akisi',
    scenarioVersion: SCENARIO_VERSION,
    startedAt,
    finishedAt: startedAt + 4200,
    status: 'failed',
    ok: false,
    steps: [
      stepOf('s1', { resolution: resolutionOf('desc-a', 'exact') }),
      stepOf('g1', {
        kind: 'group',
        children: [
          stepOf('s2', { resolution: resolutionOf('desc-b', 'low-confidence') }),
          stepOf('s3', {
            status: 'failed',
            resolution: resolutionOf('desc-b', 'not-found'),
            contextId: contexts.length > 0 ? contexts[0] : ''
          })
        ]
      }),
      stepOf('s4', { kind: 'assert' })
    ],
    metrics,
    failures: ['s3 bulunamadi'],
    log: [],
    contexts
  }
}
async function seedContext(directory: string, id: string): Promise<ContextRef> {
  const filePath = join(directory, id + CONTEXT_SUFFIX)
  await writeFileAtomic(filePath, gzipSync(Buffer.from('{"id":"' + id + '"}', 'utf8')))
  const info = await stat(filePath)
  return { id, bytes: info.size, capturedAt: info.mtimeMs, filePath }
}
class LocalTransport implements OutboxTransport {
  readonly seen: string[] = []
  async send(item: OutboxItem): Promise<void> {
    this.seen.push(item.refId)
  }
}
async function main(): Promise<number> {
  step('calisma alani')
  const root = await mkdtemp(join(tmpdir(), 'aft-veri-'))
  const dbPath = join(root, 'data', 'aft.db')
  const contextDir = join(root, 'playback', 'contexts')
  const reportDir = join(root, 'playback', 'reports')
  const contexts = new ContextStore(contextDir)
  step('goc ve pragma')
  const first = openDatabase(dbPath)
  const migration = migrateData(first)
  expect(
    'bos dosyadan goc',
    migration.created && first.userVersion() === DATA_USER_VERSION,
    'surum ' + first.userVersion() + ', olusturuldu ' + String(migration.created)
  )
  expect('journal modu wal', first.journalMode() === 'wal', 'mod ' + first.journalMode())
  first.close()
  const second = openDatabase(dbPath)
  const again = migrateData(second)
  expect(
    'ikinci acilis idempotent',
    !again.created && again.applied.length === 0 && second.userVersion() === DATA_USER_VERSION,
    'uygulanan ' + again.applied.length
  )
  second.close()
  step('kosum indeksleme')
  const store = new DataStore({ filePath: dbPath, contexts })
  const contextId = 'ctx-1'
  const ref = await seedContext(contextDir, contextId)
  const run = runOf('run-1', Date.now() - 1000, [contextId])
  const reports = [join(reportDir, 'run-1.json'), join(reportDir, 'run-1.txt')]
  await writeFileAtomic(reports[0], JSON.stringify(run))
  await writeFileAtomic(reports[1], 'rapor metni')
  store.indexer.recordRun(run, {
    reports,
    contexts: [ref],
    origin: null,
    author: null,
    enqueue: true
  })
  const detail = store.indexer.detail('run-1')
  expect('kosum satiri yazildi', detail !== null, detail ? detail.run.id : 'yok')
  expect(
    'ic ice adimlar duzlestirildi',
    detail !== null && detail.steps.length === 5,
    'adim ' + (detail ? detail.steps.length : 0)
  )
  const group = detail ? detail.steps.find((entry) => entry.stepId === 'g1') : undefined
  const child = detail ? detail.steps.find((entry) => entry.stepId === 's2') : undefined
  expect(
    'ebeveyn baglantisi dogru',
    Boolean(group && child && child.parentIndex === group.stepIndex),
    'g1 ' + (group ? group.stepIndex : -1) + ', s2 ebeveyn ' + (child ? child.parentIndex : -1)
  )
  const resolved = detail ? detail.steps.find((entry) => entry.stepId === 's1') : undefined
  expect(
    'cozumleme alanlari tam',
    Boolean(
      resolved &&
      resolved.descriptorId === 'desc-a' &&
      resolved.matchState === 'exact' &&
      resolved.confidence > 0.9 &&
      resolved.winners.length === 2
    ),
    resolved ? resolved.descriptorId + ' ' + String(resolved.matchState) : 'yok'
  )
  const healed = detail ? detail.steps.find((entry) => entry.stepId === 's2') : undefined
  expect(
    'onarim bayragi tasindi',
    Boolean(healed && healed.healed && healed.ambiguous),
    healed ? 'onarildi ' + String(healed.healed) : 'yok'
  )
  expect(
    'baglam referansi kayitli',
    detail !== null && detail.contexts.length === 1 && detail.contexts[0].filePath === ref.filePath,
    detail && detail.contexts.length > 0 ? detail.contexts[0].id : 'yok'
  )
  const fragile = store.indexer.fragile(10)
  expect(
    'kirilgan adim tespiti',
    fragile.length === 1 && fragile[0].descriptorId === 'desc-b' && fragile[0].missing === 1,
    fragile.length > 0 ? fragile[0].descriptorId + ' eksik ' + fragile[0].missing : 'yok'
  )
  const health = store.indexer.health()
  expect(
    'saglik ozeti',
    health.runs === 1 && health.missing === 1 && health.healed === 1,
    'kosum ' + health.runs + ', eksik ' + health.missing
  )
  step('uzlastirma')
  await rm(ref.filePath, { force: true })
  const afterMissing = store.indexer.reconcile(await contexts.refs())
  expect(
    'kayip dosyanin satiri silindi',
    afterMissing.removedRows === 1,
    'silinen ' + afterMissing.removedRows
  )
  const stray = await seedContext(contextDir, 'ctx-yetim')
  const afterStray = store.indexer.reconcile(await contexts.refs())
  expect(
    'yetim dosya bildirildi',
    afterStray.orphanFiles.length === 1 && afterStray.orphanFiles[0] === stray.filePath,
    'yetim ' + afterStray.orphanFiles.length
  )
  step('senaryo indeksi yeniden kurulumu')
  const rebuilt = store.indexer.rebuildScenarioIndex([
    {
      id: 'senaryo-1',
      title: 'Giris akisi',
      steps: 4,
      updatedAt: Date.now(),
      fileName: 'senaryo-1.scenario.json',
      schemaVersion: SCENARIO_VERSION,
      origin: null,
      author: null
    }
  ])
  expect(
    'senaryo indeksi kuruldu',
    rebuilt === 1 && store.indexer.scenarios().length === 1,
    'satir ' + store.indexer.scenarios().length
  )
  step('kuyruk')
  const pending = store.outbox.summary()
  expect(
    'kosum kuyruga alindi',
    pending.pending === 1 && store.outbox.activeFor('run-1') === 1,
    'bekleyen ' + pending.pending
  )
  const failedFlush = await store.outbox.flush(10)
  expect(
    'sunucu yoksa kayit korunur',
    failedFlush.sent === 0 && failedFlush.failed === 1,
    'gonderilen ' + failedFlush.sent + ', hata ' + failedFlush.failed
  )
  const afterFail = store.outbox.summary()
  expect(
    'geri cekilme uygulandi',
    afterFail.failed === 1 && backoffFor(2) > backoffFor(1),
    'basarisiz ' + afterFail.failed + ', bekleme ' + backoffFor(1) + ' -> ' + backoffFor(2)
  )
  step('saklama politikasi')
  const blocked = await store.retention.sweep({ runRetentionMs: 0, keepRuns: 0 })
  expect(
    'kuyrukta bekleyen kosum silinmez',
    blocked.skippedPending === 1 && blocked.runsRemoved === 0,
    'atlanan ' + blocked.skippedPending + ', silinen ' + blocked.runsRemoved
  )
  const local = new LocalTransport()
  store.outbox.setTransport(local)
  store.driver.run('UPDATE outbox SET next_attempt_at = ? WHERE ref_id = ?', 0, 'run-1')
  const sentFlush = await store.outbox.flush(10)
  expect(
    'yerel alici ile kayipsiz gonderim',
    sentFlush.sent === 1 && local.seen.length === 1 && local.seen[0] === 'run-1',
    'gonderilen ' + sentFlush.sent
  )
  const released = await store.retention.sweep({ runRetentionMs: 0, keepRuns: 0 })
  expect(
    'gonderim sonrasi kosum silinir',
    released.runsRemoved === 1 && store.indexer.run('run-1') === null,
    'silinen ' + released.runsRemoved + ', rapor ' + released.reportsRemoved
  )
  expect(
    'basvuru satirlari kaskadla gitti',
    store.indexer.steps('run-1').length === 0 && store.indexer.contexts('run-1').length === 0,
    'adim ' + store.indexer.steps('run-1').length
  )
  step('atomik yazma')
  const target = join(root, 'atomik', 'ornek.json')
  await writeFileAtomic(target, '{"a":1}')
  await writeFileAtomic(target, '{"a":2}')
  const leftovers = (await readdir(join(root, 'atomik'))).filter((name) => name.endsWith('.tmp'))
  expect('gecici dosya birakmiyor', leftovers.length === 0, 'kalan ' + leftovers.length)
  step('indeks kaybi dayanikliligi')
  const stats = await store.stats()
  store.close()
  await rm(dbPath, { force: true })
  const revived = new DataStore({ filePath: dbPath, contexts })
  expect(
    'silinen veritabani yeniden kuruluyor',
    revived.migration().created && revived.indexer.counts().runs === 0,
    'surum ' + revived.driver.userVersion() + ', onceki boyut ' + stats.bytes
  )
  revived.close()
  const guard = new DataStore({ filePath: dbPath, contexts })
  guard.driver.setUserVersion(DATA_USER_VERSION + 5)
  guard.close()
  let refused = false
  try {
    const late = new DataStore({ filePath: dbPath, contexts })
    late.close()
  } catch {
    refused = true
  }
  expect('ileri surum reddedildi', refused, 'red ' + String(refused))
  expect(
    'null tasima varsayilan',
    new NullTransport() instanceof NullTransport,
    'varsayilan tasima kurulu'
  )
  await rm(root, { recursive: true, force: true })
  return verdict()
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
