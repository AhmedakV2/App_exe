import type { BrowserState, ExecuteResult, NavKind, WindowAction } from '../main/browser/types'
import type { CoverageSummary } from '../main/discovery'

declare global {
  interface Window {
    aft: {
      execute: (action: unknown) => Promise<ExecuteResult>
      setVision: (on: boolean) => Promise<ExecuteResult>
      scan: (level: number) => Promise<ExecuteResult>
      coverage: () => Promise<CoverageSummary | null>
      nav: (kind: NavKind) => void
      window: (action: WindowAction) => void
      setChat: (open: boolean) => void
      setTerminal: (open: boolean) => void
      resizeTerminal: (active: boolean) => void
      requestState: () => void
      onState: (fn: (state: BrowserState) => void) => () => void
      onFocusUrl: (fn: () => void) => () => void
      versions: NodeJS.ProcessVersions
    }
  }
}

export {}
