import { DEFAULT_RESOLVE, resolveState, strategyByKind } from '../identity'
import type { Descriptor, MatchState, QualityTier } from '../identity'
import type { ElementModel, ModelIndex } from '../model'
import { digest } from '../model'
import { matchQuery } from '../scenario'
import type { QueryKind, StepQuery, StepTarget } from '../scenario'
import type { AdviceLevel, RawElement, StepAdvice, TargetOption } from './types'

const QUERY_SCORES: Record<QueryKind, number> = {
  'test-id': 1,
  'element-id': 0.86,
  'field-name': 0.78,
  'accessible-name': 0.7,
  text: 0.56
}

const QUERY_LABELS: Record<QueryKind, string> = {
  'test-id': 'Test niteligi',
  'element-id': 'Kimlik alani',
  'field-name': 'Form alani',
  'accessible-name': 'Erisilebilir isim',
  text: 'Metin'
}

export interface StrategyProbe {
  kind: string
  weight: number
  matches: number
  hit: boolean
  unique: boolean
}

export function assess(
  descriptor: Descriptor,
  element: ElementModel,
  index: ModelIndex,
  raw: RawElement | null
): StepAdvice {
  const probes = probe(descriptor, element, index)
  const total = probes.reduce((sum, entry) => sum + entry.weight, 0)
  const won = probes.filter((entry) => entry.unique).reduce((sum, entry) => sum + entry.weight, 0)
  const confidence = total ? round(won / total) : 0
  const leader = probes.slice().sort((a, b) => b.weight - a.weight)[0] ?? null
  const ambiguous = Boolean(leader && leader.hit && !leader.unique)
  const state = resolveState(confidence, ambiguous, DEFAULT_RESOLVE)
  const reasons = descriptor.quality.reasons.slice()

  if (ambiguous && leader) {
    reasons.push('en guclu strateji ' + leader.matches + ' eleman buluyor')
  }
  if (!probes.some((entry) => entry.unique)) {
    reasons.push('hicbir strateji elemani tek basina isaret etmiyor')
  }

  const level = levelOf(state, descriptor.quality.tier)

  return {
    level,
    score: descriptor.quality.score,
    tier: descriptor.quality.tier,
    state,
    confidence,
    ambiguous,
    strategies: probes.filter((entry) => entry.hit).map((entry) => entry.kind),
    reasons,
    alternatives: level === 'strong' ? [] : alternatives(element, index, raw)
  }
}

export function blocked(reasons: string[]): StepAdvice {
  return {
    level: 'blocked',
    score: 0,
    tier: 'weak',
    state: 'not-found',
    confidence: 0,
    ambiguous: false,
    strategies: [],
    reasons,
    alternatives: []
  }
}

export function plain(): StepAdvice {
  return {
    level: 'strong',
    score: 1,
    tier: 'strong',
    state: 'exact',
    confidence: 1,
    ambiguous: false,
    strategies: [],
    reasons: [],
    alternatives: []
  }
}

export function probe(
  descriptor: Descriptor,
  element: ElementModel,
  index: ModelIndex
): StrategyProbe[] {
  const ref = element.identity.ref
  const out: StrategyProbe[] = []

  for (const payload of descriptor.strategies) {
    const strategy = strategyByKind(payload.kind)
    if (!strategy) continue

    const found = strategy.match(payload, index)
    const hit = found.some((candidate) => candidate.identity.ref === ref)

    out.push({
      kind: payload.kind,
      weight: payload.dynamic ? payload.weight * 0.4 : payload.weight,
      matches: found.length,
      hit,
      unique: hit && found.length === 1
    })
  }

  return out
}

export function alternatives(
  element: ElementModel,
  index: ModelIndex,
  raw: RawElement | null
): TargetOption[] {
  const out: TargetOption[] = []

  for (const candidate of candidates(element, raw)) {
    const found = matchQuery(candidate.query, index)
    const position = found.findIndex((entry) => entry.identity.ref === element.identity.ref)
    if (position < 0) continue

    const unique = found.length === 1
    const query: StepQuery = unique ? candidate.query : { ...candidate.query, nth: position }

    out.push({
      id: digest([candidate.query.kind, candidate.query.value, String(position)]),
      label: QUERY_LABELS[candidate.query.kind] + ': ' + candidate.query.value,
      detail: unique
        ? 'sayfada tek eslesme'
        : found.length + ' eslesme, ' + (position + 1) + '. sira sabitlendi',
      matches: found.length,
      unique,
      score: unique ? QUERY_SCORES[candidate.query.kind] : QUERY_SCORES[candidate.query.kind] * 0.6,
      target: {
        kind: 'query',
        label: QUERY_LABELS[candidate.query.kind] + ' "' + candidate.query.value + '"',
        descriptorId: '',
        descriptor: null,
        query,
        ordinal: -1
      }
    })
  }

  return out.sort((a, b) => b.score - a.score).slice(0, 4)
}

export function optionTarget(options: readonly TargetOption[], id: string): StepTarget | null {
  return options.find((option) => option.id === id)?.target ?? null
}

function candidates(element: ElementModel, raw: RawElement | null): { query: StepQuery }[] {
  const tag = element.tag
  const role = element.attrs['role'] || element.accessibility?.role || ''
  const out: { query: StepQuery }[] = []

  const testAttribute = raw?.testAttribute || ''
  const testId = raw?.testId || ''
  if (testId) {
    out.push({ query: query('test-id', testId, testAttribute, '', '') })
  }

  const elementId = element.attrs['id'] || raw?.elementId || ''
  if (elementId) out.push({ query: query('element-id', elementId, '', '', '') })

  const fieldName = element.attrs['name'] || raw?.fieldName || ''
  if (fieldName) out.push({ query: query('field-name', fieldName, '', '', '') })

  const name = element.accessibility?.name || element.attrs['aria-label'] || raw?.label || ''
  if (name) out.push({ query: query('accessible-name', name, '', '', role) })

  const text = element.text || raw?.text || ''
  if (text) out.push({ query: query('text', text, '', tag, '') })

  return out
}

function query(
  kind: QueryKind,
  value: string,
  attribute: string,
  tag: string,
  role: string
): StepQuery {
  return { kind, value: trim(value), attribute, tag, role, nth: -1 }
}

function trim(value: string): string {
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length > 64 ? text.slice(0, 64) : text
}

function levelOf(state: MatchState, tier: QualityTier): AdviceLevel {
  if (state === 'not-found') return 'blocked'
  if (state === 'low-confidence' || tier === 'weak') return 'weak'
  return 'strong'
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}
