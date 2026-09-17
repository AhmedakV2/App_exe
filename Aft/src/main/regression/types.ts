import type { ElementGraph } from '../discovery'
import type { ScanLevel } from '../discovery'

export const POOL_VERSION = 'regression/1.0.0'

export type CaseKind =
  'classic-html' | 'spa' | 'shadow-dom' | 'nested-iframe' | 'virtual-list' | 'multi-step-form'

export type CaseSource = 'frozen' | 'live'

export type CaseStatus = 'passed' | 'failed' | 'errored' | 'skipped'

export interface CaseExpectation {
  minInteractive: number
  maxInteractive: number
  minFrames: number
  minShadowRoots: number
  maxBlindSpots: number
  maxFramesFailed: number
}

export interface PoolCase {
  id: string
  title: string
  kind: CaseKind
  source: CaseSource
  location: string
  scanLevel: ScanLevel
  sampleSize: number
  timeoutMs: number
  expected: CaseExpectation
}

export interface CaseMetrics {
  nodes: number
  elements: number
  interactive: number
  inViewport: number
  shadowRoots: number
  frames: number
  framesFailed: number
  blindSpots: number
  falsePositives: number
  falsePositiveRate: number
  descriptorsCaptured: number
  resolvedExact: number
  resolvedLow: number
  resolvedMissing: number
  resolutionRate: number
  ambiguityRate: number
  meanConfidence: number
  meanQuality: number
  discoveryMs: number
  resolveMs: number
  totalMs: number
  validationErrors: number
  validationWarnings: number
}

export interface CaseResult {
  caseId: string
  kind: CaseKind
  status: CaseStatus
  failures: string[]
  metrics: CaseMetrics
  startedAt: number
  finishedAt: number
}

export interface PoolMetrics {
  cases: number
  passed: number
  failed: number
  errored: number
  interactive: number
  falsePositiveRate: number
  resolutionRate: number
  ambiguityRate: number
  meanConfidence: number
  meanQuality: number
  discoveryMsMean: number
  discoveryMsP95: number
  totalMs: number
}

export interface Thresholds {
  minResolutionRate: number
  maxFalsePositiveRate: number
  maxAmbiguityRate: number
  maxDiscoveryMsP95: number
  maxRegressionDelta: number
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  minResolutionRate: 0.92,
  maxFalsePositiveRate: 0.05,
  maxAmbiguityRate: 0.08,
  maxDiscoveryMsP95: 4000,
  maxRegressionDelta: 0.03
}

export interface Baseline {
  version: string
  createdAt: number
  thresholds: Thresholds
  cases: Record<string, CaseMetrics>
}

export interface BaselineDelta {
  caseId: string
  field: keyof CaseMetrics
  before: number
  after: number
  delta: number
  regressed: boolean
}

export interface BaselineComparison {
  baselineAt: number
  deltas: BaselineDelta[]
  regressions: number
}

export interface PoolRun {
  id: string
  version: string
  startedAt: number
  finishedAt: number
  ok: boolean
  cases: CaseResult[]
  metrics: PoolMetrics
  comparison: BaselineComparison | null
  failures: string[]
}

export interface Harness {
  urlOf(location: string): string
  goto(url: string, timeoutMs: number): Promise<void>
  scan(level: ScanLevel): Promise<ElementGraph>
  reset(): Promise<void>
  dispose(): Promise<void>
}

export interface RunOptions {
  thresholds: Thresholds
  kinds: CaseKind[]
  only: string[]
  updateBaseline: boolean
  stopOnFailure: boolean
}

export const DEFAULT_RUN: RunOptions = {
  thresholds: DEFAULT_THRESHOLDS,
  kinds: [],
  only: [],
  updateBaseline: false,
  stopOnFailure: false
}
