import type { ModelIndex } from '../model'
import type { ElementModel } from '../model'
import type { Rect } from '../discovery'
import { ancestorSignature, neighborSignature } from './signature'
import type {
  Descriptor,
  DescriptorQuality,
  MatchState,
  QualityTier,
  ResolveOptions,
  StrategyKind,
  StrategyPayload
} from './types'

const VOTE_SHARE = 0.74

const CONTEXT_SHARE = 0.17

const GEOMETRY_SHARE = 0.09

const STRONG_KINDS: ReadonlySet<StrategyKind> = new Set([
  'test-attribute',
  'element-id',
  'form-field'
])

// Kararli tanimlayicilarin tek basina tasidigi kanit gucu. Sayfa degisip zayif
// stratejiler bayatlasa bile bu capalar hedefi tek basina isaret edebilir.
const ANCHOR_STRENGTH: Partial<Record<StrategyKind, number>> = {
  'test-attribute': 1,
  'element-id': 0.94,
  'form-field': 0.86
}

// Capa yalnizca tek aday uretmisse tam guc, birden fazla aday uretmisse kismi guc alir.
const SHARED_ANCHOR = 0.5

// Capa puani asla puani dusurmez, kalan boslugun en fazla bu kadarini kapatir.
const ANCHOR_LIFT = 0.5

const STRONG_TIER = 0.72

const FAIR_TIER = 0.48

export function combine(
  voteScore: number,
  contextScore: number,
  geometryScore: number,
  anchorScore = 0
): number {
  const base =
    voteScore * VOTE_SHARE + contextScore * CONTEXT_SHARE + geometryScore * GEOMETRY_SHARE

  return round(base + (1 - base) * clamp01(anchorScore) * ANCHOR_LIFT)
}

/**
 * Adayin lehine oy veren en guclu kararli tanimlayiciyi puanlar. Tek aday ureten
 * bir test niteligi ya da kimlik alani neredeyse kesin kanittir; ayni degeri
 * birden fazla eleman tasiyorsa kanit gucu yariya iner.
 */
export function anchorScore(
  votes: readonly StrategyKind[],
  uniqueKinds: ReadonlySet<StrategyKind>
): number {
  let best = 0

  for (const kind of votes) {
    const strength = ANCHOR_STRENGTH[kind]
    if (strength === undefined) continue
    const scaled = uniqueKinds.has(kind) ? strength : strength * SHARED_ANCHOR
    if (scaled > best) best = scaled
  }
  return round(best)
}

export function contextScore(
  descriptor: Descriptor,
  element: ElementModel,
  index: ModelIndex
): number {
  const checks: [boolean, number][] = [
    [element.tag === descriptor.target.tag, 0.26],
    [roleOf(element) === descriptor.target.role, 0.14],
    [(element.attrs['type'] ?? '') === descriptor.target.type, 0.1],
    [element.framePath.depth === descriptor.context.frameDepth, 0.12],
    [samePath(element.framePath.chain, descriptor.context.framePath), 0.08],
    [element.shadowPath.depth === descriptor.context.shadowDepth, 0.08],
    [ancestorSignature(element, index) === descriptor.context.ancestorSignature, 0.14],
    [neighborSignature(element, index) === descriptor.context.neighborSignature, 0.08]
  ]

  let total = 0
  for (const [passed, weight] of checks) if (passed) total += weight
  return round(Math.min(1, total))
}

export function geometryScore(descriptor: Descriptor, element: ElementModel): number {
  const expected = descriptor.context.rect
  const actual = element.geometry.viewport
  if (!expected || !actual) return 0.5

  const sizeDelta =
    Math.abs(expected.w - actual.w) / Math.max(1, expected.w) +
    Math.abs(expected.h - actual.h) / Math.max(1, expected.h)

  const shift = distance(expected, actual) / Math.max(1, diagonal(descriptor.context.viewport))
  return round(Math.max(0, 1 - sizeDelta * 0.5 - shift))
}

export function resolveState(
  confidence: number,
  ambiguous: boolean,
  options: ResolveOptions
): MatchState {
  if (confidence >= options.exactThreshold && !ambiguous) return 'exact'
  if (confidence >= options.lowThreshold) return 'low-confidence'
  return 'not-found'
}

export function describeState(state: MatchState, confidence: number, ambiguous: boolean): string {
  const percent = Math.round(confidence * 100)
  if (state === 'exact') return 'Kesin eslesme, guven ' + percent
  if (state === 'not-found') return 'Eslesme yok, en yuksek guven ' + percent
  return ambiguous
    ? 'Dusuk guvenli eslesme, adaylar birbirine yakin, guven ' + percent
    : 'Dusuk guvenli eslesme, guven ' + percent
}

export function qualityOf(strategies: StrategyPayload[]): DescriptorQuality {
  const reasons: string[] = []
  const kinds = new Set(strategies.map((strategy) => strategy.kind))

  const strong = strategies.filter((strategy) => STRONG_KINDS.has(strategy.kind))
  const total = strategies.reduce((sum, strategy) => sum + strategy.weight, 0)
  const coverage = Math.min(1, total / 2.4)
  const strongBoost = strong.length ? 0.28 : 0
  const dynamicPenalty = strategies.some((strategy) => strategy.dynamic) ? 0.12 : 0
  const score = round(Math.max(0, Math.min(1, coverage * 0.72 + strongBoost - dynamicPenalty)))

  if (!strong.length) reasons.push('kararli test niteligi veya kimlik alani yok')
  if (kinds.has('structure') && kinds.size <= 2) reasons.push('yalnizca yapisal imzaya dayaniyor')
  if (strategies.some((strategy) => strategy.dynamic)) reasons.push('dinamik deger tespit edildi')
  if (kinds.size < 2) reasons.push('tek stratejiye bagimli')

  return { score, tier: tierOf(score), reasons }
}

function tierOf(score: number): QualityTier {
  if (score >= STRONG_TIER) return 'strong'
  if (score >= FAIR_TIER) return 'fair'
  return 'weak'
}

function roleOf(element: ElementModel): string {
  return element.attrs['role'] || element.accessibility?.role || ''
}

function samePath(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, position) => value === b[position])
}

function distance(a: Rect, b: Rect): number {
  const dx = a.x + a.w / 2 - (b.x + b.w / 2)
  const dy = a.y + a.h / 2 - (b.y + b.h / 2)
  return Math.sqrt(dx * dx + dy * dy)
}

function diagonal(viewport: { width: number; height: number }): number {
  return Math.sqrt(viewport.width * viewport.width + viewport.height * viewport.height)
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}
