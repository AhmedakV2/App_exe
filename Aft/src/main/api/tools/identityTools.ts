import type { DescriptorStore } from '../../identity'
import type { ToolHandler } from '../types'

function text(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  return typeof value === 'string' ? value : ''
}

function count(args: Record<string, unknown>, key: string, fallback: number): number {
  const value = args[key]
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback
}

export function identityTools(store: DescriptorStore): Record<string, ToolHandler> {
  return {
    local_descriptor_search: async (args) => {
      const pattern = text(args, 'urlPattern')
      const needle = text(args, 'element').toLocaleLowerCase('tr')
      const limit = Math.min(100, Math.max(1, count(args, 'limit', 25)))

      const summaries = store.summaries()
      const byId = new Map(summaries.map((item) => [item.id, item]))
      const matches = store
        .byUrlPattern(pattern)
        .map((descriptor) => byId.get(descriptor.id))
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .filter((item) => {
          if (!needle) return true
          const haystack = (item.name + ' ' + item.role + ' ' + item.tag).toLocaleLowerCase('tr')
          return haystack.includes(needle)
        })
        .slice(0, limit)

      return { total: matches.length, items: matches }
    }
  }
}
