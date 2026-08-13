import { strategyByKind } from '../identity'
import type { Descriptor } from '../identity'
import type { ElementModel, ModelIndex } from '../model'
import type { TargetResolution, TargetResolver } from './TargetResolver'
import { ELEMENT_ASSERTION_KINDS, type Assertion, type AssertionRecord } from './types'

export interface AssertionOutcome {
  record: AssertionRecord
  resolution: TargetResolution | null
}

export class AssertionEngine {
  constructor(private readonly resolver: TargetResolver) {}

  evaluate(assertion: Assertion, index: ModelIndex, allowLowConfidence: boolean): AssertionOutcome {
    const origin = index.snapshot.origin

    if (assertion.kind === 'url-matches') {
      return this.plain(assertion, origin.url, matches(origin.url, assertion.expected))
    }
    if (assertion.kind === 'title-contains') {
      return this.plain(assertion, origin.title, contains(origin.title, assertion.expected))
    }
    if (!assertion.target || !ELEMENT_ASSERTION_KINDS.includes(assertion.kind)) {
      return this.plain(assertion, '', false, 'dogrulama hedefi yok')
    }

    const resolution = this.resolver.resolve(assertion.target, index, allowLowConfidence)
    const record = resolution.record

    if (!record) {
      return this.build(assertion, '', false, resolution, resolution.reason)
    }

    const present = record.state !== 'not-found'

    if (assertion.kind === 'element-absent') {
      return this.build(assertion, present ? 'var' : 'yok', !present, resolution)
    }
    if (assertion.kind === 'element-count') {
      const actual = countMatches(assertion.target.ordinal, resolution.descriptor, index)
      return this.build(assertion, String(actual), actual === assertion.count, resolution)
    }

    const element = resolution.element
    if (!element) {
      return this.build(
        assertion,
        present ? 'kararsiz' : 'yok',
        false,
        resolution,
        resolution.reason
      )
    }

    switch (assertion.kind) {
      case 'element-exists':
        return this.build(assertion, 'var', true, resolution)
      case 'element-visible':
        return this.build(
          assertion,
          element.visibility.state,
          element.visibility.state === 'visible',
          resolution
        )
      case 'element-enabled':
        return this.build(
          assertion,
          enabled(element) ? 'etkin' : 'devredisi',
          enabled(element),
          resolution
        )
      case 'element-checked':
        return this.build(
          assertion,
          String(element.checked),
          element.checked === (assertion.expected !== 'false'),
          resolution
        )
      case 'text-equals':
        return this.build(
          assertion,
          element.text,
          normalize(element.text) === normalize(assertion.expected),
          resolution
        )
      case 'text-contains':
        return this.build(
          assertion,
          element.text,
          normalize(element.text).includes(normalize(assertion.expected)),
          resolution
        )
      case 'value-equals':
        return this.build(
          assertion,
          element.value,
          element.value === assertion.expected,
          resolution
        )
      case 'attribute-equals': {
        const actual = element.attrs[assertion.attribute] ?? ''
        return this.build(assertion, actual, actual === assertion.expected, resolution)
      }
      default:
        return this.build(assertion, '', false, resolution, 'desteklenmeyen dogrulama')
    }
  }

  private plain(
    assertion: Assertion,
    actual: string,
    passed: boolean,
    reason = ''
  ): AssertionOutcome {
    return { record: this.record(assertion, actual, passed, reason), resolution: null }
  }

  private build(
    assertion: Assertion,
    actual: string,
    passed: boolean,
    resolution: TargetResolution,
    reason = ''
  ): AssertionOutcome {
    return { record: this.record(assertion, actual, passed, reason), resolution }
  }

  private record(
    assertion: Assertion,
    actual: string,
    passed: boolean,
    reason: string
  ): AssertionRecord {
    return {
      kind: assertion.kind,
      target: assertion.target?.label ?? '',
      expected: assertion.kind === 'element-count' ? String(assertion.count) : assertion.expected,
      actual,
      passed,
      soft: assertion.soft,
      message: assertion.message || reason || (passed ? 'dogrulandi' : 'beklenen deger tutmadi')
    }
  }
}

export function countMatches(
  ordinal: number,
  descriptor: Descriptor | null,
  index: ModelIndex
): number {
  if (!descriptor) return index.at(ordinal) ? 1 : 0

  const primary = descriptor.strategies
    .filter((entry) => !entry.dynamic)
    .sort((a, b) => b.weight - a.weight)[0]

  if (!primary) return 0

  const strategy = strategyByKind(primary.kind)
  if (!strategy) return 0

  const refs = new Set<string>()
  for (const element of strategy.match(primary, index)) refs.add(element.identity.ref)
  return refs.size
}

export function matches(value: string, pattern: string): boolean {
  if (!pattern) return true
  if (pattern.startsWith('/') && pattern.lastIndexOf('/') > 0) {
    const end = pattern.lastIndexOf('/')
    try {
      return new RegExp(pattern.slice(1, end), pattern.slice(end + 1)).test(value)
    } catch {
      return false
    }
  }
  if (pattern.includes('*')) {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
    return new RegExp('^' + escaped + '$', 'i').test(value)
  }
  return contains(value, pattern)
}

function contains(value: string, needle: string): boolean {
  return value.toLowerCase().includes(needle.toLowerCase())
}

function enabled(element: ElementModel): boolean {
  if (element.accessibility?.disabled) return false
  return element.attrs['disabled'] === undefined && element.attrs['aria-disabled'] !== 'true'
}

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}
