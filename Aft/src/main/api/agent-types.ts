export type AgentRole = 'SYSTEM' | 'USER' | 'ASSISTANT' | 'TOOL'

export type AgentLogLevel = 'info' | 'tool' | 'warn' | 'error'

export interface AgentSessionDto {
  id: string
  orgId: string
  userId: string
  deviceId: string | null
  title: string
  mode: string
  model: string
  status: string
  createdAt: string
  closedAt: string | null
}

export interface AgentMessageDto {
  id: string
  seq: number
  role: AgentRole
  content: string
  tokenCount: number
  createdAt: string
}

export interface AgentSessionDetailDto {
  session: AgentSessionDto
  messages: AgentMessageDto[]
}

export interface AgentReplyDto {
  sessionId: string
  messageId: string
  seq: number
  content: string
  model: string
  tokenIn: number
  tokenOut: number
}

export interface ModelInfoDto {
  activeProvider: string
  activeProviders: string[]
  models: string[]
  plannerModel: string
  fastModel: string
}

export type ToolActionState = 'running' | 'ok' | 'failed' | 'rejected'

export interface ToolAction {
  callId: string
  toolName: string
  state: ToolActionState
  detail: string
  at: number
}

export interface ChatTurn {
  id: string
  role: 'user' | 'assistant'
  text: string
  pending: boolean
  failed: boolean
  at: number
  actions: ToolAction[]
}

export interface AgentChatState {
  sessionId: string
  title: string
  model: string
  turns: ChatTurn[]
  busy: boolean
  error: string
}

export interface AgentLogEntry {
  at: number
  level: AgentLogLevel
  text: string
  detail: string[]
}

export interface AgentActivity {
  kind: 'invocation' | 'result' | 'approval' | 'socket'
  toolName: string
  callId: string
  ok: boolean
  detail: string
}

export const EMPTY_CHAT: AgentChatState = {
  sessionId: '',
  title: '',
  model: '',
  turns: [],
  busy: false,
  error: ''
}
