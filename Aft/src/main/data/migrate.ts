import type { DataDriver } from './driver'
import { createSchema } from './schema'
import { DATA_USER_VERSION } from './types'

export type DataMigration = (driver: DataDriver) => void
export interface DataMigrationStep {
  from: number
  to: number
  apply: DataMigration
}
export interface DataMigrationResult {
  from: number
  to: number
  applied: string[]
  created: boolean
}
export class DataMigrationError extends Error {
  constructor(readonly version: number) {
    super('Desteklenmeyen veri surumu: ' + version)
    this.name = 'DataMigrationError'
  }
}
const STEPS: DataMigrationStep[] = []

export function registerDataMigration(step: DataMigrationStep): void {
  if (step.to <= step.from)
    throw new Error('Gecersiz migration yonu: ' + step.from + ' -> ' + step.to)
  const exists = STEPS.some((entry) => entry.from === step.from && entry.to === step.to)
  if (exists) throw new Error('Veri migration zaten kayitli: ' + step.from + ' -> ' + step.to)
  STEPS.push(step)
}
export function migrationSteps(): readonly DataMigrationStep[] {
  return STEPS
}
export function isReadableData(version: number): boolean {
  return version >= 0 && version <= DATA_USER_VERSION
}
export function migrateData(driver: DataDriver): DataMigrationResult {
  const from = driver.userVersion()
  if (!isReadableData(from)) throw new DataMigrationError(from)
  if (from === 0) {
    driver.transaction(() => createSchema(driver))
    driver.setUserVersion(DATA_USER_VERSION)
    return { from, to: DATA_USER_VERSION, applied: [], created: true }
  }
  const applied: string[] = []
  let current = from
  while (current < DATA_USER_VERSION) {
    const step = STEPS.find((entry) => entry.from === current)
    if (!step) throw new DataMigrationError(current)
    driver.transaction(() => step.apply(driver))
    driver.setUserVersion(step.to)
    applied.push(step.from + ' -> ' + step.to)
    current = step.to
  }
  return { from, to: current, applied, created: false }
}
