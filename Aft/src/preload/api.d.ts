import type { ChannelResult } from '../main/bridge/types'
import type {
  AgentChatState,
  AgentLogEntry,
  AgentState,
  ChatSummary,
  ModelTierDto,
  ApprovalRequest,
  LoginPayload,
  ProfilePayload
} from '../main/bridge/api-types'

declare global {
  interface Window {
    aftApi: {
      state: () => Promise<ChannelResult<AgentState>>
      login: (input: { username: string; password: string }) => Promise<ChannelResult<LoginPayload>>
      register: (input: {
        username: string
        email: string
        password: string
        displayName: string
      }) => Promise<ChannelResult<LoginPayload>>
      logout: () => Promise<ChannelResult<AgentState>>
      profile: () => Promise<ChannelResult<ProfilePayload>>
      changePassword: (input: {
        currentPassword: string
        newPassword: string
      }) => Promise<ChannelResult<boolean>>
      connect: () => Promise<ChannelResult<AgentState>>
      disconnect: () => Promise<ChannelResult<AgentState>>
      approve: (callId: string, approved: boolean) => Promise<ChannelResult<boolean>>
      chat: () => Promise<ChannelResult<AgentChatState>>
      ask: (content: string) => Promise<ChannelResult<AgentChatState>>
      cancelAsk: () => Promise<ChannelResult<boolean>>
      newChat: () => Promise<ChannelResult<AgentChatState>>
      removeChat: () => Promise<ChannelResult<AgentChatState>>
      selectModel: (model: string) => Promise<ChannelResult<AgentChatState>>
      chatHistory: () => Promise<ChannelResult<ChatSummary[]>>
      openChat: (id: string) => Promise<ChannelResult<AgentChatState>>
      deleteChat: (id: string) => Promise<ChannelResult<ChatSummary[]>>
      onChat: (fn: (state: AgentChatState) => void) => () => void
      onAgentLog: (fn: (entry: AgentLogEntry) => void) => () => void
      gateDone: () => void
      quit: () => void
      onApproval: (fn: (request: ApprovalRequest) => void) => () => void
      onStateChanged: (fn: (state: AgentState) => void) => () => void
    }
  }
}

export {}
