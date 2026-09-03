import type { ChannelResult } from '../main/bridge'
import type {
  ContextListPayload,
  ContextPayload,
  FolderAddRequest,
  FolderPayload,
  FolderRenameRequest,
  ProgressPayload,
  RunPayload,
  RunRequest,
  ScenarioListPayload,
  ScenarioMoveRequest,
  ScenarioPayload
} from '../main/bridge'
import type { RunResult } from '../main/scenario'

declare global {
  interface Window {
    aftPlayback: {
      list: () => Promise<ChannelResult<ScenarioListPayload>>
      get: (id: string) => Promise<ChannelResult<ScenarioPayload>>
      save: (scenario: unknown, folder?: string | null) => Promise<ChannelResult<ScenarioPayload>>
      remove: (id: string) => Promise<ChannelResult<boolean>>
      validate: (scenario: unknown) => Promise<ChannelResult<ScenarioPayload>>
      run: (request: Partial<RunRequest>) => Promise<ChannelResult<RunPayload>>
      cancel: () => Promise<ChannelResult<boolean>>
      last: () => Promise<ChannelResult<RunResult | null>>
      contexts: () => Promise<ChannelResult<ContextListPayload>>
      context: (id: string) => Promise<ChannelResult<ContextPayload>>
      move: (request: ScenarioMoveRequest) => Promise<ChannelResult<boolean>>
      folderAdd: (request: FolderAddRequest) => Promise<ChannelResult<FolderPayload>>
      folderRename: (request: FolderRenameRequest) => Promise<ChannelResult<FolderPayload>>
      folderRemove: (id: string) => Promise<ChannelResult<boolean>>
      onProgress: (fn: (payload: ProgressPayload) => void) => () => void
    }
  }
}

export {}
