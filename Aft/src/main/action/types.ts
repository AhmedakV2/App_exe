import type { Point, Rect } from '../discovery'

export type ActionKind =
  | 'click'
  | 'double-click'
  | 'right-click'
  | 'hover'
  | 'type'
  | 'clear-type'
  | 'press-key'
  | 'scroll'
  | 'select-option'
  | 'upload'
  | 'navigate'
  | 'wait'

export type ActionErrorCode =
  | 'element-not-found'
  | 'element-ambiguous'
  | 'element-not-ready'
  | 'page-not-loaded'
  | 'navigation-failed'
  | 'dialog-blocked'
  | 'timeout'
  | 'protocol-error'
  | 'not-supported'
  | 'invalid-request'

export type InputMode = 'real-input' | 'direct-call'

export type DialogPolicy = 'accept' | 'dismiss'

export type NavigationKind = 'none' | 'document' | 'in-document'

export interface ActionabilityReport {
  ready: boolean
  visible: boolean
  enabled: boolean
  stable: boolean
  unobstructed: boolean
  animationSettled: boolean
  attempts: number
  waitedMs: number
  rect: Rect | null
  point: Point | null
  reason: string
}

export interface NavigationReport {
  kind: NavigationKind
  url: string
  lifecycleMs: number
  networkIdle: boolean
  timedOut: boolean
}

export interface DialogRecord {
  type: string
  message: string
  policy: DialogPolicy
  promptText: string
  handledAt: number
}

export interface DownloadRecord {
  guid: string
  url: string
  fileName: string
  state: string
  updatedAt: number
}

export interface ActionRequest {
  kind: ActionKind
  ref?: string
  ordinal?: number
  descriptorId?: string
  text?: string
  key?: string
  url?: string
  deltaY?: number
  optionValue?: string
  files?: string[]
  timeoutMs?: number
  force?: boolean
  mode?: InputMode
}

export interface ActionTarget {
  ref: string
  ordinal: number
  sessionId: string
  backendNodeId: number
  frameId: string
  tag: string
  confidence: number
}

export interface ActionOutcome {
  ok: boolean
  kind: ActionKind
  target: ActionTarget | null
  mode: InputMode | null
  message: string
  code: ActionErrorCode | null
  actionability: ActionabilityReport | null
  navigation: NavigationReport | null
  dialogs: DialogRecord[]
  downloads: DownloadRecord[]
  durationMs: number
}

export interface ActionabilityOptions {
  timeoutMs: number
  pollMs: number
  stableSamples: number
  stableTolerance: number
  requireUnobstructed: boolean
  requireAnimationSettled: boolean
  scrollIntoView: boolean
}

export const DEFAULT_ACTIONABILITY: ActionabilityOptions = {
  timeoutMs: 8000,
  pollMs: 90,
  stableSamples: 2,
  stableTolerance: 1,
  requireUnobstructed: true,
  requireAnimationSettled: true,
  scrollIntoView: true
}

export interface NavigationOptions {
  lifecycleTimeoutMs: number
  networkIdleMs: number
  networkTimeoutMs: number
  inDocumentGraceMs: number
}

export const DEFAULT_NAVIGATION: NavigationOptions = {
  lifecycleTimeoutMs: 15000,
  networkIdleMs: 500,
  networkTimeoutMs: 8000,
  inDocumentGraceMs: 350
}

export interface ActionOptions {
  actionability: ActionabilityOptions
  navigation: NavigationOptions
  dialogPolicy: DialogPolicy
  promptText: string
  downloadPath: string
  typeDelayMs: number
  fallbackToDirect: boolean
}

export const DEFAULT_ACTION: ActionOptions = {
  actionability: DEFAULT_ACTIONABILITY,
  navigation: DEFAULT_NAVIGATION,
  dialogPolicy: 'accept',
  promptText: '',
  downloadPath: '',
  typeDelayMs: 18,
  fallbackToDirect: true
}
