import type { AgentConfig } from '../api/config'
import type { DeviceInfo, Profile } from '../api/ApiClient'
import type { SessionState } from '../api/AuthStore'
import type { ToolInvocation } from '../api'

export type ApiChannelName =
  | 'aft:api:state'
  | 'aft:api:config'
  | 'aft:api:save-config'
  | 'aft:api:login'
  | 'aft:api:logout'
  | 'aft:api:connect'
  | 'aft:api:disconnect'
  | 'aft:api:approve'

export interface AgentState {
  session: SessionState
  connected: boolean
  device: DeviceInfo | null
  capabilities: string[]
}

export interface LoginPayload {
  profile: Profile
  state: AgentState
}

export interface ConfigPayload {
  config: AgentConfig
}

export interface ApprovalRequest {
  callId: string
  toolName: string
  summary: string
}

export type { AgentConfig, ToolInvocation }
