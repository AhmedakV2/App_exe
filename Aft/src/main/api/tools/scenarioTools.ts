import {
  DEFAULT_DEFAULTS,
  SCENARIO_VERSION,
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

export function scenarioTools(store: ScenarioStore): Record<string, ToolHandler> {
  return {
    local_scenario_search: async (args) => {
      const query = text(args, 'query').toLocaleLowerCase('tr')
      const limit = Math.min(50, Math.max(1, count(args, 'limit', 10)))
      const matches = store
        .entries()
        .filter((entry) => !query || entry.title.toLocaleLowerCase('tr').includes(query))
        .slice(0, limit)
      return { total: matches.length, items: matches }
    },

    local_scenario_read: async (args) => {
      const id = text(args, 'scenarioId')
      const scenario = store.get(id)
      if (!scenario) throw new Error('Senaryo bulunamadi: ' + id)
      return {
        id: scenario.id,
        title: scenario.title,
        description: scenario.description,
        baseUrl: scenario.baseUrl,
        updatedAt: scenario.updatedAt,
        steps: scenario.steps
      }
    },

    scenario_draft_write: async (args) => {
      const now = Date.now()
      const existing = store.get(text(args, 'id'))
      const draft: Scenario = {
        version: existing?.version ?? SCENARIO_VERSION,
        id: existing?.id ?? '',
        title: text(args, 'title'),
        description: text(args, 'description'),
        baseUrl: text(args, 'baseUrl'),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        defaults: existing?.defaults ?? DEFAULT_DEFAULTS,
        steps: Array.isArray(args.steps) ? (args.steps as Scenario['steps']) : []
      }
      const folder = text(args, 'folder')
      const file = await store.write(draft, folder || null)
      return { file, id: draft.id, title: draft.title, steps: draft.steps.length }
    }
  }
}
