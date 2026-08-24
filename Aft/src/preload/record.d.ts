import type { ChannelResult } from '../main/bridge'
import type {
  EditPayload,
  RecordEditRequest,
  RecordView,
  SavePayload,
  SaveRequest,
  StartRequest
} from '../main/bridge'
import type { RecordNotice, RecordOptions, ScenarioMeta } from '../main/record'

declare global {
  interface Window {
    aftRecord: {
      start: (request: Partial<StartRequest>) => Promise<ChannelResult<RecordView>>
      stop: () => Promise<ChannelResult<RecordView>>
      pause: () => Promise<ChannelResult<RecordView>>
      resume: () => Promise<ChannelResult<RecordView>>
      state: () => Promise<ChannelResult<RecordView>>
      edit: (request: RecordEditRequest) => Promise<ChannelResult<EditPayload>>
      describe: (meta: Partial<ScenarioMeta>) => Promise<ChannelResult<RecordView>>
      options: (options: Partial<RecordOptions>) => Promise<ChannelResult<RecordView>>
      save: (request: Partial<SaveRequest>) => Promise<ChannelResult<SavePayload>>
      discard: () => Promise<ChannelResult<RecordView>>
      onUpdate: (fn: (payload: RecordView) => void) => () => void
      onNotice: (fn: (payload: RecordNotice) => void) => () => void
    }
  }
}

export {}
