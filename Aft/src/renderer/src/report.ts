export type ReportLevel = 'ok' | 'err' | 'note'

export interface Report {
  level: ReportLevel
  text: string
  detail?: string[]
}
