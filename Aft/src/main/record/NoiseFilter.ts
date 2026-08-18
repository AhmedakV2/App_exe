import { sourceKey } from './Normalizer'
import type { RecordIntent, RecordOptions, RecordedStep } from './types'

export interface Suppression {
  drop: boolean
  reason: string
  mergeInto: string
  remove: string[]
  removeReason: string
}

const NONE: Suppression = {
  drop: false,
  reason: '',
  mergeInto: '',
  remove: [],
  removeReason: ''
}

export function suppress(
  intent: RecordIntent,
  steps: readonly RecordedStep[],
  options: RecordOptions
): Suppression {
  const last = steps[steps.length - 1] ?? null
  const key = sourceKey(intent.raw)

  if (intent.kind === 'navigate') {
    const anchor = lastCaptured(steps)
    if (anchor && intent.at - anchor.at <= options.navigateQuietMs && anchor.kind !== 'navigate') {
      return { ...NONE, drop: true, reason: 'adim sonrasi otomatik adres degisimi' }
    }
    if (last && last.kind === 'navigate' && last.step.url === intent.url) {
      return { ...NONE, drop: true, reason: 'ayni adres tekrarlandi' }
    }
    return NONE
  }

  if (intent.kind === 'scroll') {
    const sameSurface = last && last.kind === 'scroll' && last.sourceKey === key
    if (sameSurface && intent.at - last.at <= options.scrollFollowMs) {
      return { ...NONE, mergeInto: last.id, reason: 'ardisik kaydirma birlestirildi' }
    }
    return NONE
  }

  if (intent.kind === 'double-click') {
    const remove = trailing(steps, (step) => step.kind === 'click' && step.sourceKey === key, 2)
      .filter((step) => intent.at - step.at <= options.doubleClickMs)
      .map((step) => step.id)

    return remove.length
      ? { ...NONE, remove, removeReason: 'cift tiklamanin tekil tiklamalari elendi' }
      : NONE
  }

  const remove: string[] = []
  let removeReason = ''

  const scrolledIntoView =
    last &&
    last.kind === 'scroll' &&
    !last.step.target &&
    intent.at - last.at <= options.scrollFollowMs

  if (scrolledIntoView) {
    remove.push(last.id)
    removeReason = 'eylem oncesi kaydirma elendi'
  }

  if (intent.kind === 'clear-type' && key) {
    const chain = trailing(steps, (step) => step.sourceKey === key, 2)
    let merge = chain[0] ?? null

    if (merge && merge.kind === 'click' && intent.at - merge.at <= options.focusClickMs) {
      remove.push(merge.id)
      removeReason = 'odaklanma tiklamasi elendi'
      merge = chain[1] ?? null
    }

    if (merge && merge.kind === 'clear-type' && intent.at - merge.at <= options.mergeTypingMs) {
      return { ...NONE, mergeInto: merge.id, remove, removeReason, reason: 'yazma birlestirildi' }
    }
  }

  if (intent.kind === 'select-option' && key) {
    const merge = trailing(steps, (step) => step.sourceKey === key, 1)[0]
    if (merge && merge.kind === 'click' && intent.at - merge.at <= options.focusClickMs) {
      remove.push(merge.id)
      removeReason = 'liste acma tiklamasi elendi'
    }
    if (merge && merge.kind === 'select-option' && intent.at - merge.at <= options.mergeTypingMs) {
      return { ...NONE, mergeInto: merge.id, remove, removeReason, reason: 'secim guncellendi' }
    }
  }

  if (intent.kind === 'upload' && key) {
    const merge = trailing(steps, (step) => step.sourceKey === key, 1)[0]
    if (merge && merge.kind === 'click' && intent.at - merge.at <= options.focusClickMs) {
      remove.push(merge.id)
      removeReason = 'dosya secici tiklamasi elendi'
    }
  }

  if (intent.kind === 'click' && key) {
    const previous = trailing(steps, (step) => step.sourceKey === key, 1)[0]
    if (previous && previous.kind === 'click' && intent.at - previous.at <= options.doubleClickMs) {
      return { ...NONE, drop: true, reason: 'ayni eleman uzerinde tekrar eden tiklama elendi' }
    }
  }

  if (intent.kind === 'press-key' && last && last.kind === 'press-key') {
    if (last.step.key === intent.key && last.sourceKey === key && intent.at - last.at <= 120) {
      return { ...NONE, drop: true, reason: 'tekrar eden tus elendi' }
    }
  }

  return remove.length ? { ...NONE, remove, removeReason } : NONE
}

function trailing(
  steps: readonly RecordedStep[],
  match: (step: RecordedStep) => boolean,
  limit: number
): RecordedStep[] {
  const out: RecordedStep[] = []
  for (let position = steps.length - 1; position >= 0 && out.length < limit; position--) {
    const step = steps[position]
    if (!match(step)) break
    out.push(step)
  }
  return out
}

function lastCaptured(steps: readonly RecordedStep[]): RecordedStep | null {
  for (let position = steps.length - 1; position >= 0; position--) {
    if (steps[position].origin === 'capture') return steps[position]
  }
  return null
}
