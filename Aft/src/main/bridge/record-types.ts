import type {
  AdviceLevel,
  AssertionOption,
  EditRequest,
  RecordCounters,
  RecordNotice,
  RecordOptions,
  RecordStatus,
  ScenarioMeta,
  StepOrigin
} from '../record/types'
import type { QualityTier } from '../identity/types'
import type { Scenario, ScenarioReport, StepKind, TargetKind } from '../scenario/types'
import type { ScenarioEntry } from '../scenario/ScenarioStore'

export type RecordChannelName =
  | 'aft:record:start'
  | 'aft:record:stop'
  | 'aft:record:pause'
  | 'aft:record:resume'
  | 'aft:record:state'
  | 'aft:record:edit'
  | 'aft:record:describe'
  | 'aft:record:options'
  | 'aft:record:save'
  | 'aft:record:discard'

export const RECORD_UPDATE_EVENT = 'aft:record:update'

export const RECORD_NOTICE_EVENT = 'aft:record:notice'

export interface AlternativeView {
  id: string
  label: string
  detail: string
  matches: number
  unique: boolean
}

export interface RecordStepView {
  id: string
  order: number
  kind: StepKind
  title: string
  origin: StepOrigin
  targetKind: TargetKind | 'none'
  targetLabel: string
  level: AdviceLevel
  tier: QualityTier
  score: number
  confidence: number
  ambiguous: boolean
  strategies: string[]
  reasons: string[]
  alternatives: AlternativeView[]
  assertions: AssertionOption[]
  value: string
  valueLabel: string
  editable: boolean
  waitMs: number
  timeoutMs: number
  continueOnFailure: boolean
  url: string
  frameDepth: number
  shadowDepth: number
}

export interface RecordView {
  id: string
  status: RecordStatus
  title: string
  description: string
  baseUrl: string
  startedAt: number
  updatedAt: number
  options: RecordOptions
  counters: RecordCounters
  steps: RecordStepView[]
  notices: RecordNotice[]
  report: ScenarioReport | null
}

export interface StartRequest {
  options: Partial<RecordOptions>
}

export interface SaveRequest {
  meta: Partial<ScenarioMeta>
  keepSession: boolean
}

export interface SavePayload {
  scenario: Scenario
  report: ScenarioReport
  file: string
  entries: ScenarioEntry[]
}

export interface EditPayload {
  ok: boolean
  message: string
  stepId: string
  view: RecordView
}

export type RecordEditRequest = Partial<EditRequest>
