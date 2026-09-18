import type { PlaybackOptions, RunResult, Scenario } from '../scenario'

export interface PlaybackRunInput {
  scenarioId?: string
  scenario?: Scenario
  options?: Partial<PlaybackOptions>
}

export interface PlaybackRunOutput {
  run: RunResult
  reports: string[]
}

export interface PlaybackAccess {
  execute(input: PlaybackRunInput): Promise<PlaybackRunOutput>
  abort(): boolean
  lastRun(): RunResult | null
  running(): boolean
}

export interface ToolInvocation {
  callId: string
  sessionId: string
  toolName: string
  argumentsJson: string
  approvalRequired: boolean
  timeoutMs: number
}

export interface ToolResult {
  callId: string
  ok: boolean
  contentJson: string | null
  error: string | null
  truncated: boolean
}

export interface AgentConfig {
  orgId: string
  deviceKey: string
  streamPreferred: boolean
  requestTimeoutMs: number
}

export interface SessionState {
  signedIn: boolean
  username: string
  email: string
  displayName: string
  expiresAt: number
}

export interface Profile {
  id: string
  username: string
  email: string
  displayName: string
  locale: string
  mfaEnabled: boolean
  roles: string[]
  organizations: { id: string; name: string; slug: string }[]
}

export interface DeviceInfo {
  id: string
  orgId: string
  hostname: string
  os: string
  appVersion: string
  status: string
  lastSeenAt: string | null
}

export interface DeviceProvision {
  orgId: string
  deviceKey: string
  device: DeviceInfo
}

export interface AgentEndpoint {
  baseUrl: string
  deviceId: string
  deviceKey: string
  ticket: () => Promise<string>
}

export type ApprovalGate = (invocation: ToolInvocation) => Promise<boolean>

export type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>

export const MAX_RESULT_BYTES = 256 * 1024

export function ok(callId: string, payload: unknown, truncated: boolean): ToolResult {
  return { callId, ok: true, contentJson: JSON.stringify(payload), error: null, truncated }
}

export function fail(callId: string, error: string): ToolResult {
  return { callId, ok: false, contentJson: null, error, truncated: false }
}
