import { SUPPORTED_SCENARIO_VERSIONS, SCENARIO_VERSION } from './types'

class ScenarioMigrationError extends Error {
  constructor(readonly version: string) {
    super('Desteklenmeyen senaryo surumu: ' + version)
    this.name = 'ScenarioMigrationError'
  }
}

export function migrateScenario(payload: Record<string, unknown>): Record<string, unknown> {
  const version = typeof payload['version'] === 'string' ? payload['version'] : SCENARIO_VERSION
  if (!SUPPORTED_SCENARIO_VERSIONS.includes(version)) throw new ScenarioMigrationError(version)
  return { ...payload, version }
}
