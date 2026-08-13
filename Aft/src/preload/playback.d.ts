import type { ChannelResult } from '../main/bridge'
import type {
  ContextListPayload,
  ContextPayload,
  ProgressPayload,
  RunPayload,
  RunRequest,
  ScenarioListPayload,
  ScenarioPayload
} from '../main/bridge'
import type { RunResult } from '../main/scenario'

declare global {
  interface Window {
    aftPlayback: {
      list: () => Promise<ChannelResult<ScenarioListPayload>>
      get: (id: string) => Promise<ChannelResult<ScenarioPayload>>
      save: (scenario: unknown) => Promise<ChannelResult<ScenarioPayload>>
      remove: (id: string) => Promise<ChannelResult<boolean>>
      validate: (scenario: unknown) => Promise<ChannelResult<ScenarioPayload>>
      run: (request: Partial<RunRequest>) => Promise<ChannelResult<RunPayload>>
      cancel: () => Promise<ChannelResult<boolean>>
      last: () => Promise<ChannelResult<RunResult | null>>
      contexts: () => Promise<ChannelResult<ContextListPayload>>
      context: (id: string) => Promise<ChannelResult<ContextPayload>>
      onProgress: (fn: (payload: ProgressPayload) => void) => () => void
    }
  }
}

export {}
