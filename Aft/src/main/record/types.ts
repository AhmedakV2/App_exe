import type { ActionKind, InputMode } from '../action'
import type { ElementGraph, Rect, ScanLevel, ScanProfileName } from '../discovery'
import type { MatchState, QualityTier } from '../identity'
import type { AssertionKind, ScenarioStep, StepKind, StepTarget } from '../scenario'

export const RECORD_VERSION = 'record/1.0.0'

export type RawKind =
  | 'click'
  | 'double-click'
  | 'right-click'
  | 'hover'
  | 'input'
  | 'toggle'
  | 'select'
  | 'upload'
  | 'key'
  | 'scroll'
  | 'navigate'

export type RecordStatus = 'idle' | 'recording' | 'paused' | 'stopped'

export type StepOrigin = 'capture' | 'manual'

export type AdviceLevel = 'strong' | 'weak' | 'blocked'

export type NoticeLevel = 'info' | 'warn' | 'error'

export interface RawElement {
  tag: string
  type: string
  role: string
  elementId: string
  fieldName: string
  testAttribute: string
  testId: string
  label: string
  placeholder: string
  text: string
  value: string
  checked: boolean
  editable: boolean
  rect: Rect | null
}

export interface RawInteraction {
  seq: number
  kind: RawKind
  at: number
  url: string
  sessionId: string
  frameId: string
  backendNodeId: number
  element: RawElement | null
  text: string
  key: string
  optionValue: string
  optionLabel: string
  files: string[]
  deltaY: number
  dwellMs: number
  scrollY: number
  detail: number
}

export interface RecordIntent {
  kind: ActionKind
  raw: RawInteraction
  at: number
  text: string
  key: string
  url: string
  optionValue: string
  files: string[]
  deltaY: number
  waitMs: number
  needsElement: boolean
  optionalElement: boolean
  label: string
}

export interface TargetOption {
  id: string
  label: string
  detail: string
  matches: number
  unique: boolean
  score: number
  target: StepTarget
}

export interface StepAdvice {
  level: AdviceLevel
  score: number
  tier: QualityTier
  state: MatchState
  confidence: number
  ambiguous: boolean
  strategies: string[]
  reasons: string[]
  alternatives: TargetOption[]
}

export interface RecordedStep {
  id: string
  order: number
  at: number
  origin: StepOrigin
  kind: StepKind
  step: ScenarioStep
  advice: StepAdvice
  assertions: AssertionOption[]
  url: string
  frameDepth: number
  shadowDepth: number
  rect: Rect | null
  scanned: boolean
  sourceKey: string
}

export interface RecordNotice {
  at: number
  level: NoticeLevel
  stepId: string
  message: string
  detail: string[]
}

export interface RecordCounters {
  captured: number
  committed: number
  suppressed: number
  merged: number
  weak: number
  unresolved: number
  scans: number
}

export interface RecordOptions {
  scanLevel: ScanLevel
  highlight: boolean
  captureScroll: boolean
  captureKeys: boolean
  captureHover: boolean
  hoverDwellMs: number
  hoverMergeMs: number
  mergeTypingMs: number
  focusClickMs: number
  doubleClickMs: number
  navigateQuietMs: number
  scrollFollowMs: number
  scrollThreshold: number
  warmDelayMs: number
  stepTimeoutMs: number
  retries: number
  stopOnFailure: boolean
  verifyState: boolean
  inputMode: InputMode | null
}

export const DEFAULT_RECORD: RecordOptions = {
  scanLevel: 1,
  highlight: true,
  captureScroll: true,
  captureKeys: true,
  captureHover: true,
  hoverDwellMs: 650,
  hoverMergeMs: 1200,
  mergeTypingMs: 1600,
  focusClickMs: 2500,
  doubleClickMs: 700,
  navigateQuietMs: 3000,
  scrollFollowMs: 1500,
  scrollThreshold: 120,
  warmDelayMs: 420,
  stepTimeoutMs: 20000,
  retries: 1,
  stopOnFailure: true,
  verifyState: true,
  inputMode: null
}

export interface RecordSession {
  version: string
  id: string
  status: RecordStatus
  title: string
  description: string
  baseUrl: string
  startedAt: number
  updatedAt: number
  options: RecordOptions
  steps: RecordedStep[]
  notices: RecordNotice[]
  counters: RecordCounters
}

export interface HighlightMark {
  sessionId: string
  frameId: string
  rect: Rect | null
  label: string
  tone: AdviceLevel
}

export type RawSink = (batch: RawInteraction[]) => void

export interface RecordTuning {
  hoverDwellMs: number
}

export interface RecordHost {
  prepare?(): Promise<void>
  scan(level: ScanLevel, force: boolean, profile?: ScanProfileName): Promise<ElementGraph>
  currentGraph(): ElementGraph | null
  url(): string
  title(): string
  watch(sink: RawSink, tuning: RecordTuning): Promise<void>
  unwatch(): Promise<void>
  highlight(mark: HighlightMark): Promise<void>
  clearHighlight(): Promise<void>
}

export type EditKind =
  | 'remove'
  | 'move'
  | 'retitle'
  | 'text'
  | 'target'
  | 'wait'
  | 'assert'
  | 'timeout'
  | 'tolerate'
  | 'clear'

export interface AssertionSpec {
  kind: AssertionKind
  expected: string
  attribute: string
  count: number
  soft: boolean
}

export interface EditRequest {
  kind: EditKind
  stepId: string
  offset: number
  title: string
  text: string
  optionId: string
  timeoutMs: number
  flag: boolean
  assertion: AssertionSpec | null
}

export interface AssertionOption {
  id: string
  label: string
  detail: string
  spec: AssertionSpec
}

export interface ScenarioMeta {
  title: string
  description: string
  baseUrl: string
}
