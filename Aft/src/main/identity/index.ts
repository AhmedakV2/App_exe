export * from './types'
export {
  isDynamicValue,
  isStableIdentifier,
  isVolatileAttribute,
  isMeaningfulText,
  stableClasses,
  normalizeText,
  entropy
} from './dynamic'
export {
  structuralPath,
  ancestorSignature,
  neighborSignature,
  nearestLabel,
  formSignature,
  urlPattern,
  stableAnchor,
  labelOf
} from './signature'
export { STRATEGY_CHAIN, STRATEGY_WEIGHTS, strategyByKind, type Strategy } from './strategies'
export { DescriptorBuilder, scopeOf } from './DescriptorBuilder'
export { HistoryStore } from './HistoryStore'
export { DescriptorStore, type DescriptorSummary } from './DescriptorStore'
export {
  combine,
  contextScore,
  geometryScore,
  qualityOf,
  resolveState,
  describeState
} from './Scoring'
export { Resolver, DescriptorVersionError } from './Resolver'
export { Healer, DEFAULT_HEALING, type HealingPolicy } from './Healing'
export {
  IdentityService,
  type IdentityOptions,
  type CaptureResult,
  type ResolveResult
} from './IdentityService'
