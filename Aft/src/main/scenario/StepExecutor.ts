import type { ActionKind, ActionOutcome, ActionRequest } from '../action'
import type { ElementGraph, ScanLevel, ScanProfileName } from '../discovery'
import type { IdentityService } from '../identity'
import type { AssertionEngine } from './AssertionEngine'
import { ContextStore, buildContext } from './FailureContext'
import type { RunLog } from './RunLog'
import { expectedFromCapture, verifyState } from './StateVerifier'
import type { TargetResolver } from './TargetResolver'
import type {
  PlaybackHost,
  PlaybackOptions,
  Scenario,
  ScenarioStep,
  StepResult,
  StepTarget
} from './types'

export interface ExecutionContext {
  runId: string
  scenario: Scenario
  options: PlaybackOptions
  previous: StepResult | null
}

export interface StepAttempt {
  ok: boolean
  message: string
}

export interface ConditionCheck {
  run: boolean
  reason: string
}

interface ResolvedIdentity {
  ref: string
  ordinal: number
}

export class StepExecutor {
  readonly counters = { scans: 0, retries: 0 }

  constructor(
    private readonly host: PlaybackHost,
    private readonly identity: IdentityService,
    private readonly resolver: TargetResolver,
    private readonly assertions: AssertionEngine,
    private readonly log: RunLog,
    private readonly contexts: ContextStore
  ) {}

  async run(step: ScenarioStep, order: number, ctx: ExecutionContext): Promise<StepResult> {
    const startedAt = Date.now()
    const result = empty(step, order, startedAt)
    const limit = step.retries + 1

    this.log.push('step', step.id, 'Adim ' + (order + 1) + ': ' + step.title)

    for (let attempt = 1; attempt <= limit; attempt++) {
      result.attempts = attempt
      reset(result)

      try {
        const outcome = await this.attempt(step, ctx, result, attempt > 1)
        result.message = outcome.message
        result.status = outcome.ok ? 'passed' : 'failed'
      } catch (error) {
        result.status = 'errored'
        result.message = error instanceof Error ? error.message : String(error)
      }

      if (result.status === 'passed') break
      if (attempt < limit) {
        this.counters.retries++
        this.log.push('warn', step.id, 'Adim yeniden deneniyor: ' + result.message)
      }
    }

    if (result.status !== 'passed') {
      this.log.push('error', step.id, 'Adim basarisiz: ' + result.message)
      result.contextId = await this.capture(step, ctx, result)
    }

    result.finishedAt = Date.now()
    result.durationMs = result.finishedAt - startedAt
    return result
  }

  async condition(step: ScenarioStep, ctx: ExecutionContext): Promise<ConditionCheck> {
    const condition = step.condition
    if (!condition) return { run: true, reason: '' }

    if (condition.kind === 'previous-passed') {
      const run = ctx.previous?.status === 'passed'
      return { run, reason: run ? '' : 'onceki adim gecmedi' }
    }
    if (condition.kind === 'previous-failed') {
      const run = Boolean(ctx.previous) && ctx.previous?.status !== 'passed'
      return { run, reason: run ? '' : 'onceki adim gecti' }
    }
    if (!condition.assertion) return { run: true, reason: '' }

    const graph = await this.graphFor(
      Boolean(condition.assertion.target),
      step.scanLevel ?? ctx.options.scanLevel,
      false,
      profileFor(condition.assertion.target, false)
    )
    const index = this.identity.index(graph)
    const passed = this.assertions.evaluate(condition.assertion, index, true).record.passed
    const run = condition.kind === 'assertion-passes' ? passed : !passed

    return { run, reason: run ? '' : 'kosul saglanmadi' }
  }

  skipped(step: ScenarioStep, order: number, reason: string): StepResult {
    const result = empty(step, order, Date.now())
    result.status = 'skipped'
    result.message = reason || 'kosul saglanmadi'
    result.finishedAt = result.startedAt
    this.log.push('info', step.id, 'Adim atlandi: ' + result.message)
    return result
  }

  private async attempt(
    step: ScenarioStep,
    ctx: ExecutionContext,
    result: StepResult,
    force: boolean
  ): Promise<StepAttempt> {
    if (step.kind === 'assert') return this.assert(step, ctx, result, force)
    if (!step.target) return this.plain(step, ctx, result)
    return this.targeted(step, ctx, result, force)
  }

  private async assert(
    step: ScenarioStep,
    ctx: ExecutionContext,
    result: StepResult,
    force: boolean
  ): Promise<StepAttempt> {
    if (!step.assertion) return { ok: false, message: 'Dogrulama tanimi yok' }

    const graph = await this.graphFor(
      Boolean(step.assertion.target),
      step.scanLevel ?? ctx.options.scanLevel,
      force,
      profileFor(step.assertion.target, force)
    )
    result.scanned = true

    const index = this.identity.index(graph)
    const outcome = this.assertions.evaluate(step.assertion, index, step.allowLowConfidence)

    result.assertions.push(outcome.record)
    if (outcome.resolution?.record) result.resolution = outcome.resolution.record
    this.log.assertion(step.id, outcome.record)

    if (outcome.record.passed) return { ok: true, message: 'Dogrulama gecti' }
    if (outcome.record.soft) {
      return { ok: true, message: 'Yumusak dogrulama tutmadi: ' + outcome.record.message }
    }
    return { ok: false, message: 'Dogrulama tutmadi: ' + outcome.record.message }
  }

  private async plain(
    step: ScenarioStep,
    ctx: ExecutionContext,
    result: StepResult
  ): Promise<StepAttempt> {
    const outcome = await this.dispatch(this.request(step, ctx, null), step.timeoutMs)
    result.outcome = outcome
    return { ok: outcome.ok, message: outcome.message }
  }

  private async targeted(
    step: ScenarioStep,
    ctx: ExecutionContext,
    result: StepResult,
    force: boolean
  ): Promise<StepAttempt> {
    const graph = await this.graphFor(
      true,
      step.scanLevel ?? ctx.options.scanLevel,
      force,
      profileFor(step.target, force)
    )
    result.scanned = true

    const index = this.identity.index(graph)
    const resolution = this.resolver.resolve(step.target!, index, step.allowLowConfidence)

    result.resolution = resolution.record
    if (resolution.record) this.log.resolution(step.id, resolution.record)
    if (!resolution.ok || !resolution.element) {
      return { ok: false, message: 'Hedef cozumlenemedi: ' + resolution.reason }
    }

    if (ctx.options.verifyState) {
      const strict = step.expectState !== null
      const expected =
        step.expectState ??
        (resolution.descriptor ? expectedFromCapture(resolution.descriptor) : null)

      if (expected) {
        const check = verifyState(expected, index, graph.coverage)
        result.stateCheck = check
        this.log.state(step.id, check, strict)

        if (!check.ok && strict) {
          return {
            ok: false,
            message: 'Sayfa durumu beklenenden farkli: ' + check.reasons.join(', ')
          }
        }
      }
    }

    const outcome = await this.dispatch(
      this.request(step, ctx, resolution.element.identity),
      step.timeoutMs
    )

    result.outcome = outcome
    return { ok: outcome.ok, message: outcome.message }
  }

  private async graphFor(
    elementSearch: boolean,
    level: ScanLevel,
    force: boolean,
    profile: ScanProfileName
  ): Promise<ElementGraph> {
    const current = this.host.currentGraph()
    if (!force && current && !elementSearch) return current

    const graph = await this.host.scan(level, force, profile)
    if (graph !== current) this.counters.scans++
    return graph
  }

  private dispatch(request: ActionRequest, timeoutMs: number): Promise<ActionOutcome> {
    return withTimeout(this.host.execute(request), timeoutMs, 'adim zaman asimina ugradi')
  }

  private request(
    step: ScenarioStep,
    ctx: ExecutionContext,
    target: ResolvedIdentity | null
  ): ActionRequest {
    return {
      kind: step.kind as ActionKind,
      ref: target?.ref || undefined,
      ordinal: target && target.ordinal >= 0 ? target.ordinal : undefined,
      text: step.kind === 'type' || step.kind === 'clear-type' ? step.text : undefined,
      key: step.kind === 'press-key' ? step.key : undefined,
      url: step.kind === 'navigate' ? absolute(step.url, ctx.scenario.baseUrl) : undefined,
      deltaY: step.kind === 'scroll' ? step.deltaY : undefined,
      optionValue: step.kind === 'select-option' ? step.optionValue : undefined,
      files: step.files.length ? step.files.slice() : undefined,
      timeoutMs: step.timeoutMs,
      mode: step.mode ?? ctx.options.inputMode ?? undefined
    }
  }

  private async capture(
    step: ScenarioStep,
    ctx: ExecutionContext,
    result: StepResult
  ): Promise<string> {
    const graph = this.host.currentGraph()
    const index = graph ? this.identity.index(graph) : null
    const screenshot = ctx.options.screenshotOnFailure
      ? await this.host.screenshot().catch(() => '')
      : ''

    const context = buildContext({
      runId: ctx.runId,
      scenarioId: ctx.scenario.id,
      stepId: step.id,
      stepTitle: step.title,
      message: result.message,
      graph,
      index,
      resolution: result.resolution,
      assertions: result.assertions,
      stateCheck: result.stateCheck,
      outcome: result.outcome,
      screenshot
    })

    try {
      return await this.contexts.write(context)
    } catch (error) {
      this.log.push(
        'warn',
        step.id,
        'Baglam paketi yazilamadi: ' + (error instanceof Error ? error.message : String(error))
      )
      return ''
    }
  }
}

export function profileFor(target: StepTarget | null, force: boolean): ScanProfileName {
  if (force) return 'agent'
  if (target && target.kind === 'ordinal') return 'agent'
  return 'playback'
}

export function needsElements(step: ScenarioStep): boolean {
  if (step.kind === 'assert') return Boolean(step.assertion?.target)
  return step.target !== null
}

export function absolute(url: string, baseUrl: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url
  if (!baseUrl) return url
  try {
    return new URL(url, baseUrl).toString()
  } catch {
    return url
  }
}

export function withTimeout<T>(task: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  if (timeoutMs <= 0) return task

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message + ': ' + timeoutMs + ' ms')), timeoutMs)
    task.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    )
  })
}

function reset(result: StepResult): void {
  result.assertions.length = 0
  result.resolution = null
  result.outcome = null
  result.stateCheck = null
  result.scanned = false
  result.message = ''
}

function empty(step: ScenarioStep, order: number, startedAt: number): StepResult {
  return {
    stepId: step.id,
    index: order,
    kind: step.kind,
    title: step.title,
    status: 'failed',
    message: '',
    attempts: 0,
    startedAt,
    finishedAt: startedAt,
    durationMs: 0,
    scanned: false,
    resolution: null,
    assertions: [],
    outcome: null,
    stateCheck: null,
    contextId: '',
    children: []
  }
}
