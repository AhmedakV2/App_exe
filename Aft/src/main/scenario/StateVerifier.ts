import type { CoverageSummary } from '../discovery'
import type { Descriptor } from '../identity'
import type { ModelIndex } from '../model'
import { matches } from './AssertionEngine'
import type { ExpectedState, StateCheck } from './types'

export function expectedFromCapture(descriptor: Descriptor): ExpectedState {
  return {
    urlPattern: descriptor.context.urlPattern,
    titlePattern: descriptor.capture.title,
    minInteractive: 0,
    maxBlindSpots: Number.MAX_SAFE_INTEGER,
    scanLevel: descriptor.capture.scanLevel
  }
}

export function verifyState(
  expected: ExpectedState,
  index: ModelIndex,
  coverage: CoverageSummary | null
): StateCheck {
  const origin = index.snapshot.origin
  const interactive = coverage?.interactive ?? index.interactive().length
  const blindSpots = coverage?.blindSpots ?? index.blindSpots().length
  const scanLevel = coverage?.level ?? origin.scanLevel
  const reasons: string[] = []

  if (expected.urlPattern && !matches(origin.url, expected.urlPattern)) {
    reasons.push('adres kalibi tutmadi: ' + expected.urlPattern)
  }
  if (expected.titlePattern && !matches(origin.title, expected.titlePattern)) {
    reasons.push('baslik kalibi tutmadi: ' + expected.titlePattern)
  }
  if (interactive < expected.minInteractive) {
    reasons.push('etkilesilebilir eleman az: ' + interactive)
  }
  if (blindSpots > expected.maxBlindSpots) {
    reasons.push('kor nokta fazla: ' + blindSpots)
  }
  if (scanLevel < expected.scanLevel) {
    reasons.push('tarama seviyesi dusuk: ' + scanLevel)
  }

  return {
    ok: reasons.length === 0,
    expected,
    url: origin.url,
    title: origin.title,
    interactive,
    blindSpots,
    scanLevel,
    reasons
  }
}
