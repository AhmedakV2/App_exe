import type { Rect, ScanLevel } from '../discovery'
import type { OcclusionState } from '../model'

export const DESCRIPTOR_VERSION = 'descriptor/1.0.0'

export const SUPPORTED_DESCRIPTOR_VERSIONS: readonly string[] = ['descriptor/1.0.0']

export type StrategyKind =
  | 'test-attribute'
  | 'element-id'
  | 'form-field'
  | 'accessible-name'
  | 'text'
  | 'structure'
  | 'neighborhood'

export type MatchState = 'exact' | 'low-confidence' | 'not-found'

export type QualityTier = 'strong' | 'fair' | 'weak'

export type HealingDecision = 'auto' | 'approval' | 'blocked'

export interface StrategyPayload {
  kind: StrategyKind
  value: string
  parts: Record<string, string>
  weight: number
  dynamic: boolean
}

export interface DescriptorTarget {
  tag: string
  role: string
  type: string
  name: string
}

export interface DescriptorContext {
  urlPattern: string
  framePath: string[]
  frameDepth: number
  crossOrigin: boolean
  shadowHosts: string[]
  shadowDepth: number
  ancestorSignature: string
  neighborSignature: string
  formSignature: string
  siblingIndex: number
  typeOrdinal: number
  rect: Rect | null
  viewport: { width: number; height: number }
}

export interface CaptureConditions {
  capturedAt: number
  url: string
  title: string
  scanLevel: ScanLevel
  modelVersion: string
  sourceVersion: string
  inViewport: boolean
  occlusion: OcclusionState
  editable: boolean
}

export interface DescriptorQuality {
  score: number
  tier: QualityTier
  reasons: string[]
}

export interface Descriptor {
  version: string
  id: string
  target: DescriptorTarget
  strategies: StrategyPayload[]
  context: DescriptorContext
  capture: CaptureConditions
  quality: DescriptorQuality
}

export interface StrategyTrace {
  kind: StrategyKind
  weight: number
  matched: number
  skipped: boolean
  reason: string
  durationMs: number
}

export interface ResolvedCandidate {
  ref: string
  ordinal: number
  score: number
  voteScore: number
  contextScore: number
  geometryScore: number
  votes: StrategyKind[]
}

export interface Resolution {
  descriptorId: string
  state: MatchState
  confidence: number
  ambiguous: boolean
  candidate: ResolvedCandidate | null
  runnerUp: ResolvedCandidate | null
  candidates: ResolvedCandidate[]
  trace: StrategyTrace[]
  durationMs: number
  message: string
}

export interface HealingProposal {
  descriptorId: string
  decision: HealingDecision
  confidence: number
  createdAt: number
  previous: Descriptor
  next: Descriptor
  gained: StrategyKind[]
  lost: StrategyKind[]
  reason: string
}

export interface StrategyStat {
  attempts: number
  hits: number
  weightedSuccess: number
  lastSeenAt: number
}

export interface ResolveOptions {
  exactThreshold: number
  lowThreshold: number
  ambiguityMargin: number
  maxCandidates: number
  requireContext: boolean
  useHistory: boolean
}

export const DEFAULT_RESOLVE: ResolveOptions = {
  exactThreshold: 0.82,
  lowThreshold: 0.45,
  ambiguityMargin: 0.08,
  maxCandidates: 8,
  requireContext: true,
  useHistory: true
}
