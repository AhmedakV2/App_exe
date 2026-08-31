import { join } from 'node:path'
import { writeFileAtomic } from '../atomic'
import { renderLog } from './RunLog'
import type { RunResult, StepResult, StepStatus } from './types'

const STATUS_LABEL: Record<StepStatus, string> = {
  passed: 'GECTI',
  failed: 'KALDI',
  errored: 'HATA',
  skipped: 'ATLANDI'
}

export function renderText(run: RunResult): string {
  const lines: string[] = []
  const metrics = run.metrics

  lines.push('AFT Playback ' + run.version)
  lines.push('Senaryo ' + run.scenarioTitle + ' (' + run.scenarioId + ')')
  lines.push('Kosum ' + run.id)
  lines.push('Sonuc ' + (run.ok ? 'BASARILI' : 'BASARISIZ') + ' | Durum ' + run.status)
  lines.push('')
  lines.push(
    'Adim ' +
      metrics.steps +
      ' | Gecen ' +
      metrics.passed +
      ' | Kalan ' +
      metrics.failed +
      ' | Hata ' +
      metrics.errored +
      ' | Atlanan ' +
      metrics.skipped
  )
  lines.push('Dogrulama ' + metrics.assertions + ', tutmayan ' + metrics.assertionsFailed)
  lines.push(
    'Cozumleme kesin ' +
      metrics.resolvedExact +
      ', dusuk guvenli ' +
      metrics.resolvedLow +
      ', bulunamayan ' +
      metrics.resolvedMissing
  )
  lines.push('Ortalama guven ' + percent(metrics.meanConfidence))
  lines.push('Tarama ' + metrics.scans + ', yeniden deneme ' + metrics.retries)
  lines.push(
    'Faz suresi tarama ' +
      metrics.scanMs +
      ' ms, cozumleme ' +
      metrics.resolveMs +
      ' ms, durum ' +
      metrics.verifyMs +
      ' ms, aksiyon ' +
      metrics.actionMs +
      ' ms'
  )
  lines.push('Protokol cagrisi ' + metrics.protocolCalls)
  lines.push('Toplam sure ' + metrics.totalMs + ' ms')
  lines.push('')
  lines.push('Adimlar')
  for (const line of renderSteps(run.steps, 2)) lines.push(line)

  if (run.failures.length) {
    lines.push('')
    lines.push('Basarisizlik nedenleri')
    for (const failure of run.failures) lines.push('  ' + failure)
  }

  if (run.contexts.length) {
    lines.push('')
    lines.push('Hata baglam paketleri')
    for (const id of run.contexts) lines.push('  ' + id)
  }

  lines.push('')
  lines.push('Kosum gunlugu')
  lines.push(renderLog(run.log))

  return lines.join('\n')
}

export async function writeReport(run: RunResult, directory: string): Promise<string[]> {
  if (!directory) return []

  const jsonPath = join(directory, run.id + '.json')
  const textPath = join(directory, run.id + '.txt')

  await writeFileAtomic(jsonPath, JSON.stringify(run, null, 2))
  await writeFileAtomic(textPath, renderText(run))

  return [jsonPath, textPath]
}

function renderSteps(steps: readonly StepResult[], indent: number): string[] {
  const lines: string[] = []
  const prefix = ' '.repeat(indent)

  for (const step of steps) {
    lines.push(
      prefix +
        pad(STATUS_LABEL[step.status], 9) +
        pad(String(step.index + 1), 4) +
        pad(step.kind, 15) +
        pad(cut(step.title, 34), 36) +
        pad(step.durationMs + ' ms', 10) +
        detail(step)
    )

    for (const assertion of step.assertions) {
      lines.push(
        prefix +
          '    ' +
          (assertion.passed ? 'dogrulandi ' : 'tutmadi ') +
          assertion.kind +
          ' beklenen "' +
          cut(assertion.expected, 40) +
          '" gerceklesen "' +
          cut(assertion.actual, 40) +
          '"'
      )
    }
    if (step.kind !== 'group') {
      lines.push(
        prefix +
          '    faz tarama ' +
          step.phases.scanMs +
          ' ms, cozumleme ' +
          step.phases.resolveMs +
          ' ms, durum ' +
          step.phases.verifyMs +
          ' ms, aksiyon ' +
          step.phases.actionMs +
          ' ms'
      )
    }
    if (step.stateCheck && !step.stateCheck.ok) {
      lines.push(prefix + '    sayfa durumu: ' + step.stateCheck.reasons.join(', '))
    }
    if (step.status !== 'passed' && step.message) {
      lines.push(prefix + '    ' + step.message)
    }
    if (step.contextId) {
      lines.push(prefix + '    baglam paketi: ' + step.contextId)
    }
    if (step.children.length) lines.push(...renderSteps(step.children, indent + 4))
  }

  return lines
}

function detail(step: StepResult): string {
  if (!step.resolution) return ''
  return (
    'guven ' +
    percent(step.resolution.confidence) +
    (step.resolution.winners.length ? ' | ' + step.resolution.winners.join('+') : '') +
    (step.resolution.healed ? ' | onarildi' : '')
  )
}

function percent(value: number): string {
  return (value * 100).toFixed(1) + '%'
}

function cut(value: string, width: number): string {
  return value.length <= width ? value : value.slice(0, width - 1) + '.'
}

function pad(value: string, width: number): string {
  return value.length >= width ? value + ' ' : value + ' '.repeat(width - value.length)
}
