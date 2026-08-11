import type { ModelIndex } from '../model'
import type { ElementModel } from '../model'
import { isDynamicValue, isMeaningfulText, normalizeText } from './dynamic'
import { formSignature, nearestLabel, stableAnchor, structuralPath } from './signature'
import type { StrategyKind, StrategyPayload } from './types'

const MATCH_CAP = 64

const NEIGHBOUR_RADIUS = 220

export interface Strategy {
  kind: StrategyKind
  weight: number
  extract(element: ElementModel, index: ModelIndex): StrategyPayload | null
  match(payload: StrategyPayload, index: ModelIndex): ElementModel[]
}

export const STRATEGY_WEIGHTS: Record<StrategyKind, number> = {
  'test-attribute': 1,
  'element-id': 0.86,
  'form-field': 0.78,
  'accessible-name': 0.7,
  text: 0.56,
  structure: 0.42,
  neighborhood: 0.34
}

const testAttribute: Strategy = {
  kind: 'test-attribute',
  weight: STRATEGY_WEIGHTS['test-attribute'],
  extract(element, index) {
    const hit = index.testAttribute(element)
    if (!hit) return null
    return payload('test-attribute', hit.name + '=' + hit.value, {
      name: hit.name,
      value: hit.value
    })
  },
  match(record, index) {
    return cap(index.byAttr(record.parts['name'] ?? '', record.parts['value'] ?? ''))
  }
}

const elementId: Strategy = {
  kind: 'element-id',
  weight: STRATEGY_WEIGHTS['element-id'],
  extract(element) {
    const id = element.attrs['id']
    if (!id || isDynamicValue(id)) return null
    return payload('element-id', id, { id })
  },
  match(record, index) {
    return cap(index.byAttr('id', record.parts['id'] ?? ''))
  }
}

const formField: Strategy = {
  kind: 'form-field',
  weight: STRATEGY_WEIGHTS['form-field'],
  extract(element, index) {
    const name = element.attrs['name'] ?? ''
    if (!name || isDynamicValue(name)) return null
    return payload('form-field', name, {
      name,
      type: element.attrs['type'] ?? '',
      tag: element.tag,
      form: formSignature(element, index)
    })
  },
  match(record, index) {
    const name = record.parts['name'] ?? ''
    const type = record.parts['type'] ?? ''
    const tag = record.parts['tag'] ?? ''
    const form = record.parts['form'] ?? ''

    return cap(
      index.byAttr('name', name).filter((element) => {
        if (tag && element.tag !== tag) return false
        if (type && (element.attrs['type'] ?? '') !== type) return false
        if (!form) return true
        return formSignature(element, index) === form
      })
    )
  }
}

const accessibleName: Strategy = {
  kind: 'accessible-name',
  weight: STRATEGY_WEIGHTS['accessible-name'],
  extract(element) {
    const raw = element.accessibility?.name || element.attrs['aria-label'] || ''
    const normalized = normalizeText(raw, 64)
    if (!isMeaningfulText(normalized)) return null

    return payload('accessible-name', normalized, {
      name: normalized,
      role: element.attrs['role'] || element.accessibility?.role || ''
    })
  },
  match(record, index) {
    const role = record.parts['role'] ?? ''
    return cap(
      index.byName(record.parts['name'] ?? '').filter((element) => {
        if (!role) return true
        return (element.attrs['role'] || element.accessibility?.role || '') === role
      })
    )
  }
}

const textContent: Strategy = {
  kind: 'text',
  weight: STRATEGY_WEIGHTS.text,
  extract(element) {
    const normalized = normalizeText(element.text || element.value, 64)
    if (!isMeaningfulText(normalized)) return null
    return payload('text', normalized, { text: normalized, tag: element.tag })
  },
  match(record, index) {
    const text = record.parts['text'] ?? ''
    const tag = record.parts['tag'] ?? ''
    const exact = index.byText(text)
    if (exact.length) return cap(exact)

    return cap(
      index
        .byTag(tag)
        .filter((element) => normalizeText(element.text, 64).includes(text) && text.length >= 4)
    )
  }
}

const structure: Strategy = {
  kind: 'structure',
  weight: STRATEGY_WEIGHTS.structure,
  extract(element, index) {
    const path = structuralPath(element, index)
    if (!path) return null
    return payload('structure', path, {
      path,
      tag: element.tag,
      anchor: stableAnchor(element),
      depth: String(element.depth)
    })
  },
  match(record, index) {
    const path = record.parts['path'] ?? ''
    const tag = record.parts['tag'] ?? ''
    return cap(index.byTag(tag).filter((element) => structuralPath(element, index) === path))
  }
}

const neighborhood: Strategy = {
  kind: 'neighborhood',
  weight: STRATEGY_WEIGHTS.neighborhood,
  extract(element, index) {
    const label = nearestLabel(element, index)
    if (!isMeaningfulText(label)) return null

    return payload('neighborhood', label, {
      label,
      tag: element.tag,
      role: element.attrs['role'] || element.accessibility?.role || '',
      type: element.attrs['type'] ?? ''
    })
  },
  match(record, index) {
    const label = record.parts['label'] ?? ''
    const tag = record.parts['tag'] ?? ''
    const anchors = index.byText(label).concat(index.byName(label))
    if (!anchors.length) return []

    const seen = new Set<string>()
    const out: ElementModel[] = []

    for (const anchor of anchors.slice(0, 8)) {
      for (const near of index.near(anchor, NEIGHBOUR_RADIUS, 12)) {
        if (near.tag !== tag) continue
        if (seen.has(near.identity.ref)) continue
        seen.add(near.identity.ref)
        out.push(near)
      }
    }
    return cap(out)
  }
}

export const STRATEGY_CHAIN: readonly Strategy[] = [
  testAttribute,
  elementId,
  formField,
  accessibleName,
  textContent,
  structure,
  neighborhood
]

export function strategyByKind(kind: StrategyKind): Strategy | undefined {
  return STRATEGY_CHAIN.find((strategy) => strategy.kind === kind)
}

function payload(
  kind: StrategyKind,
  value: string,
  parts: Record<string, string>
): StrategyPayload {
  return {
    kind,
    value,
    parts,
    weight: STRATEGY_WEIGHTS[kind],
    dynamic: isDynamicValue(value)
  }
}

function cap(elements: ElementModel[]): ElementModel[] {
  return elements.length > MATCH_CAP ? elements.slice(0, MATCH_CAP) : elements
}
