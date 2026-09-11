import type { DataDriver } from './driver'
import { createSchema } from './schema'
import { DATA_USER_VERSION } from './types'

export interface DataMigrationResult {
  from: number
  to: number
  applied: string[]
  created: boolean
}

class DataMigrationError extends Error {
  constructor(readonly version: number) {
    super('Desteklenmeyen veri surumu: ' + version)
    this.name = 'DataMigrationError'
  }
}

export function migrateData(driver: DataDriver): DataMigrationResult {
  const from = driver.userVersion()

  if (from === 0) {
    driver.transaction(() => createSchema(driver))
    driver.setUserVersion(DATA_USER_VERSION)
    return { from, to: DATA_USER_VERSION, applied: [], created: true }
  }
  if (from !== DATA_USER_VERSION) throw new DataMigrationError(from)

  return { from, to: from, applied: [], created: false }
}
