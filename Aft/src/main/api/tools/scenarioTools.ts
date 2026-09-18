import {
  DEFAULT_DEFAULTS,
  SCENARIO_VERSION,
  parseScenario,
  validateScenario,
  type Scenario,
  type ScenarioStore
} from '../../scenario'
import type { ToolHandler } from '../types'

function text(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  return typeof value === 'string' ? value : ''
}

function count(args: Record<string, unknown>, key: string, fallback: number): number {
  const value = args[key]
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback
}

function outline(scenario: Scenario): Record<string, unknown> {
  return {
    id: scenario.id,
    title: scenario.title,
    description: scenario.description,
    baseUrl: scenario.baseUrl,
    updatedAt: scenario.updatedAt,
    steps: scenario.steps
  }
}

export function scenarioTools(store: ScenarioStore): Record<string, ToolHandler> {
  const require = (id: string): Scenario => {
    const scenario = store.get(id)
    if (!scenario) throw new Error('Senaryo bulunamadi: ' + id)
    return scenario
  }

  return {
    local_scenario_list: async (args) => {
      const folder = text(args, 'folder')
      const limit = Math.min(500, Math.max(1, count(args, 'limit', 100)))
      const entries = store
        .entries()
        .filter((entry) => !folder || store.folderOf(entry.id) === folder)
      return {
        total: entries.length,
        items: entries.slice(0, limit),
        folders: store.folders()
      }
    },

    local_scenario_search: async (args) => {
      const query = text(args, 'query').toLocaleLowerCase('tr')
      const limit = Math.min(50, Math.max(1, count(args, 'limit', 10)))
      const matches = store
        .entries()
        .filter((entry) => !query || entry.title.toLocaleLowerCase('tr').includes(query))
        .slice(0, limit)
      return { total: matches.length, items: matches }
    },

    local_scenario_read: async (args) => outline(require(text(args, 'scenarioId'))),

    local_scenario_validate: async (args) => {
      const scenario = args.scenario
        ? parseScenario(args.scenario)
        : require(text(args, 'scenarioId'))
      const report = validateScenario(scenario)
      return {
        id: scenario.id,
        title: scenario.title,
        steps: scenario.steps.length,
        valid: report.errors.length === 0,
        errors: report.errors,
        warnings: report.warnings
      }
    },

    local_scenario_delete: async (args) => {
      const id = text(args, 'scenarioId')
      const scenario = require(id)
      const removed = await store.remove(id)
      return { removed, id, title: scenario.title }
    },

    scenario_draft_write: async (args) => {
      const now = Date.now()
      const existing = store.get(text(args, 'id'))
      const draft = parseScenario({
        version: existing?.version ?? SCENARIO_VERSION,
        id: existing?.id ?? '',
        title: text(args, 'title'),
        description: text(args, 'description'),
        baseUrl: text(args, 'baseUrl'),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        defaults: existing?.defaults ?? DEFAULT_DEFAULTS,
        steps: Array.isArray(args.steps) ? args.steps : []
      })
      const folder = text(args, 'folder')
      const file = await store.write(draft, folder || null)
      const report = validateScenario(draft)
      return {
        file,
        id: draft.id,
        title: draft.title,
        steps: draft.steps.length,
        valid: report.errors.length === 0,
        errors: report.errors,
        warnings: report.warnings
      }
    }
  }
}
