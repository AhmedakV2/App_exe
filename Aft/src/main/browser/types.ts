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
  | 'press_enter'
  | 'snapshot'
  | 'double_click'
  | 'right_click'
  | 'mouse_move'
  | 'clear_type'

export interface AgentAction {
  action: ActionName
  index?: number
  text?: string
  url?: string
  deltaY?: number
}

export interface ExecuteResult {
  ok: boolean
  result: string
  page: PageState | null
  vision: boolean
}
