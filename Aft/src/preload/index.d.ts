import type { BrowserState, ExecuteResult, NavKind } from '../main/browser/types'
import type { CoverageSummary } from '../main/discovery'

declare global {
  interface Window {
    aft: {
      execute: (action: unknown) => Promise<ExecuteResult>
      setVision: (on: boolean) => Promise<ExecuteResult>
      scan: (level: number) => Promise<ExecuteResult>
      coverage: () => Promise<CoverageSummary | null>
      nav: (kind: NavKind) => void
      setChat: (open: boolean) => void
      requestState: () => void
      onState: (fn: (state: BrowserState) => void) => () => void
      versions: NodeJS.ProcessVersions
    }
  }
}

export {}
