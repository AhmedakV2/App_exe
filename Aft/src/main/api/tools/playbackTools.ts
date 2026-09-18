import { parseScenario, type PlaybackOptions } from '../../scenario'
import type { PlaybackAccess, PlaybackRunInput, ToolHandler } from '../types'

function text(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  return typeof value === 'string' ? value : ''
}

function options(args: Record<string, unknown>): Partial<PlaybackOptions> {
  const patch: Partial<PlaybackOptions> = {}
  if (typeof args.stopOnFailure === 'boolean') patch.stopOnFailure = args.stopOnFailure
  if (typeof args.stepTimeoutMs === 'number' && Number.isFinite(args.stepTimeoutMs)) {
    patch.stepTimeoutMs = Math.max(0, Math.trunc(args.stepTimeoutMs))
  }
  return patch
}

export function playbackTools(playback: PlaybackAccess): Record<string, ToolHandler> {
  return {
    local_scenario_run: async (args) => {
      if (playback.running()) throw new Error('Zaten suren bir kosum var, once onu durdurun')

      const input: PlaybackRunInput = { options: options(args) }
      if (args.scenario) input.scenario = parseScenario(args.scenario)
      else input.scenarioId = text(args, 'scenarioId')
      if (!input.scenario && !input.scenarioId) throw new Error('scenarioId veya scenario gerekli')

      const payload = await playback.execute(input)
      const run = payload.run
      return {
        runId: run.id,
        scenarioId: run.scenarioId,
        scenarioTitle: run.scenarioTitle,
        status: run.status,
        ok: run.ok,
        durationMs: run.finishedAt - run.startedAt,
        metrics: run.metrics,
        failures: run.failures,
        contexts: run.contexts,
        reports: payload.reports,
        steps: run.steps
      }
    },

    local_run_cancel: async () => {
      if (!playback.running()) return { cancelled: false, running: false }
      return { cancelled: true, running: playback.abort() }
    }
  }
}
