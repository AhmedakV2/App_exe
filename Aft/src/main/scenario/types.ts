import type { ActionKind, ActionOutcome, ActionRequest, InputMode } from '../action'
import type {
  BlindSpot,
  CoverageSummary,
  ElementGraph,
  Rect,
  ScanLevel,
  ScanProfileName
} from '../discovery'
import type {
  Descriptor,
  MatchState,
  ResolvedCandidate,
  StrategyKind,
  StrategyTrace
} from '../identity'

export const SCENARIO_VERSION = 'scenario/1.0.0'

export const SUPPORTED_SCENARIO_VERSIONS: readonly string[] = ['scenario/1.0.0']

export const RUN_VERSION = 'playbackrun/1.0.0'

export const CONTEXT_VERSION = 'failurecontext/1.0.0'

export type StepKind = ActionKind | 'assert' | 'group'

export type StepStatus = 'passed' | 'failed' | 'skipped' | 'errored'

export type RunStatus = 'passed' | 'failed' | 'errored' | 'aborted'

export type TargetKind = 'descriptor' | 'inline-descriptor' | 'query' | 'ordinal'

export type QueryKind = 'test-id' | 'element-id' | 'field-name' | 'accessible-name' | 'text'

export const QUERY_KINDS: readonly QueryKind[] = [
  'test-id',
  'element-id',
  'field-name',
  'accessible-name',
  'text'
]

export const QUERY_STRATEGY: Record<QueryKind, StrategyKind> = {
  'test-id': 'test-attribute',
  'element-id': 'element-id',
  'field-name': 'form-field',
  'accessible-name': 'accessible-name',
  text: 'text'
}

export type AssertionKind =
  | 'element-exists'
  | 'element-absent'
  | 'element-visible'
  | 'element-enabled'
  | 'element-checked'
  | 'element-count'
  | 'text-equals'
  | 'text-contains'
  | 'value-equals'
  | 'attribute-equals'
  | 'url-matches'
  | 'title-contains'

export type ConditionKind =
  'always' | 'previous-passed' | 'previous-failed' | 'assertion-passes' | 'assertion-fails'

export type LogLevel = 'info' | 'step' | 'resolve' | 'assert' | 'state' | 'warn' | 'error'

export const ELEMENT_STEP_KINDS: readonly StepKind[] = [
  'click',
  'double-click',
  'right-click',
  'hover',
  'type',
  'clear-type',
  'select-option',
  'upload'
]

export const STEP_KINDS: readonly StepKind[] = [
  'click',
  'double-click',
  'right-click',
  'hover',
  'type',
  'clear-type',
  'press-key',
  'scroll',
  'select-option',
  'upload',
  'navigate',
  'wait',
  'assert',
  'group'
]

export const ASSERTION_KINDS: readonly AssertionKind[] = [
  'element-exists',
  'element-absent',
  'element-visible',
  'element-enabled',
  'element-checked',
  'element-count',
  'text-equals',
  'text-contains',
  'value-equals',
  'attribute-equals',
  'url-matches',
  'title-contains'
]

export const ELEMENT_ASSERTION_KINDS: readonly AssertionKind[] = [
  'element-exists',
  'element-absent',
  'element-visible',
  'element-enabled',
  'element-checked',
  'element-count',
  'text-equals',
  'text-contains',
  'value-equals',
  'attribute-equals'
]

export interface StepQuery {
  kind: QueryKind
  value: string
  attribute: string
  tag: string
  role: string
  nth: number
}

export interface StepTarget {
  kind: TargetKind
  label: string
  descriptorId: string
  descriptor: Descriptor | null
  query: StepQuery | null
  ordinal: number
}

export interface Assertion {
  kind: AssertionKind
  target: StepTarget | null
  expected: string
  attribute: string
  count: number
  soft: boolean
  message: string
}

export interface StepCondition {
  kind: ConditionKind
  assertion: Assertion | null
}

export interface ExpectedState {
  urlPattern: string
  titlePattern: string
  minInteractive: number
  maxBlindSpots: number
  scanLevel: ScanLevel
}

export interface ScenarioStep {
  id: string
  kind: StepKind
  title: string
  target: StepTarget | null
  assertion: Assertion | null
  condition: StepCondition | null
  steps: ScenarioStep[]
  text: string
  key: string
  url: string
  deltaY: number
  optionValue: string
  files: string[]
  timeoutMs: number
  retries: number
  scanLevel: ScanLevel | null
  mode: InputMode | null
  continueOnFailure: boolean
  allowLowConfidence: boolean
  expectState: ExpectedState | null
}

export interface ScenarioDefaults {
  scanLevel: ScanLevel
  stepTimeoutMs: number
  retries: number
  stopOnFailure: boolean
  verifyState: boolean
  allowLowConfidence: boolean
}

export const DEFAULT_DEFAULTS: ScenarioDefaults = {
  scanLevel: 1,
  stepTimeoutMs: 20000,
  retries: 1,
  stopOnFailure: true,
  verifyState: true,
  allowLowConfidence: false
}

export interface Scenario {
  version: string
  id: string
  title: string
  description: string
  baseUrl: string
  createdAt: number
  updatedAt: number
  defaults: ScenarioDefaults
  steps: ScenarioStep[]
}

export interface ScenarioIssue {
  path: string
  message: string
}

export interface ScenarioReport {
  ok: boolean
  errors: ScenarioIssue[]
  warnings: ScenarioIssue[]
}

export interface ResolutionRecord {
  descriptorId: string
  state: MatchState
  confidence: number
  ambiguous: boolean
  healed: boolean
  quality: number
  ref: string
  ordinal: number
  winners: string[]
  trace: StrategyTrace[]
  candidates: ResolvedCandidate[]
  durationMs: number
  message: string
}

export interface AssertionRecord {
  kind: AssertionKind
  target: string
  expected: string
  actual: string
  passed: boolean
  soft: boolean
  message: string
}

export interface StateCheck {
  ok: boolean
  expected: ExpectedState
  url: string
  title: string
  interactive: number
  blindSpots: number
  scanLevel: ScanLevel
  reasons: string[]
}

export interface StepResult {
  stepId: string
  index: number
  kind: StepKind
  title: string
  status: StepStatus
  message: string
  attempts: number
  startedAt: number
  finishedAt: number
  durationMs: number
  scanned: boolean
  resolution: ResolutionRecord | null
  assertions: AssertionRecord[]
  outcome: ActionOutcome | null
  stateCheck: StateCheck | null
  contextId: string
  children: StepResult[]
}

export interface RunMetrics {
  steps: number
  executed: number
  passed: number
  failed: number
  skipped: number
  errored: number
  assertions: number
  assertionsFailed: number
  resolutions: number
  resolvedExact: number
  resolvedLow: number
  resolvedMissing: number
  meanConfidence: number
  scans: number
  retries: number
  totalMs: number
}

export interface LogEntry {
  at: number
  level: LogLevel
  stepId: string
  message: string
  detail: string[]
}

export interface RunResult {
  id: string
  version: string
  scenarioId: string
  scenarioTitle: string
  scenarioVersion: string
  startedAt: number
  finishedAt: number
  status: RunStatus
  ok: boolean
  steps: StepResult[]
  metrics: RunMetrics
  failures: string[]
  log: LogEntry[]
  contexts: string[]
}

export interface PlaybackOptions {
  scanLevel: ScanLevel
  prepareTimeoutMs: number
  stepTimeoutMs: number
  retries: number
  stopOnFailure: boolean
  verifyState: boolean
  allowLowConfidence: boolean
  inputMode: InputMode | null
  screenshotOnFailure: boolean
  contextDir: string
  reportDir: string
  only: string[]
}

export const DEFAULT_PLAYBACK: PlaybackOptions = {
  scanLevel: 1,
  prepareTimeoutMs: 120000,
  stepTimeoutMs: 20000,
  retries: 1,
  stopOnFailure: true,
  verifyState: true,
  allowLowConfidence: false,
  inputMode: null,
  screenshotOnFailure: false,
  contextDir: '',
  reportDir: '',
  only: []
}

export interface ElementDump {
  ordinal: number
  ref: string
  tag: string
  role: string
  name: string
  text: string
  rect: Rect | null
  visible: boolean
  interactive: boolean
}

export interface FailureContext {
  version: string
  id: string
  runId: string
  scenarioId: string
  stepId: string
  stepTitle: string
  capturedAt: number
  url: string
  title: string
  scanLevel: ScanLevel
  coverage: CoverageSummary | null
  blindSpots: BlindSpot[]
  elements: ElementDump[]
  resolution: ResolutionRecord | null
  assertions: AssertionRecord[]
  stateCheck: StateCheck | null
  outcome: ActionOutcome | null
  message: string
  screenshot: string
}

export interface StoredContext {
  id: string
  bytes: number
  capturedAt: number
}

export interface PlaybackHost {
  prepare?(): Promise<void>
  execute(request: ActionRequest): Promise<ActionOutcome>
  scan(level: ScanLevel, force: boolean, profile?: ScanProfileName): Promise<ElementGraph>
  currentGraph(): ElementGraph | null
  screenshot(): Promise<string>
}

export type ProgressHandler = (done: number, total: number, result: StepResult) => void
