import type { StepResult } from '../../../main/scenario/types'

export const STEP_LABELS: Record<string, string> = {
  passed: 'Geçti',
  failed: 'Kaldı',
  errored: 'Hata',
  skipped: 'Atlandı'
}

export function stepDetail(step: StepResult): string[] {
  const detail: string[] = []
  if (step.resolution) {
    detail.push(
      'Kimlik: ' +
        step.resolution.state +
        ' · güven %' +
        Math.round(step.resolution.confidence * 100)
    )
  }
  for (const check of step.assertions) {
    detail.push(
      'Doğrulama: ' +
        check.kind +
        ' · beklenen "' +
        check.expected +
        '" · gelen "' +
        check.actual +
        '"'
    )
  }
  if (step.stateCheck && !step.stateCheck.ok) {
    detail.push('Durum: ' + step.stateCheck.reasons.join(', '))
  }
  if (step.outcome?.code) detail.push('Kod: ' + step.outcome.code)
  if (step.contextId) detail.push('Bağlam: ' + step.contextId)
  if (step.message) detail.push(step.message)
  return detail
}
