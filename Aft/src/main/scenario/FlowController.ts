import type { RunLog } from './RunLog'
import type { ExecutionContext, StepExecutor } from './StepExecutor'
import type { ProgressHandler, Scenario, ScenarioStep, StepResult } from './types'

interface FlowState {
  order: number
  done: number
  total: number
  stop: boolean
  onProgress: ProgressHandler | undefined
}

export interface FlowOutcome {
  steps: StepResult[]
  aborted: boolean
}

export class FlowController {
  private cancelled = false

  constructor(
    private readonly executor: StepExecutor,
    private readonly log: RunLog
  ) {}

  cancel(): void {
    this.cancelled = true
  }

  reset(): void {
    this.cancelled = false
  }

  async run(
    scenario: Scenario,
    ctx: ExecutionContext,
    onProgress?: ProgressHandler
  ): Promise<FlowOutcome> {
    const selected = select(scenario.steps, ctx.options.only)
    const state: FlowState = {
      order: 0,
      done: 0,
      total: count(selected),
      stop: false,
      onProgress
    }
    const steps = await this.sequence(selected, ctx, state)

    return { steps, aborted: this.cancelled }
  }

  private async sequence(
    steps: readonly ScenarioStep[],
    ctx: ExecutionContext,
    state: FlowState
  ): Promise<StepResult[]> {
    const results: StepResult[] = []

    for (const step of steps) {
      if (this.cancelled) {
        results.push(this.skip(step, ctx, state, 'kosum iptal edildi'))
        continue
      }
      if (state.stop) {
        results.push(this.skip(step, ctx, state, 'onceki adim basarisiz'))
        continue
      }

      const check = await this.executor.condition(step, ctx)
      if (!check.run) {
        results.push(this.skip(step, ctx, state, check.reason))
        continue
      }

      const result =
        step.kind === 'group'
          ? await this.group(step, ctx, state)
          : await this.executor.run(step, state.order++, ctx)

      results.push(result)
      ctx.previous = result
      this.report(state, result)

      if (result.status === 'passed' || step.continueOnFailure) continue
      if (ctx.options.stopOnFailure) state.stop = true
    }

    return results
  }

  private async group(
    step: ScenarioStep,
    ctx: ExecutionContext,
    state: FlowState
  ): Promise<StepResult> {
    const startedAt = Date.now()
    const index = state.order++

    this.log.push('step', step.id, 'Grup: ' + step.title)

    const inner: FlowState = { ...state, stop: false }
    const children = await this.sequence(step.steps, ctx, inner)

    state.order = inner.order
    state.done = inner.done
    if (inner.stop && !step.continueOnFailure) state.stop = true

    const failed = children.filter(
      (child) => child.status === 'failed' || child.status === 'errored'
    )

    return {
      stepId: step.id,
      index,
      kind: 'group',
      title: step.title,
      status: failed.length ? 'failed' : 'passed',
      message: failed.length ? 'grup icinde ' + failed.length + ' adim basarisiz' : 'grup tamam',
      attempts: 1,
      startedAt,
      finishedAt: Date.now(),
      durationMs: Date.now() - startedAt,
      scanned: false,
      resolution: null,
      assertions: [],
      outcome: null,
      stateCheck: null,
      contextId: '',
      children
    }
  }

  private skip(
    step: ScenarioStep,
    ctx: ExecutionContext,
    state: FlowState,
    reason: string
  ): StepResult {
    const result = this.executor.skipped(step, state.order++, reason)
    ctx.previous = result
    this.report(state, result)

    if (step.steps.length) {
      for (const child of step.steps) {
        result.children.push(this.skip(child, ctx, state, reason))
      }
    }
    return result
  }

  private report(state: FlowState, result: StepResult): void {
    state.done++
    state.onProgress?.(state.done, state.total, result)
  }
}

export function select(steps: readonly ScenarioStep[], only: readonly string[]): ScenarioStep[] {
  if (!only.length) return steps.slice()
  return steps.filter((step) => only.includes(step.id))
}

export function count(steps: readonly ScenarioStep[]): number {
  return steps.reduce((total, step) => total + 1 + count(step.steps), 0)
}

export function flatten(steps: readonly StepResult[]): StepResult[] {
  const out: StepResult[] = []
  for (const step of steps) {
    out.push(step)
    if (step.children.length) out.push(...flatten(step.children))
  }
  return out
}
