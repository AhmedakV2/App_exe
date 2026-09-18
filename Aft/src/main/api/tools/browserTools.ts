import type { ActionRequest } from '../../action'
import type { BrowserController } from '../../browser/BrowserController'
import type { GraphNode, ScanLevel } from '../../discovery'
import { compactElement, compactOutcome } from './projection'
import type { ToolHandler } from '../types'

const LEVELS: readonly ScanLevel[] = [0, 1, 2, 3]
const DEFAULT_LIMIT = 120
const MAX_LIMIT = 400

function level(args: Record<string, unknown>, fallback: ScanLevel): ScanLevel {
  const value = args.level
  return typeof value === 'number' && LEVELS.includes(value as ScanLevel)
    ? (value as ScanLevel)
    : fallback
}

function count(args: Record<string, unknown>, key: string, fallback: number): number {
  const value = args[key]
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback
}

function needle(args: Record<string, unknown>): string {
  const value = args.filter
  return typeof value === 'string' ? value.toLocaleLowerCase('tr') : ''
}

function matches(node: GraphNode, text: string): boolean {
  if (!text) return true
  const haystack = [
    node.tag,
    node.text,
    node.value,
    node.ax?.role ?? '',
    node.ax?.name ?? '',
    node.attrs['id'] ?? '',
    node.attrs['name'] ?? '',
    node.attrs['placeholder'] ?? ''
  ]
    .join(' ')
    .toLocaleLowerCase('tr')
  return haystack.includes(text)
}

export function browserTools(controller: BrowserController): Record<string, ToolHandler> {
  return {
    page_state: async () => ({
      url: controller.url(),
      title: controller.title(),
      loading: controller.isLoading(),
      canGoBack: controller.canGoBack(),
      canGoForward: controller.canGoForward(),
      visionOn: controller.isVisionOn(),
      scanLevel: controller.getLevel()
    }),

    page_snapshot: async (args) => {
      const graph = await controller.scanGraph(
        level(args, controller.getLevel()),
        args.force === true,
        'agent'
      )

      const pool = args.allElements === true ? graph.elements() : graph.interactive()
      const filter = needle(args)
      const found = pool.filter((node) => matches(node, filter))
      const limit = Math.min(MAX_LIMIT, Math.max(1, count(args, 'limit', DEFAULT_LIMIT)))
      const shown = found.slice(0, limit)

      return {
        url: graph.url,
        title: graph.title,
        scanLevel: graph.coverage.level,
        viewport: graph.viewport,
        totalNodes: graph.coverage.nodes,
        interactiveTotal: graph.coverage.interactive,
        matched: found.length,
        returned: shown.length,
        truncated: found.length > shown.length,
        blindSpots: graph.blindSpots.map((spot) => spot.kind + ': ' + spot.detail),
        elements: shown.map(compactElement)
      }
    },

    browser_command: async (args) => {
      const outcome = await controller.dispatch(args as unknown as ActionRequest)
      return compactOutcome(outcome)
    }
  }
}
