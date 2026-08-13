import type {
  BrowserState,
  DragAxis,
  ExecuteResult,
  NavKind,
  PointerSpot,
  StageBox,
  WindowAction
} from '../main/browser/types'
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
      startDrag: (axis: DragAxis) => void
      endDrag: () => void
      setStage: (box: StageBox) => void
      setModal: (open: boolean) => void
      setChrome: (color: string) => void
      requestState: () => void
      onState: (fn: (state: BrowserState) => void) => () => void
      onFocusUrl: (fn: () => void) => () => void
      onFocusTerminal: (fn: () => void) => () => void
      onPointer: (fn: (spot: PointerSpot) => void) => () => void
      onDragEnd: (fn: () => void) => () => void
      versions: NodeJS.ProcessVersions
    }
  }
}

export {}
