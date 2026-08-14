import type { ElementGraph } from '../discovery'
import type { DescriptorStore, IdentityService } from '../identity'
import type { ElementModel, ModelIndex } from '../model'
import type { StepQuery, StepTarget } from '../scenario'
import { compose, defaultTitle, sessionId, type Composition } from './Composer'
import { edit, renumber, type EditOutcome } from './Editor'
import { normalize, sourceKey } from './Normalizer'
import { suppress } from './NoiseFilter'
import { assess, blocked, plain } from './Quality'
import { assertionOptions, build, descriptorTarget, stepId } from './StepFactory'
import {
  DEFAULT_RECORD,
  RECORD_VERSION,
  type EditRequest,
  type NoticeLevel,
  type RawElement,
  type RawInteraction,
  type RecordIntent,
  type RecordNotice,
  type RecordOptions,
  type RecordSession,
  type RecordedStep,
  type RecordHost,
  type ScenarioMeta
} from './types'

const NOTICE_LIMIT = 240

interface Located {
  graph: ElementGraph
  index: ModelIndex
  element: ElementModel
}

export interface RecorderOptions {
  descriptors?: DescriptorStore | null
  options?: Partial<RecordOptions>
  onChange?: (session: RecordSession) => void
  onNotice?: (notice: RecordNotice) => void
}

export class Recorder {
  private readonly lookups = new WeakMap<ModelIndex, Map<string, ElementModel>>()
  private session: RecordSession | null = null
  private queue: Promise<void> = Promise.resolve()
  private warmTimer: ReturnType<typeof setTimeout> | null = null
  private watching = false

  constructor(
    private readonly host: RecordHost,
    private readonly identity: IdentityService,
    private readonly config: RecorderOptions = {}
  ) {}

  state(): RecordSession | null {
    return this.session
  }

  isActive(): boolean {
    return this.session?.status === 'recording' || this.session?.status === 'paused'
  }

  async start(overrides: Partial<RecordOptions> = {}): Promise<RecordSession> {
    if (this.isActive()) throw new Error('Kayit zaten suruyor')

    if (this.host.prepare) await this.host.prepare()

    const options: RecordOptions = { ...DEFAULT_RECORD, ...this.config.options, ...overrides }
    const startedAt = Date.now()
    const url = this.host.url()

    const session: RecordSession = {
      version: RECORD_VERSION,
      id: sessionId(url, startedAt),
      status: 'recording',
      title: '',
      description: '',
      baseUrl: url,
      startedAt,
      updatedAt: startedAt,
      options,
      steps: [],
      notices: [],
      counters: {
        captured: 0,
        committed: 0,
        suppressed: 0,
        merged: 0,
        weak: 0,
        unresolved: 0,
        scans: 0
      }
    }

    session.title = defaultTitle(session)
    this.session = session

    await this.host.watch((batch) => this.accept(batch))
    this.watching = true

    this.notice('info', '', 'Kayit basladi: ' + (url || 'bos sayfa'), [
      'tarama seviyesi ' + options.scanLevel,
      'vurgu ' + (options.highlight ? 'acik' : 'kapali')
    ])
    this.warm(0)
    this.emit()
    return session
  }

  pause(): RecordSession | null {
    if (this.session?.status !== 'recording') return this.session
    this.session.status = 'paused'
    this.session.updatedAt = Date.now()
    this.notice('info', '', 'Kayit duraklatildi')
    void this.host.clearHighlight().catch(() => undefined)
    this.emit()
    return this.session
  }

  resume(): RecordSession | null {
    if (this.session?.status !== 'paused') return this.session
    this.session.status = 'recording'
    this.session.updatedAt = Date.now()
    this.notice('info', '', 'Kayit surduruluyor')
    this.warm(0)
    this.emit()
    return this.session
  }

  async stop(): Promise<RecordSession | null> {
    const session = this.session
    if (!session) return null

    session.status = 'stopped'
    session.updatedAt = Date.now()
    this.cancelWarm()

    if (this.watching) {
      this.watching = false
      await this.host.unwatch().catch(() => undefined)
    }
    await this.host.clearHighlight().catch(() => undefined)
    await this.settle()

    this.notice('info', '', 'Kayit durduruldu', [
      'adim ' + session.steps.length,
      'elenen ' + session.counters.suppressed,
      'zayif kimlik ' + session.counters.weak
    ])
    this.emit()
    return session
  }

  async discard(): Promise<void> {
    if (this.session) await this.stop()
    this.session = null
    this.emit()
  }

  applyEdit(request: EditRequest): EditOutcome {
    const session = this.session
    if (!session) return { ok: false, message: 'Etkin kayit yok', stepId: '' }

    const outcome = edit(session, request)
    if (outcome.ok) {
      this.notice('info', outcome.stepId, outcome.message)
      this.emit()
    }
    return outcome
  }

  describe(meta: Partial<ScenarioMeta>): RecordSession | null {
    const session = this.session
    if (!session) return null

    if (meta.title !== undefined) session.title = meta.title
    if (meta.description !== undefined) session.description = meta.description
    if (meta.baseUrl !== undefined) session.baseUrl = meta.baseUrl
    session.updatedAt = Date.now()
    this.emit()
    return session
  }

  compose(meta: Partial<ScenarioMeta> = {}): Composition {
    const session = this.session
    if (!session) throw new Error('Etkin kayit yok')
    if (!session.steps.length) throw new Error('Kayitta adim yok')
    return compose(session, meta)
  }

  settle(): Promise<void> {
    return this.queue
  }

  private accept(batch: RawInteraction[]): void {
    const task = async (): Promise<void> => {
      for (const raw of batch) await this.consume(raw)
    }
    const next = this.queue.then(task, task)
    this.queue = next.then(
      () => undefined,
      () => undefined
    )
  }

  private async consume(raw: RawInteraction): Promise<void> {
    const session = this.session
    if (!session || session.status !== 'recording') return

    session.counters.captured++

    const intent = normalize(raw, session.options)
    if (!intent) {
      session.counters.suppressed++
      return
    }

    if (intent.kind === 'navigate' && !session.steps.length) {
      session.baseUrl = intent.url
      session.title = defaultTitle(session)
      session.counters.suppressed++
      this.notice('info', '', 'Baslangic adresi guncellendi: ' + intent.url)
      this.emit()
      this.warm(session.options.warmDelayMs)
      return
    }

    const decision = suppress(intent, session.steps, session.options)

    if (decision.remove.length) {
      const removed = new Set(decision.remove)
      session.steps = session.steps.filter((step) => !removed.has(step.id))
      session.counters.suppressed += removed.size
      renumber(session)
      if (decision.removeReason) this.notice('info', '', decision.removeReason)
    }

    if (decision.drop) {
      session.counters.suppressed++
      if (decision.reason) this.notice('info', '', decision.reason)
      this.emit()
      return
    }

    if (decision.mergeInto && this.merge(session, decision.mergeInto, intent)) {
      session.counters.merged++
      this.emit()
      this.warm(session.options.warmDelayMs)
      return
    }

    await this.commit(session, intent)
  }

  private merge(session: RecordSession, id: string, intent: RecordIntent): boolean {
    const entry = session.steps.find((step) => step.id === id)
    if (!entry) return false

    if (entry.kind === 'scroll') {
      entry.step.deltaY += intent.deltaY
      entry.step.title = 'Kaydir: ' + entry.step.deltaY + ' px'
    } else if (entry.kind === 'clear-type') {
      entry.step.text = intent.text
      entry.step.title = rewrite(entry.step.title, intent.text)
    } else if (entry.kind === 'select-option') {
      entry.step.optionValue = intent.optionValue
      entry.step.title = rewrite(entry.step.title, intent.optionValue)
    } else {
      return false
    }

    entry.at = intent.at
    session.updatedAt = intent.at
    return true
  }

  private async commit(session: RecordSession, intent: RecordIntent): Promise<void> {
    const order = session.steps.length
    const id = stepId(session.id, order, intent.kind, intent.at)

    if (!intent.needsElement) {
      const step = build(id, intent, null, session.options)
      this.append(
        session,
        {
          id,
          order,
          at: intent.at,
          origin: 'capture',
          kind: step.kind,
          step,
          advice: plain(),
          assertions: assertionOptions(null, this.host.url(), this.host.title()),
          url: intent.raw.url || this.host.url(),
          frameDepth: 0,
          shadowDepth: 0,
          rect: null,
          scanned: false,
          sourceKey: ''
        },
        intent.raw
      )
      return
    }

    const located = await this.locate(intent.raw, session)

    if (!located) {
      session.counters.unresolved++
      const target = fallbackTarget(intent.raw.element)
      const step = build(id, intent, target, session.options)
      const reasons = target
        ? ['eleman agacta bulunamadi, sayfa verisinden sorgu uretildi']
        : ['eleman agacta bulunamadi ve sorgu uretilemedi']

      this.append(
        session,
        {
          id,
          order,
          at: intent.at,
          origin: 'capture',
          kind: step.kind,
          step,
          advice: blocked(reasons),
          assertions: assertionOptions(null, this.host.url(), this.host.title()),
          url: intent.raw.url || this.host.url(),
          frameDepth: 0,
          shadowDepth: 0,
          rect: intent.raw.element?.rect ?? null,
          scanned: true,
          sourceKey: sourceKey(intent.raw)
        },
        intent.raw
      )

      this.notice('error', id, 'Adim hedefi cozulemedi: ' + (intent.label || intent.kind), reasons)
      return
    }

    const captured = this.identity.captureByRef(located.graph, located.element.identity.ref)
    this.config.descriptors?.save(captured.descriptor)

    const advice = assess(captured.descriptor, located.element, located.index, intent.raw.element)
    const target = descriptorTarget(
      captured.descriptor,
      captured.descriptor.target.name || intent.label
    )
    const step = build(id, intent, target, session.options)

    if (advice.level !== 'strong') session.counters.weak++

    this.append(
      session,
      {
        id,
        order,
        at: intent.at,
        origin: 'capture',
        kind: step.kind,
        step,
        advice,
        assertions: assertionOptions(located.element, this.host.url(), this.host.title()),
        url: intent.raw.url || this.host.url(),
        frameDepth: located.element.framePath.depth,
        shadowDepth: located.element.shadowPath.depth,
        rect: intent.raw.element?.rect ?? located.element.geometry.viewport ?? null,
        scanned: true,
        sourceKey: sourceKey(intent.raw)
      },
      intent.raw
    )

    if (intent.kind === 'upload') {
      this.notice('warn', id, 'Dosya yolu tarayicidan alinamaz, adimdaki yol elle duzeltilmeli', [
        step.files.join(', ')
      ])
    }

    if (advice.level !== 'strong') {
      this.notice(
        advice.level === 'blocked' ? 'error' : 'warn',
        id,
        'Zayif kimlik: ' + step.title,
        advice.reasons.concat(advice.alternatives.map((option) => 'oneri: ' + option.label))
      )
    }
  }

  private append(session: RecordSession, entry: RecordedStep, raw: RawInteraction): void {
    session.steps.push(entry)
    session.counters.committed++
    renumber(session)

    if (session.options.highlight && entry.rect) {
      void this.host
        .highlight({
          sessionId: raw.sessionId,
          frameId: raw.frameId,
          rect: entry.rect,
          label: entry.order + 1 + ' · ' + entry.step.title,
          tone: entry.advice.level
        })
        .catch(() => undefined)
    }

    this.emit()
    this.warm(session.options.warmDelayMs)
  }

  private async locate(raw: RawInteraction, session: RecordSession): Promise<Located | null> {
    const key = sourceKey(raw)
    if (!key) return null

    const warm = this.host.currentGraph()
    const first = warm ? this.pick(warm, key) : null
    if (first) return first

    const scanned = await this.host.scan(session.options.scanLevel, false).catch(() => null)
    if (scanned) {
      session.counters.scans++
      const hit = this.pick(scanned, key)
      if (hit) return hit
    }

    const forced = await this.host.scan(session.options.scanLevel, true).catch(() => null)
    if (forced) {
      session.counters.scans++
      const hit = this.pick(forced, key)
      if (hit) return hit
    }

    return null
  }

  private pick(graph: ElementGraph, key: string): Located | null {
    const index = this.identity.index(graph)
    const element = this.lookup(index).get(key)
    return element ? { graph, index, element } : null
  }

  private lookup(index: ModelIndex): Map<string, ElementModel> {
    const cached = this.lookups.get(index)
    if (cached) return cached

    const map = new Map<string, ElementModel>()
    for (const element of index.elements()) {
      map.set(element.identity.sessionId + '|' + element.identity.backendNodeId, element)
    }
    this.lookups.set(index, map)
    return map
  }

  private warm(delayMs: number): void {
    this.cancelWarm()
    const session = this.session
    if (!session || session.status !== 'recording') return

    this.warmTimer = setTimeout(
      () => {
        this.warmTimer = null
        if (this.session?.status !== 'recording') return
        void this.host.scan(session.options.scanLevel, false).catch(() => undefined)
      },
      Math.max(0, delayMs)
    )
  }

  private cancelWarm(): void {
    if (!this.warmTimer) return
    clearTimeout(this.warmTimer)
    this.warmTimer = null
  }

  private notice(level: NoticeLevel, stepId: string, message: string, detail: string[] = []): void {
    const session = this.session
    if (!session) return

    const entry: RecordNotice = { at: Date.now(), level, stepId, message, detail }
    session.notices.push(entry)
    if (session.notices.length > NOTICE_LIMIT) session.notices.shift()
    this.config.onNotice?.(entry)
  }

  private emit(): void {
    this.config.onChange?.(
      this.session ?? {
        version: RECORD_VERSION,
        id: '',
        status: 'idle',
        title: '',
        description: '',
        baseUrl: '',
        startedAt: 0,
        updatedAt: Date.now(),
        options: { ...DEFAULT_RECORD, ...this.config.options },
        steps: [],
        notices: [],
        counters: {
          captured: 0,
          committed: 0,
          suppressed: 0,
          merged: 0,
          weak: 0,
          unresolved: 0,
          scans: 0
        }
      }
    )
  }
}

function fallbackTarget(element: RawElement | null): StepTarget | null {
  if (!element) return null

  const query = fallbackQuery(element)
  if (!query) return null

  return {
    kind: 'query',
    label: query.kind + ' "' + query.value + '"',
    descriptorId: '',
    descriptor: null,
    query,
    ordinal: -1
  }
}

function fallbackQuery(element: RawElement): StepQuery | null {
  const blank = { attribute: '', tag: '', role: '', nth: -1 }

  if (element.testId) {
    return { ...blank, kind: 'test-id', value: element.testId, attribute: element.testAttribute }
  }
  if (element.elementId) return { ...blank, kind: 'element-id', value: element.elementId }
  if (element.fieldName) return { ...blank, kind: 'field-name', value: element.fieldName }
  if (element.label) return { ...blank, kind: 'accessible-name', value: element.label }
  if (element.text) return { ...blank, kind: 'text', value: element.text, tag: element.tag }
  return null
}

function rewrite(title: string, value: string): string {
  const at = title.indexOf(' = ')
  if (at < 0) return title
  return title.slice(0, at) + ' = "' + clip(value) + '"'
}

function clip(value: string): string {
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length > 48 ? text.slice(0, 48) + '…' : text
}
