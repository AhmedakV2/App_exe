import type {
  AppPrefs,
  BrowserState,
  DragAxis,
  ExecuteResult,
  NavKind,
  PointerSpot,
  ScanReport,
  StageBox,
  WindowAction
} from '../main/browser/types'

declare global {
  interface Window {
    aft: {
      execute: (action: unknown) => Promise<ExecuteResult>
      setVision: (on: boolean) => Promise<ExecuteResult>
      scan: (level: number) => Promise<ExecuteResult>
      coverage: () => Promise<ScanReport | null>
      nav: (kind: NavKind) => void
      window: (action: WindowAction) => void
      setChat: (open: boolean) => void
      setTerminal: (open: boolean) => void
      startDrag: (axis: DragAxis) => void
      endDrag: () => void
      setStage: (box: StageBox) => void
      setModal: (open: boolean) => void
      setStageShown: (open: boolean) => void
      setSettings: (open: boolean) => void
      setDevtools: (open: boolean) => void
      publishPrefs: (value: AppPrefs) => void
      patchPrefs: (patch: Partial<AppPrefs>) => void
      setChrome: (color: string) => void
      requestState: () => void
      onState: (fn: (state: BrowserState) => void) => () => void
      onFocusUrl: (fn: () => void) => () => void
      onFocusTerminal: (fn: () => void) => () => void
      onPointer: (fn: (spot: PointerSpot) => void) => () => void
      onPrefs: (fn: (value: AppPrefs) => void) => () => void
      onPrefsPatch: (fn: (patch: Partial<AppPrefs>) => void) => () => void
      onDragEnd: (fn: () => void) => () => void
      versions: NodeJS.ProcessVersions
    }
  }
}

export {}
