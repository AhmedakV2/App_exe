import type { ExecuteResult } from '../main/browser/types'

declare global {
  interface Window {
    aft: {
      execute: (action: unknown) => Promise<ExecuteResult>
      setVision: (on: boolean) => Promise<ExecuteResult>
      home: () => Promise<ExecuteResult>
      versions: NodeJS.ProcessVersions
      back: () => Promise<ExecuteResult>
      forward: () => Promise<ExecuteResult>
      reload: () => Promise<ExecuteResult>
      scan: (level: number) => Promise<ExecuteResult>
      coverage: () => Promise<CoverageSummary | null>
    }
  }
}

export {}
