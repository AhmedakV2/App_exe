import { ipcMain } from 'electron'
import type { DescriptorStore, IdentityService } from '../identity'
import {
  DEFAULT_RECORD,
  Recorder,
  compose,
  type AssertionSpec,
  type EditRequest,
  type RecordHost,
  type RecordNotice,
  type RecordOptions,
  type RecordSession,
  type RecordedStep,
  type ScenarioMeta
} from '../record'
import { ASSERTION_KINDS, type ScenarioStore } from '../scenario'
import type { ChannelResult } from './types'
import {
  RECORD_NOTICE_EVENT,
  RECORD_UPDATE_EVENT,
  type EditPayload,
  type RecordChannelName,
  type RecordEditRequest,
  type RecordStepView,
  type RecordView,
  type SavePayload,
  type SaveRequest,
  type StartRequest
} from './record-types'

const CHANNELS: RecordChannelName[] = [
  'aft:record:start',
  'aft:record:stop',
  'aft:record:pause',
  'aft:record:resume',
  'aft:record:state',
  'aft:record:edit',
  'aft:record:describe',
  'aft:record:options',
  'aft:record:save',
  'aft:record:discard'
]

const EDITABLE_KINDS: ReadonlySet<string> = new Set([
  'type',
  'clear-type',
  'select-option',
  'navigate',
  'press-key',
  'upload',
  'scroll',
  'wait',
  'hover',
  'assert'
])

const VALUE_LABELS: Record<string, string> = {
  type: 'Metin',
  'clear-type': 'Metin',
  'select-option': 'Secenek',
  navigate: 'Adres',
  'press-key': 'Tus',
  upload: 'Dosya yolu',
  scroll: 'Piksel',
  wait: 'Bekleme (ms)',
  hover: 'Imlec suresi (ms)',
  assert: 'Beklenen'
}

export interface RecordChannelOptions {
  host: RecordHost
  identity: IdentityService
  descriptors?: DescriptorStore | null
  scenarios: ScenarioStore
  options?: Partial<RecordOptions>
  notify?: (channel: string, payload: unknown) => void
}

const VIEW_DEBOUNCE_MS = 120

export class RecordChannel {
  private readonly recorder: Recorder
  private readonly scenarios: ScenarioStore
  private readonly notify: ((channel: string, payload: unknown) => void) | null
  private registered = false
  private pendingSession: RecordSession | null = null
  private viewTimer: ReturnType<typeof setTimeout> | null = null

  constructor(options: RecordChannelOptions) {
    this.scenarios = options.scenarios
    this.notify = options.notify ?? null

    this.recorder = new Recorder(options.host, options.identity, {
      descriptors: options.descriptors ?? null,
      options: options.options,
      onChange: (session) => this.schedule(session),
      onNotice: (notice: RecordNotice) => this.notify?.(RECORD_NOTICE_EVENT, notice)
    })
  }

  private schedule(session: RecordSession): void {
    this.pendingSession = session

    if (session.status !== 'recording') {
      this.flush()
      return
    }
    if (this.viewTimer) return

    this.viewTimer = setTimeout(() => {
      this.viewTimer = null
      this.flush()
    }, VIEW_DEBOUNCE_MS)
  }

  private flush(): void {
    if (this.viewTimer) {
      clearTimeout(this.viewTimer)
      this.viewTimer = null
    }
    const session = this.pendingSession
    this.pendingSession = null
    if (session) this.notify?.(RECORD_UPDATE_EVENT, view(session))
  }

  register(): void {
    if (this.registered) return
    this.registered = true

    ipcMain.handle('aft:record:start', (_event, request: unknown) =>
      this.guard('Kayit basladi', async () => {
        const payload = (request ?? {}) as Partial<StartRequest>
        await this.recorder.start(payload.options ?? {})
        return this.view()
      })
    )

    ipcMain.handle('aft:record:stop', () =>
      this.guard('Kayit durduruldu', async () => {
        await this.recorder.stop()
        return this.view()
      })
    )

    ipcMain.handle('aft:record:pause', () =>
      this.guard('Kayit duraklatildi', () => {
        this.recorder.pause()
        return this.view()
      })
    )

    ipcMain.handle('aft:record:resume', () =>
      this.guard('Kayit surduruluyor', () => {
        this.recorder.resume()
        return this.view()
      })
    )

    ipcMain.handle('aft:record:state', () => this.guard('Kayit durumu okundu', () => this.view()))

    ipcMain.handle('aft:record:edit', (_event, request: unknown) =>
      this.guard('Duzenleme uygulandi', (): EditPayload => {
        const outcome = this.recorder.applyEdit(editRequest(request as RecordEditRequest))
        return { ...outcome, view: this.view() }
      })
    )

    ipcMain.handle('aft:record:describe', (_event, meta: unknown) =>
      this.guard('Kayit bilgisi guncellendi', () => {
        this.recorder.describe((meta ?? {}) as Partial<ScenarioMeta>)
        return this.view()
      })
    )

    ipcMain.handle('aft:record:options', (_event, options: unknown) =>
      this.guard('Kayit ayarlari guncellendi', () => {
        this.apply((options ?? {}) as Partial<RecordOptions>)
        return this.view()
      })
    )

    ipcMain.handle('aft:record:save', (_event, request: unknown) =>
      this.guard('Senaryo kaydedildi', () => this.save((request ?? {}) as Partial<SaveRequest>))
    )

    ipcMain.handle('aft:record:discard', () =>
      this.guard('Kayit atildi', async () => {
        await this.recorder.discard()
        return this.view()
      })
    )
  }

  async dispose(): Promise<void> {
    if (this.registered) {
      for (const channel of CHANNELS) ipcMain.removeHandler(channel)
      this.registered = false
    }
    await this.recorder.discard().catch(() => undefined)
    this.flush()
  }

  session(): RecordSession | null {
    return this.recorder.state()
  }

  toggleHover(): boolean {
    const session = this.recorder.state()
    if (!session) return false
    return this.recorder.setHover(!session.options.captureHover)
  }

  private apply(options: Partial<RecordOptions>): void {
    const session = this.recorder.state()
    if (!session) throw new Error('Etkin kayit yok')
    session.options = { ...session.options, ...options }
    session.updatedAt = Date.now()
  }

  private async save(request: Partial<SaveRequest>): Promise<SavePayload> {
    const composition = this.recorder.compose(request.meta ?? {})
    if (!composition.report.ok) {
      const detail = composition.report.errors
        .map((issue) => issue.path + ': ' + issue.message)
        .join(', ')
      throw new Error('Kayit senaryoya cevrilemedi: ' + detail)
    }

    const file = await this.scenarios.write(composition.scenario)
    if (!request.keepSession) await this.recorder.discard()

    return {
      scenario: composition.scenario,
      report: composition.report,
      file,
      entries: this.scenarios.entries()
    }
  }

  private view(): RecordView {
    const session = this.recorder.state()
    return session ? view(session) : empty()
  }

  private async guard<T>(
    message: string,
    handler: () => T | Promise<T>
  ): Promise<ChannelResult<T>> {
    try {
      return { ok: true, data: await handler(), message }
    } catch (error) {
      return {
        ok: false,
        data: null,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  }
}

export function view(session: RecordSession): RecordView {
  const report = session.steps.length ? compose(session).report : null

  return {
    id: session.id,
    status: session.status,
    title: session.title,
    description: session.description,
    baseUrl: session.baseUrl,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    options: { ...session.options },
    counters: { ...session.counters },
    steps: session.steps.map(stepView),
    notices: session.notices.slice(-60),
    report
  }
}

function stepView(entry: RecordedStep): RecordStepView {
  const step = entry.step

  return {
    id: entry.id,
    order: entry.order,
    kind: entry.kind,
    title: step.title,
    origin: entry.origin,
    targetKind: step.target?.kind ?? 'none',
    targetLabel: step.target?.label ?? '',
    level: entry.advice.level,
    tier: entry.advice.tier,
    score: entry.advice.score,
    confidence: entry.advice.confidence,
    ambiguous: entry.advice.ambiguous,
    strategies: entry.advice.strategies.slice(),
    reasons: entry.advice.reasons.slice(),
    alternatives: entry.advice.alternatives.map((option) => ({
      id: option.id,
      label: option.label,
      detail: option.detail,
      matches: option.matches,
      unique: option.unique
    })),
    assertions: entry.assertions.slice(),
    value: valueOf(entry),
    valueLabel: VALUE_LABELS[entry.kind] ?? '',
    editable:
      EDITABLE_KINDS.has(entry.kind) && (entry.kind !== 'assert' || Boolean(step.assertion)),
    waitMs: step.waitMs,
    timeoutMs: step.timeoutMs,
    continueOnFailure: step.continueOnFailure,
    url: entry.url,
    frameDepth: entry.frameDepth,
    shadowDepth: entry.shadowDepth
  }
}

function valueOf(entry: RecordedStep): string {
  const step = entry.step
  if (entry.kind === 'type' || entry.kind === 'clear-type') return step.text
  if (entry.kind === 'select-option') return step.optionValue
  if (entry.kind === 'navigate') return step.url
  if (entry.kind === 'press-key') return step.key
  if (entry.kind === 'upload') return step.files.join(', ')
  if (entry.kind === 'scroll') return String(step.deltaY)
  if (entry.kind === 'wait' || entry.kind === 'hover') return String(step.waitMs)
  if (entry.kind === 'assert') return step.assertion?.expected ?? ''
  return ''
}

function empty(): RecordView {
  return {
    id: '',
    status: 'idle',
    title: '',
    description: '',
    baseUrl: '',
    startedAt: 0,
    updatedAt: Date.now(),
    options: { ...DEFAULT_RECORD },
    counters: {
      captured: 0,
      committed: 0,
      suppressed: 0,
      merged: 0,
      weak: 0,
      unresolved: 0,
      scans: 0
    },
    steps: [],
    notices: [],
    report: null
  }
}

function editRequest(raw: RecordEditRequest): EditRequest {
  return {
    kind: raw.kind ?? 'remove',
    stepId: String(raw.stepId ?? ''),
    offset: Number(raw.offset ?? 0),
    title: String(raw.title ?? ''),
    text: String(raw.text ?? ''),
    optionId: String(raw.optionId ?? ''),
    timeoutMs: Number(raw.timeoutMs ?? 1000),
    flag: Boolean(raw.flag),
    assertion: assertionSpec(raw.assertion)
  }
}

function assertionSpec(raw: AssertionSpec | null | undefined): AssertionSpec | null {
  if (!raw || !ASSERTION_KINDS.includes(raw.kind)) return null

  return {
    kind: raw.kind,
    expected: String(raw.expected ?? ''),
    attribute: String(raw.attribute ?? ''),
    count: Number.isFinite(raw.count) ? Math.max(0, Math.round(raw.count)) : 1,
    soft: Boolean(raw.soft)
  }
}
