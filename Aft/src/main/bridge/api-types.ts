import type { DeviceInfo, Profile, SessionState, ToolInvocation } from '../api/types'

export type ApiChannelName =
  | 'aft:api:state'
  | 'aft:agent:chat'
  | 'aft:agent:send'
  | 'aft:agent:cancel'
  | 'aft:agent:reset'
  | 'aft:agent:remove'
  | 'aft:api:login'
  | 'aft:api:logout'
  | 'aft:api:connect'
  | 'aft:api:disconnect'
  | 'aft:api:approve'
  | 'aft:api:register'
  | 'aft:api:profile'
  | 'aft:api:change-password'

export interface AgentState {
  session: SessionState
  connected: boolean
  orgId: string
  device: DeviceInfo | null
  capabilities: string[]
}

export interface LoginPayload {
  profile: Profile
  state: AgentState
}

export interface ProfilePayload {
  profile: Profile
}

export interface ApprovalRequest {
  callId: string
  toolName: string
  summary: string
}

export type { AgentChatState, AgentLogEntry, AgentLogLevel, ChatTurn } from '../api/agent-types'

export type { ToolInvocation }
