import { isPressableKey } from '../action'
import type { ActionKind } from '../action'
import type { RawElement, RawInteraction, RecordIntent, RecordOptions } from './types'

const ROOT_TAGS: ReadonlySet<string> = new Set(['', 'body', 'html', '#document'])

const ELEMENT_KINDS: ReadonlySet<ActionKind> = new Set<ActionKind>([
  'click',
  'double-click',
  'right-click',
  'hover',
  'type',
  'clear-type',
  'select-option',
  'upload'
])

export function normalize(raw: RawInteraction, options: RecordOptions): RecordIntent | null {
  const base = {
    raw,
    at: raw.at,
    text: '',
    key: '',
    url: '',
    optionValue: '',
    files: [] as string[],
    deltaY: 0,
    optionalElement: false,
    label: labelOf(raw.element)
  }

  if (raw.kind === 'navigate') {
    if (!raw.url) return null
    return { ...base, kind: 'navigate', url: raw.url, needsElement: false }
  }

  if (raw.kind === 'scroll') {
    if (!options.captureScroll) return null
    if (Math.abs(raw.deltaY) < options.scrollThreshold) return null
    return {
      ...base,
      kind: 'scroll',
      deltaY: raw.deltaY,
      needsElement: false,
      optionalElement: addressable(raw.element)
    }
  }

  if (raw.kind === 'key') {
    if (!options.captureKeys) return null
    if (!raw.key || !isPressableKey(raw.key)) return null
    return {
      ...base,
      kind: 'press-key',
      key: raw.key,
      needsElement: false,
      optionalElement: addressable(raw.element)
    }
  }

  if (!raw.element) return null

  if (raw.kind === 'input') {
    if (!raw.text) return null
    return { ...base, kind: 'clear-type', text: raw.text, needsElement: true }
  }

  if (raw.kind === 'select') {
    if (!raw.optionValue && !raw.optionLabel) return null
    return {
      ...base,
      kind: 'select-option',
      optionValue: raw.optionValue || raw.optionLabel,
      needsElement: true
    }
  }

  if (raw.kind === 'upload') {
    if (!raw.files.length) return null
    return { ...base, kind: 'upload', files: raw.files.slice(), needsElement: true }
  }

  if (raw.kind === 'toggle') return { ...base, kind: 'click', needsElement: true }

  if (raw.kind === 'double-click') return { ...base, kind: 'double-click', needsElement: true }

  if (raw.kind === 'right-click') return { ...base, kind: 'right-click', needsElement: true }

  if (raw.kind === 'click') return { ...base, kind: 'click', needsElement: true }

  return null
}

export function needsElement(kind: ActionKind): boolean {
  return ELEMENT_KINDS.has(kind)
}

export function addressable(element: RawElement | null): boolean {
  if (!element) return false
  return !ROOT_TAGS.has(element.tag)
}

export function sourceKey(raw: RawInteraction): string {
  if (!raw.backendNodeId) return ''
  return raw.sessionId + '|' + raw.backendNodeId
}

const FIELD_TAGS: ReadonlySet<string> = new Set(['input', 'select', 'textarea'])

export function labelOf(element: RawElement | null): string {
  if (!element) return ''

  const parts = FIELD_TAGS.has(element.tag)
    ? [element.label, element.placeholder, element.fieldName, element.elementId, element.testId]
    : [
        element.label,
        element.text,
        element.placeholder,
        element.testId,
        element.fieldName,
        element.elementId
      ]

  const trimmed = (parts.find((part) => part.trim() !== '') ?? '').replace(/\s+/g, ' ').trim()
  if (trimmed.length > 48) return trimmed.slice(0, 48) + '…'
  return trimmed || element.tag
}
