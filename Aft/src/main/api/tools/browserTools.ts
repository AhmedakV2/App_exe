import type { ActionRequest } from '../../action'
import type { BrowserController } from '../../browser/BrowserController'
import type { ScanLevel } from '../../discovery'
import type { ToolHandler } from '../types'

const LEVELS: readonly ScanLevel[] = [0, 1, 2, 3]

function level(args: Record<string, unknown>, fallback: ScanLevel): ScanLevel {
  const value = args.level
  return typeof value === 'number' && LEVELS.includes(value as ScanLevel)
    ? (value as ScanLevel)
    : fallback
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
      return { url: controller.url(), title: controller.title(), graph }
    },

    browser_command: async (args) => {
      const outcome = await controller.dispatch(args as unknown as ActionRequest)
      return outcome
    }
  }
}
