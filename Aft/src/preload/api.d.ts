import type { ChannelResult } from '../main/bridge'
import type {
  AgentConfig,
  AgentState,
  ApprovalRequest,
  ConfigPayload,
  LoginPayload
} from '../main/bridge'

declare global {
  interface Window {
    aftApi: {
      state: () => Promise<ChannelResult<AgentState>>
      config: () => Promise<ChannelResult<ConfigPayload>>
      saveConfig: (patch: Partial<AgentConfig>) => Promise<ChannelResult<ConfigPayload>>
      login: (input: { email: string; password: string }) => Promise<ChannelResult<LoginPayload>>
      logout: () => Promise<ChannelResult<AgentState>>
      connect: () => Promise<ChannelResult<AgentState>>
      disconnect: () => Promise<ChannelResult<AgentState>>
      approve: (callId: string, approved: boolean) => Promise<ChannelResult<boolean>>
      onApproval: (fn: (request: ApprovalRequest) => void) => () => void
      onStateChanged: (fn: (state: AgentState) => void) => () => void
    }
  }
}

export {}
