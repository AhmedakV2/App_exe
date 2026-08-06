import type { ExecuteResult } from '../main/browser/types'

declare global {
  interface Window {
    agent: {
      execute: (action: unknown) => Promise<ExecuteResult>
      setVision: (on: boolean) => Promise<ExecuteResult>
      home: () => Promise<ExecuteResult>
      versions: NodeJS.ProcessVersions
    }
  }
}

export {}
