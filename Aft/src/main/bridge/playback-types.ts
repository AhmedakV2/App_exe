import type {
  FailureContext,
  PlaybackOptions,
  RunResult,
  Scenario,
  ScenarioEntry,
  ScenarioReport,
  StepResult,
  StoredContext
} from '../scenario'

export type PlaybackChannelName =
  | 'aft:playback:list'
  | 'aft:playback:get'
  | 'aft:playback:save'
  | 'aft:playback:remove'
  | 'aft:playback:validate'
  | 'aft:playback:run'
  | 'aft:playback:cancel'
  | 'aft:playback:last'
  | 'aft:playback:contexts'
  | 'aft:playback:context'

export const PLAYBACK_PROGRESS_EVENT = 'aft:playback:progress'

export interface ScenarioPayload {
  scenario: Scenario
  report: ScenarioReport
}

export interface ScenarioListPayload {
  entries: ScenarioEntry[]
}

export interface RunRequest {
  scenarioId: string
  scenario: unknown
  options: Partial<PlaybackOptions>
}

export interface RunPayload {
  run: RunResult
  reports: string[]
}

export interface ProgressPayload {
  done: number
  total: number
  step: StepResult
}

export interface ContextListPayload {
  contexts: StoredContext[]
}

export interface ContextPayload {
  context: FailureContext
}
