import { SCENARIO_VERSION, SUPPORTED_SCENARIO_VERSIONS } from './types'

export type ScenarioMigration = (payload: Record<string, unknown>) => Record<string, unknown>

export class ScenarioMigrationError extends Error {
  constructor(readonly version: string) {
    super('Desteklenmeyen senaryo surumu: ' + version)
    this.name = 'ScenarioMigrationError'
  }
}

const MIGRATIONS = new Map<string, { to: string; run: ScenarioMigration }>()

export function registerScenarioMigration(from: string, to: string, run: ScenarioMigration): void {
  MIGRATIONS.set(from, { to, run })
}

export function isReadableScenario(version: string): boolean {
  if (SUPPORTED_SCENARIO_VERSIONS.includes(version)) return true

  let cursor = version
  const seen = new Set<string>()

  while (MIGRATIONS.has(cursor) && !seen.has(cursor)) {
    seen.add(cursor)
    cursor = MIGRATIONS.get(cursor)!.to
    if (SUPPORTED_SCENARIO_VERSIONS.includes(cursor)) return true
  }
  return false
}

export function migrateScenario(payload: Record<string, unknown>): Record<string, unknown> {
  const version = typeof payload['version'] === 'string' ? payload['version'] : SCENARIO_VERSION
  let current = { ...payload, version }
  const seen = new Set<string>()

  while (!SUPPORTED_SCENARIO_VERSIONS.includes(String(current['version']))) {
    const from = String(current['version'])
    const step = MIGRATIONS.get(from)
    if (!step || seen.has(from)) throw new ScenarioMigrationError(from)

    seen.add(from)
    current = { ...step.run(current), version: step.to }
  }
  return current
}
