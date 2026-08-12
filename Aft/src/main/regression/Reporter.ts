import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { poolCoverage } from './pool'
import type { CaseResult, PoolRun } from './types'

const STATUS_LABEL: Record<CaseResult['status'], string> = {
  passed: 'GECTI',
  failed: 'KALDI',
  errored: 'HATA',
  skipped: 'ATLANDI'
}

export function renderText(run: PoolRun): string {
  const lines: string[] = []
  const metrics = run.metrics

  lines.push('AFT Regresyon Havuzu ' + run.version)
  lines.push('Kosum ' + run.id)
  lines.push('Sonuc ' + (run.ok ? 'BASARILI' : 'BASARISIZ'))
  lines.push('')
  lines.push(
    'Vaka ' +
      metrics.cases +
      ' | Gecen ' +
      metrics.passed +
      ' | Kalan ' +
      metrics.failed +
      ' | Hata ' +
      metrics.errored
  )
  lines.push('Cozumleme orani ' + percent(metrics.resolutionRate))
  lines.push('Yanlis pozitif orani ' + percent(metrics.falsePositiveRate))
  lines.push('Belirsizlik orani ' + percent(metrics.ambiguityRate))
  lines.push('Ortalama guven ' + percent(metrics.meanConfidence))
  lines.push('Ortalama kimlik kalitesi ' + percent(metrics.meanQuality))
  lines.push(
    'Kesif suresi ortalama ' +
      metrics.discoveryMsMean +
      ' ms, p95 ' +
      metrics.discoveryMsP95 +
      ' ms'
  )
  lines.push('Toplam sure ' + metrics.totalMs + ' ms')
  lines.push('')

  lines.push('Kapsam')
  for (const [kind, count] of Object.entries(poolCoverage())) lines.push('  ' + kind + ' ' + count)
  lines.push('')

  lines.push('Vakalar')
  for (const result of run.cases) {
    lines.push(
      '  ' +
        pad(STATUS_LABEL[result.status], 8) +
        pad(result.caseId, 22) +
        'etkilesim ' +
        pad(String(result.metrics.interactive), 6) +
        'cozumleme ' +
        pad(percent(result.metrics.resolutionRate), 8) +
        'sure ' +
        result.metrics.discoveryMs +
        ' ms'
    )
    for (const failure of result.failures) lines.push('           ' + failure)
  }

  if (run.comparison) {
    lines.push('')
    lines.push('Referans karsilastirma, gerileme ' + run.comparison.regressions)
    for (const delta of run.comparison.deltas) {
      if (!delta.regressed) continue
      lines.push(
        '  ' + delta.caseId + ' ' + String(delta.field) + ' ' + delta.before + ' -> ' + delta.after
      )
    }
  }

  if (run.failures.length) {
    lines.push('')
    lines.push('Basarisizlik nedenleri')
    for (const failure of run.failures) lines.push('  ' + failure)
  }

  return lines.join('\n')
}

export async function writeReport(run: PoolRun, directory: string): Promise<string[]> {
  const jsonPath = join(directory, run.id + '.json')
  const textPath = join(directory, run.id + '.txt')

  await mkdir(dirname(jsonPath), { recursive: true })
  await writeFile(jsonPath, JSON.stringify(run, null, 2), 'utf8')
  await writeFile(textPath, renderText(run), 'utf8')

  return [jsonPath, textPath]
}

function percent(value: number): string {
  return (value * 100).toFixed(1) + '%'
}

function pad(value: string, width: number): string {
  return value.length >= width ? value + ' ' : value + ' '.repeat(width - value.length)
}
