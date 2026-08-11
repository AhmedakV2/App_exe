import { MODEL_VERSION, SUPPORTED_MODEL_VERSIONS, type GraphSnapshot } from './schema'

export type Migration = (input: Record<string, unknown>) => Record<string, unknown>

export interface MigrationStep {
  from: string
  to: string
  apply: Migration
}

export interface MigrationResult {
  snapshot: GraphSnapshot
  applied: string[]
  originalVersion: string
}

export class MigrationError extends Error {
  constructor(readonly version: string) {
    super('Desteklenmeyen model surumu: ' + version)
    this.name = 'MigrationError'
  }
}

const STEPS: MigrationStep[] = []

export function registerMigration(step: MigrationStep): void {
  const exists = STEPS.some((entry) => entry.from === step.from && entry.to === step.to)
  if (exists) throw new Error('Migration zaten kayitli: ' + step.from + ' -> ' + step.to)
  STEPS.push(step)
}

export function migrationPath(from: string): MigrationStep[] {
  const path: MigrationStep[] = []
  const seen = new Set<string>([from])
  let cursor = from

  while (cursor !== MODEL_VERSION) {
    const step = STEPS.find((entry) => entry.from === cursor)
    if (!step || seen.has(step.to)) return []
    path.push(step)
    seen.add(step.to)
    cursor = step.to
  }
  return path
}

export function migrate(raw: unknown): MigrationResult {
  if (!raw || typeof raw !== 'object') throw new MigrationError('bilinmiyor')

  const input = raw as Record<string, unknown>
  const originalVersion = typeof input['modelVersion'] === 'string' ? input['modelVersion'] : ''

  if (originalVersion === MODEL_VERSION) {
    return { snapshot: input as unknown as GraphSnapshot, applied: [], originalVersion }
  }
  if (!originalVersion) throw new MigrationError('bilinmiyor')

  const path = migrationPath(originalVersion)
  if (path.length === 0) throw new MigrationError(originalVersion)

  let current = input
  const applied: string[] = []

  for (const step of path) {
    current = step.apply(current)
    current['modelVersion'] = step.to
    applied.push(step.from + ' -> ' + step.to)
  }

  return { snapshot: current as unknown as GraphSnapshot, applied, originalVersion }
}

export function isReadable(version: string): boolean {
  return SUPPORTED_MODEL_VERSIONS.includes(version) || migrationPath(version).length > 0
}
