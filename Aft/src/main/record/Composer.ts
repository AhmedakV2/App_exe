import { digest } from '../model'
import { parseScenario, validateScenario } from '../scenario'
import type { Scenario, ScenarioReport } from '../scenario'
import type { RecordSession, ScenarioMeta } from './types'

export interface Composition {
  scenario: Scenario
  report: ScenarioReport
}

export function compose(session: RecordSession, meta: Partial<ScenarioMeta> = {}): Composition {
  const title = (meta.title ?? session.title).trim() || defaultTitle(session)
  const baseUrl = (meta.baseUrl ?? session.baseUrl).trim()
  const description = (meta.description ?? session.description).trim()

  const scenario = parseScenario({
    version: 'scenario/1.0.0',
    id: session.id,
    title,
    description,
    baseUrl,
    createdAt: session.startedAt,
    updatedAt: Date.now(),
    defaults: {
      scanLevel: session.options.scanLevel,
      stepTimeoutMs: session.options.stepTimeoutMs,
      retries: session.options.retries,
      stopOnFailure: session.options.stopOnFailure,
      verifyState: session.options.verifyState,
      allowLowConfidence: false
    },
    steps: session.steps.map((entry) => entry.step)
  })

  return { scenario, report: validateScenario(scenario) }
}

export function sessionId(url: string, startedAt: number): string {
  return digest(['record', url, String(startedAt)])
}

export function defaultTitle(session: RecordSession): string {
  const host = hostOf(session.baseUrl)
  const stamp = new Date(session.startedAt)
  const pad = (value: number): string => String(value).padStart(2, '0')
  const clock =
    pad(stamp.getDate()) +
    '.' +
    pad(stamp.getMonth() + 1) +
    ' ' +
    pad(stamp.getHours()) +
    ':' +
    pad(stamp.getMinutes())

  return (host ? host + ' kaydi ' : 'Kayit ') + clock
}

function hostOf(url: string): string {
  if (!url) return ''
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}
