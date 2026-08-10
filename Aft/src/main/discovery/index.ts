export { DiscoveryEngine } from './DiscoveryEngine'
export { ElementGraph } from './ElementGraph'
export { Transport, ProtocolError } from './Transport'
export { StabilityWaiter, delay } from './StabilityWaiter'
export { FrameRegistry, type FrameRecord } from './FrameRegistry'
export { captureSession, type DocSnap, type DocNode, type SessionSnap } from './SnapshotCollector'
export { collectAx, type AxMap } from './AxCollector'
export { buildGraph, detectBlindSpots, type BuildResult } from './GraphBuilder'
export {
  OcclusionIndex,
  applyGeometry,
  applyInteractivity,
  applyOcclusion,
  ambiguous,
  probeListeners
} from './Classify'
export * from './types'
