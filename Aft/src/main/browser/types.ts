import type { ActionOutcome } from '../action'
import type { BlindSpot, CoverageSummary, ScanLevel } from '../discovery'

export interface PageElement {
  i: number
  tag: string
  type: string
  name: string
  text: string
  x: number
  y: number
}

export interface PageState {
  url: string
  title: string
  scrollY: number
  pageHeight: number
  viewport: number
  elements: PageElement[]
}

export type ActionName =
  | 'go_to_url'
  | 'click'
  | 'type'
  | 'scroll'
  | 'snapshot'
  | 'double_click'
  | 'right_click'
  | 'mouse_move'
  | 'clear_type'
  | 'press_key'
  | 'select_option'
  | 'upload'
  | 'wait'
  | 'refresh'

export interface AgentAction {
  action: ActionName
  index?: number
  descriptorId?: string
  text?: string
  url?: string
  deltaY?: number
  key?: string
  optionValue?: string
  files?: string[]
  force?: boolean
}

export interface ExecuteResult {
  ok: boolean
  result: string
  page: PageState | null
  vision: boolean
  outcome: ActionOutcome | null
}

export interface FrameInfo {
  id: string
  url: string
  depth: number
  failed: boolean
}

export interface ScanReport {
  url: string
  title: string
  level: ScanLevel
  coverage: CoverageSummary
  blindSpots: BlindSpot[]
  frames: FrameInfo[]
  viewport: { width: number; height: number; pageHeight: number }
  capturedAt: number
}

export interface StageBox {
  x: number
  y: number
  width: number
  height: number
}

export interface PointerSpot {
  x: number
  y: number
}

export type DragAxis = 'chat' | 'terminal' | 'record'

export type NavKind = 'back' | 'forward' | 'reload' | 'home' | 'stop'

export type WindowAction = 'minimize' | 'maximize' | 'close' | 'fullscreen'

export interface BrowserState {
  url: string
  title: string
  canGoBack: boolean
  canGoForward: boolean
  loading: boolean
  chatOpen: boolean
  terminalOpen: boolean
  settingsOpen: boolean
  vision: boolean
  devtoolsOpen: boolean
  maximized: boolean
  fullscreen: boolean
}

export interface AppPrefs {
  theme: string
  autoTerminal: boolean
  autoTerminalRestore: boolean
  screenshotOnFailure: boolean
  stopOnFailure: boolean
  verifyState: boolean
}
