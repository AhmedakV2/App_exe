import type {
  Scenario,
  ScenarioStep,
  StepKind,
  StepTarget,
  TargetKind
} from '../../../../main/scenario/types'
import { DEFAULT_DEFAULTS, SCENARIO_VERSION } from '../../../../main/scenario/types'

export const ADD_KINDS: StepKind[] = [
  'click',
  'double-click',
  'right-click',
  'hover',
  'type',
  'clear-type',
  'press-key',
  'scroll',
  'select-option',
  'upload',
  'navigate',
  'wait',
  'refresh',
  'assert'
]

export const TARGET_KINDS: TargetKind[] = ['descriptor', 'inline-descriptor', 'query', 'ordinal']

export const KIND_TITLES: Record<string, string> = {
  click: 'Tıkla',
  'double-click': 'Çift tıkla',
  'right-click': 'Sağ tıkla',
  hover: 'Üzerine gel',
  type: 'Yaz',
  'clear-type': 'Temizle ve yaz',
  'press-key': 'Tuşa bas',
  scroll: 'Kaydır',
  'select-option': 'Seçenek seç',
  upload: 'Dosya yükle',
  navigate: 'Adrese git',
  wait: 'Bekle',
  refresh: 'Sayfayı yenile',
  assert: 'Doğrula'
}

export const ELEMENT_KINDS: ReadonlySet<string> = new Set([
  'click',
  'double-click',
  'right-click',
  'hover',
  'type',
  'clear-type',
  'select-option',
  'upload'
])

export const TARGETLESS_KINDS: ReadonlySet<string> = new Set([
  'navigate',
  'wait',
  'refresh',
  'assert'
])

export const ELEMENT_ASSERTIONS: ReadonlySet<string> = new Set([
  'element-exists',
  'element-absent',
  'element-visible',
  'element-enabled',
  'element-checked',
  'element-count',
  'text-equals',
  'text-contains',
  'value-equals',
  'attribute-equals'
])

let seq = 0

function uid(prefix: string): string {
  seq += 1
  return (
    prefix + Date.now().toString(36) + seq.toString(36) + Math.random().toString(36).slice(2, 6)
  )
}

function renewIds(step: ScenarioStep): ScenarioStep {
  return { ...step, id: uid('st-'), steps: step.steps.map(renewIds) }
}

export function cloneStep(step: ScenarioStep): ScenarioStep {
  return renewIds(JSON.parse(JSON.stringify(step)) as ScenarioStep)
}

export function typing(node: EventTarget | null): boolean {
  if (!(node instanceof HTMLElement)) return false
  if (node.isContentEditable) return true
  const tag = node.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

let clipboard: ScenarioStep | null = null

export function readClip(): ScenarioStep | null {
  return clipboard
}

export function writeClip(step: ScenarioStep): ScenarioStep {
  clipboard = cloneStep(step)
  return clipboard
}

export function blankTarget(kind: TargetKind): StepTarget {
  return {
    kind,
    label: '',
    descriptorId: '',
    descriptor: null,
    query:
      kind === 'query'
        ? { kind: 'test-id', value: '', attribute: '', tag: '', role: '', nth: -1 }
        : null,
    ordinal: kind === 'ordinal' ? 0 : -1
  }
}

export function blankStep(kind: StepKind, title: string): ScenarioStep {
  return {
    id: uid('st-'),
    kind,
    title,
    target: ELEMENT_KINDS.has(kind) ? blankTarget('query') : null,
    assertion:
      kind === 'assert'
        ? {
            kind: 'url-matches',
            target: null,
            expected: '',
            attribute: '',
            count: 0,
            soft: false,
            message: ''
          }
        : null,
    condition: null,
    steps: [],
    text: '',
    key: '',
    url: '',
    deltaY: 0,
    optionValue: '',
    files: [],
    waitMs: kind === 'wait' ? 1000 : 0,
    timeoutMs: DEFAULT_DEFAULTS.stepTimeoutMs,
    retries: DEFAULT_DEFAULTS.retries,
    scanLevel: null,
    mode: null,
    continueOnFailure: false,
    allowLowConfidence: false,
    expectState: null
  }
}

export function blankScenario(baseUrl: string): Scenario {
  const first = blankStep('navigate', KIND_TITLES['navigate'])
  first.url = baseUrl
  return {
    version: SCENARIO_VERSION,
    id: uid('sc-'),
    title: 'Yeni senaryo',
    description: '',
    baseUrl,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    defaults: { ...DEFAULT_DEFAULTS },
    steps: [first]
  }
}

export function mapSteps(
  steps: ScenarioStep[],
  fn: (step: ScenarioStep) => ScenarioStep
): ScenarioStep[] {
  return steps.map((step) => {
    const next = fn(step)
    if (!next.steps.length) return next
    return { ...next, steps: mapSteps(next.steps, fn) }
  })
}

export function flatSteps(
  steps: ScenarioStep[],
  depth = 0
): { step: ScenarioStep; depth: number }[] {
  const out: { step: ScenarioStep; depth: number }[] = []
  for (const step of steps) {
    out.push({ step, depth })
    if (step.steps.length) out.push(...flatSteps(step.steps, depth + 1))
  }
  return out
}

export function dropStep(steps: ScenarioStep[], id: string): ScenarioStep[] {
  return steps
    .filter((step) => step.id !== id)
    .map((step) => (step.steps.length ? { ...step, steps: dropStep(step.steps, id) } : step))
}

export function shiftStep(steps: ScenarioStep[], id: string, offset: number): ScenarioStep[] {
  const index = steps.findIndex((step) => step.id === id)
  if (index >= 0) {
    const target = index + offset
    if (target < 0 || target >= steps.length) return steps
    const next = steps.slice()
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    return next
  }
  return steps.map((step) =>
    step.steps.length ? { ...step, steps: shiftStep(step.steps, id, offset) } : step
  )
}

export function findStep(steps: ScenarioStep[], id: string): ScenarioStep | null {
  for (const step of steps) {
    if (step.id === id) return step
    const nested = findStep(step.steps, id)
    if (nested) return nested
  }
  return null
}

export function holdsStep(step: ScenarioStep, id: string): boolean {
  return step.id === id || step.steps.some((child) => holdsStep(child, id))
}

export function placeStep(
  steps: ScenarioStep[],
  targetId: string,
  item: ScenarioStep,
  after: boolean
): ScenarioStep[] {
  const index = steps.findIndex((step) => step.id === targetId)
  if (index >= 0) {
    const next = steps.slice()
    next.splice(index + (after ? 1 : 0), 0, item)
    return next
  }
  return steps.map((step) =>
    step.steps.length ? { ...step, steps: placeStep(step.steps, targetId, item, after) } : step
  )
}

export const NUMERIC_KINDS: ReadonlySet<string> = new Set(['scroll', 'wait', 'hover'])

export function valueLabel(kind: StepKind): string {
  if (kind === 'type' || kind === 'clear-type') return 'Metin'
  if (kind === 'press-key') return 'Tuş'
  if (kind === 'navigate') return 'Adres'
  if (kind === 'select-option') return 'Seçenek'
  if (kind === 'scroll') return 'Kaydırma (piksel)'
  if (kind === 'upload') return 'Dosya yolları (virgülle)'
  if (kind === 'wait') return 'Bekleme (ms)'
  if (kind === 'hover') return 'İmleç süresi (ms)'
  return ''
}

export function valueOf(step: ScenarioStep): string {
  if (step.kind === 'press-key') return step.key
  if (step.kind === 'navigate') return step.url
  if (step.kind === 'select-option') return step.optionValue
  if (step.kind === 'scroll') return String(step.deltaY)
  if (step.kind === 'upload') return step.files.join(', ')
  if (step.kind === 'wait' || step.kind === 'hover') return String(step.waitMs)
  return step.text
}

export function patchValue(kind: StepKind, value: string): Partial<ScenarioStep> {
  if (kind === 'press-key') return { key: value }
  if (kind === 'navigate') return { url: value }
  if (kind === 'select-option') return { optionValue: value }
  if (kind === 'scroll') return { deltaY: intOf(value, 0) }
  if (kind === 'wait' || kind === 'hover') return { waitMs: Math.max(0, intOf(value, 0)) }
  if (kind === 'upload') {
    return {
      files: value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
    }
  }
  return { text: value }
}

export function intOf(value: string, fallback: number): number {
  const parsed = Number(value.trim())
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback
}
