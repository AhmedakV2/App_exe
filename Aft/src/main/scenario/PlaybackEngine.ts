import type { DescriptorStore, IdentityService } from '../identity'
import { digest } from '../model'
import { AssertionEngine } from './AssertionEngine'
import { ContextStore } from './FailureContext'
import { FlowController, select } from './FlowController'
import { aggregate, collectFailures } from './Metrics'
import { writeReport } from './Reporter'
import { RunLog } from './RunLog'
import { StepExecutor, absolute, withTimeout, type ExecutionContext } from './StepExecutor'
import { TargetResolver } from './TargetResolver'
import { assertScenario } from './validate'
import {
  DEFAULT_PLAYBACK,
  RUN_VERSION,
  type PlaybackHost,
  type PlaybackOptions,
  type ProgressHandler,
  type RunResult,
  type RunStatus,
  type Scenario,
  type ScenarioDefaults,
  type StepResult
} from './types'

export interface PlaybackEngineOptions {
  descriptors?: DescriptorStore | null
  options?: Partial<PlaybackOptions>
}

export class PlaybackEngine {
  private readonly log = new RunLog()
  private readonly contexts: ContextStore
  private readonly executor: StepExecutor
  private readonly flow: FlowController
  private readonly settings: Partial<PlaybackOptions>
  private lastRun: RunResult | null = null
  private running = false

  constructor(
    private readonly host: PlaybackHost,
    identity: IdentityService,
    config: PlaybackEngineOptions = {}
  ) {
    this.settings = config.options ?? {}
    this.contexts = new ContextStore(this.settings.contextDir ?? DEFAULT_PLAYBACK.contextDir)

    const resolver = new TargetResolver(identity, config.descriptors ?? null)
    this.executor = new StepExecutor(
      host,
      identity,
      resolver,
      new AssertionEngine(resolver),
      this.log,
      this.contexts
    )
    this.flow = new FlowController(this.executor, this.log)
  }

  isRunning(): boolean {
    return this.running
  }

  last(): RunResult | null {
    return this.lastRun
  }

  store(): ContextStore {
    return this.contexts
  }

  cancel(): void {
    if (this.running) this.flow.cancel()
  }

  async run(
    scenario: Scenario,
    overrides: Partial<PlaybackOptions> = {},
    onProgress?: ProgressHandler
  ): Promise<RunResult> {
    if (this.running) throw new Error('Kosum zaten suruyor')

    const checked = assertScenario(scenario)
    const options = this.merge(checked.defaults, overrides)
    const startedAt = Date.now()
    const runId = String(startedAt) + '-' + digest([checked.id, RUN_VERSION])

    this.running = true
    this.flow.reset()
    this.log.clear()
    this.executor.counters.scans = 0
    this.executor.counters.retries = 0

    this.log.push('info', '', 'Senaryo baslatildi: ' + checked.title, [
      'adim ' + checked.steps.length,
      'tarama seviyesi ' + options.scanLevel,
      'hata aninda ekran goruntusu ' + (options.screenshotOnFailure ? 'acik' : 'kapali')
    ])

    if (!this.contexts.enabled()) {
      this.log.push('warn', '', 'Baglam paketi dizini tanimsiz, hata paketleri saklanmayacak')
    }

    const ctx: ExecutionContext = { runId, scenario: checked, options, previous: null }
    let steps: StepResult[] = []
    let aborted = false
    let opened = ''

    try {
      opened = await this.preflight(checked, options)
      if (!opened) {
        const outcome = await this.flow.run(checked, ctx, onProgress)
        steps = outcome.steps
        aborted = outcome.aborted
      }
    } catch (error) {
      opened = error instanceof Error ? error.message : String(error)
    } finally {
      this.running = false
    }

    const finishedAt = Date.now()
    const metrics = aggregate(steps, this.executor.counters, finishedAt - startedAt)
    const failures = opened ? [opened, ...collectFailures(steps)] : collectFailures(steps)
    const status = resolveStatus(steps, failures, aborted, Boolean(opened))

    const run: RunResult = {
      id: runId,
      version: RUN_VERSION,
      scenarioId: checked.id,
      scenarioTitle: checked.title,
      scenarioVersion: checked.version,
      startedAt,
      finishedAt,
      status,
      ok: status === 'passed',
      steps,
      metrics,
      failures,
      log: this.log.all(),
      contexts: contextIds(steps)
    }

    this.log.push('info', '', 'Senaryo bitti: ' + status)
    run.log = this.log.all()
    this.lastRun = run

    if (options.reportDir) await writeReport(run, options.reportDir).catch(() => [])
    return run
  }

  private async preflight(scenario: Scenario, options: PlaybackOptions): Promise<string> {
    const selected = select(scenario.steps, options.only)
    if (!selected.length) return 'Kosulacak adim yok'
    if (!scenario.baseUrl) return ''
    if (selected[0]?.kind === 'navigate') return ''

    const outcome = await withTimeout(
      this.host.execute({ kind: 'navigate', url: absolute(scenario.baseUrl, scenario.baseUrl) }),
      options.stepTimeoutMs,
      'baslangic adresi zaman asimina ugradi'
    )

    if (outcome.ok) {
      this.log.push('info', '', 'Baslangic adresi acildi: ' + scenario.baseUrl)
      return ''
    }
    return 'Baslangic adresi acilamadi: ' + outcome.message
  }

  private merge(defaults: ScenarioDefaults, overrides: Partial<PlaybackOptions>): PlaybackOptions {
    return {
      ...DEFAULT_PLAYBACK,
      scanLevel: defaults.scanLevel,
      stepTimeoutMs: defaults.stepTimeoutMs,
      retries: defaults.retries,
      stopOnFailure: defaults.stopOnFailure,
      verifyState: defaults.verifyState,
      allowLowConfidence: defaults.allowLowConfidence,
      ...this.settings,
      ...overrides
    }
  }
}

function resolveStatus(
  steps: readonly StepResult[],
  failures: readonly string[],
  aborted: boolean,
  broken: boolean
): RunStatus {
  if (broken) return 'errored'
  if (aborted) return 'aborted'
  if (!steps.length) return 'errored'
  if (failures.length) return 'failed'
  return 'passed'
}

function contextIds(steps: readonly StepResult[]): string[] {
  const out: string[] = []
  for (const step of steps) {
    if (step.contextId) out.push(step.contextId)
    if (step.children.length) out.push(...contextIds(step.children))
  }
  return out
}
