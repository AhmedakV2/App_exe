import type {
  FailureContext,
  PlaybackOptions,
  RunResult,
  Scenario,
  ScenarioReport,
  StepResult,
  StoredContext
} from '../scenario/types'
import type { ScenarioEntry, ScenarioFolder } from '../scenario/ScenarioStore'

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
  | 'aft:playback:move'
  | 'aft:playback:folder-add'
  | 'aft:playback:folder-rename'
  | 'aft:playback:folder-remove'

export const PLAYBACK_PROGRESS_EVENT = 'aft:playback:progress'

export interface ScenarioPayload {
  scenario: Scenario
  report: ScenarioReport
}

export interface ScenarioListPayload {
  entries: ScenarioEntry[]
  folders: ScenarioFolder[]
}

export interface ScenarioSaveRequest {
  scenario: unknown
  folder: string | null
}

export interface ScenarioMoveRequest {
  scenarioId: string
  folder: string
}

export interface FolderAddRequest {
  parentId: string
  name: string
}

export interface FolderRenameRequest {
  id: string
  name: string
}

export interface FolderPayload {
  folder: ScenarioFolder
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
