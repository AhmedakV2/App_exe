import type { Descriptor } from '../identity'
import { digest } from '../model'
import type { ElementModel } from '../model'
import type { Assertion, AssertionKind, ScenarioStep, StepKind, StepTarget } from '../scenario'
import type { AssertionOption, AssertionSpec, RecordIntent, RecordOptions } from './types'

const KIND_LABELS: Record<string, string> = {
  click: 'Tikla',
  'double-click': 'Cift tikla',
  'right-click': 'Sag tikla',
  hover: 'Uzerine gel',
  type: 'Yaz',
  'clear-type': 'Temizle ve yaz',
  'press-key': 'Tusa bas',
  scroll: 'Kaydir',
  'select-option': 'Sec',
  upload: 'Dosya yukle',
  navigate: 'Adres',
  wait: 'Bekle',
  assert: 'Dogrula',
  group: 'Grup'
}

const ASSERTION_LABELS: Record<AssertionKind, string> = {
  'element-exists': 'eleman var',
  'element-absent': 'eleman yok',
  'element-visible': 'eleman gorunur',
  'element-enabled': 'eleman etkin',
  'element-checked': 'eleman isaretli',
  'element-count': 'eleman sayisi',
  'text-equals': 'metin esit',
  'text-contains': 'metin iceriyor',
  'value-equals': 'deger esit',
  'attribute-equals': 'nitelik esit',
  'url-matches': 'adres kalibi',
  'title-contains': 'baslik iceriyor'
}

export function stepId(sessionId: string, order: number, kind: string, at: number): string {
  return digest([sessionId, String(order), kind, String(at)])
}

export function descriptorTarget(descriptor: Descriptor, label: string): StepTarget {
  return {
    kind: 'inline-descriptor',
    label: label || descriptor.target.name || descriptor.target.tag,
    descriptorId: descriptor.id,
    descriptor,
    query: null,
    ordinal: -1
  }
}

export function build(
  id: string,
  intent: RecordIntent,
  target: StepTarget | null,
  options: RecordOptions
): ScenarioStep {
  return {
    id,
    kind: intent.kind as StepKind,
    title: titleOf(intent.kind, target?.label ?? intent.label, intent),
    target,
    assertion: null,
    condition: null,
    steps: [],
    text: intent.text,
    key: intent.key,
    url: intent.url,
    deltaY: intent.deltaY,
    optionValue: intent.optionValue,
    files: intent.files.slice(),
    timeoutMs: options.stepTimeoutMs,
    retries: options.retries,
    scanLevel: null,
    mode: options.inputMode,
    continueOnFailure: false,
    allowLowConfidence: false,
    expectState: null
  }
}

export function waitStep(id: string, timeoutMs: number, options: RecordOptions): ScenarioStep {
  return {
    id,
    kind: 'wait',
    title: 'Bekle: ' + timeoutMs + ' ms',
    target: null,
    assertion: null,
    condition: null,
    steps: [],
    text: '',
    key: '',
    url: '',
    deltaY: 0,
    optionValue: '',
    files: [],
    timeoutMs,
    retries: 0,
    scanLevel: null,
    mode: options.inputMode,
    continueOnFailure: false,
    allowLowConfidence: false,
    expectState: null
  }
}

export function assertStep(id: string, assertion: Assertion, options: RecordOptions): ScenarioStep {
  return {
    id,
    kind: 'assert',
    title: 'Dogrula: ' + ASSERTION_LABELS[assertion.kind] + labelOf(assertion),
    target: null,
    assertion,
    condition: null,
    steps: [],
    text: '',
    key: '',
    url: '',
    deltaY: 0,
    optionValue: '',
    files: [],
    timeoutMs: options.stepTimeoutMs,
    retries: 0,
    scanLevel: null,
    mode: null,
    continueOnFailure: false,
    allowLowConfidence: false,
    expectState: null
  }
}

export function assertion(spec: AssertionSpec, target: StepTarget | null): Assertion {
  return {
    kind: spec.kind,
    target,
    expected: spec.expected,
    attribute: spec.attribute,
    count: spec.count,
    soft: spec.soft,
    message: ''
  }
}

export function assertionOptions(
  element: ElementModel | null,
  url: string,
  title: string
): AssertionOption[] {
  const out: AssertionOption[] = []

  if (element) {
    out.push(option('element-visible', '', '', 1, 'Eleman gorunur olmali'))
    out.push(option('element-exists', '', '', 1, 'Eleman sayfada bulunmali'))
    out.push(option('element-enabled', '', '', 1, 'Eleman etkin olmali'))

    const text = clip(element.text)
    if (text) out.push(option('text-contains', text, '', 1, 'Eleman metni "' + text + '" icermeli'))

    const value = clip(element.value)
    if (value) out.push(option('value-equals', value, '', 1, 'Alan degeri "' + value + '" olmali'))
  }

  if (url) out.push(option('url-matches', url, '', 1, 'Adres "' + url + '" kalibina uymali'))
  const head = clip(title)
  if (head) out.push(option('title-contains', head, '', 1, 'Baslik "' + head + '" icermeli'))

  return out
}

function option(
  kind: AssertionKind,
  expected: string,
  attribute: string,
  count: number,
  detail: string
): AssertionOption {
  return {
    id: digest([kind, expected, attribute]),
    label: ASSERTION_LABELS[kind],
    detail,
    spec: { kind, expected, attribute, count, soft: false }
  }
}

export function scrollTitle(deltaY: number, label: string): string {
  return KIND_LABELS['scroll'] + ': ' + deltaY + ' px' + (label ? ' (' + label + ')' : '')
}

function titleOf(kind: string, label: string, intent: RecordIntent): string {
  const head = KIND_LABELS[kind] ?? kind

  if (kind === 'navigate') return head + ': ' + intent.url
  if (kind === 'scroll') return scrollTitle(intent.deltaY, label)
  if (kind === 'press-key') return head + ': ' + intent.key + (label ? ' (' + label + ')' : '')
  if (kind === 'clear-type' || kind === 'type') {
    return head + ': ' + (label || 'alan') + ' = "' + clip(intent.text) + '"'
  }
  if (kind === 'select-option') {
    return head + ': ' + (label || 'liste') + ' = "' + clip(intent.optionValue) + '"'
  }
  if (kind === 'upload') return head + ': ' + (label || 'alan') + ' = ' + intent.files.join(', ')
  return head + (label ? ': ' + label : '')
}

function labelOf(assertion: Assertion): string {
  const target = assertion.target ? ' · ' + assertion.target.label : ''
  const expected = assertion.expected ? ' · "' + clip(assertion.expected) + '"' : ''
  return target + expected
}

function clip(value: string): string {
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length > 48 ? text.slice(0, 48) + '…' : text
}
