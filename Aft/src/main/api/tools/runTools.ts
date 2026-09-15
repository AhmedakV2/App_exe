import { DEFAULT_RUN_QUERY, type Indexer, type RunQuery } from '../../data'
import type { ContextStore, RunStatus } from '../../scenario'
import type { ToolHandler } from '../types'

const STATUSES: readonly RunStatus[] = ['passed', 'failed', 'errored', 'aborted']

function text(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  return typeof value === 'string' ? value : ''
}

function count(args: Record<string, unknown>, key: string, fallback: number): number {
  const value = args[key]
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback
}

function status(args: Record<string, unknown>): RunStatus | null {
  const raw = text(args, 'status') as RunStatus
  return STATUSES.includes(raw) ? raw : null
}

export function runTools(indexer: Indexer, contexts: ContextStore): Record<string, ToolHandler> {
  return {
    local_run_history: async (args) => {
      const query: RunQuery = {
        ...DEFAULT_RUN_QUERY,
        scenarioId: text(args, 'scenarioId'),
        status: status(args),
        limit: Math.min(200, Math.max(1, count(args, 'limit', 50))),
        offset: Math.max(0, count(args, 'offset', 0))
      }
      const rows = indexer.runs(query)
      return { total: rows.length, items: rows }
    },

    local_failure_context: async (args) => {
      const id = text(args, 'contextId')
      const context = await contexts.read(id)
      if (!context) throw new Error('Baglam paketi bulunamadi: ' + id)
      return context
    }
  }
}
