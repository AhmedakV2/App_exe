import type { ActionOutcome } from '../../action'
import type { GraphNode } from '../../discovery'
import { TEST_ATTRIBUTES } from '../../model/schema'
import type { FailureContext, QueryKind, StepResult, StepTarget } from '../../scenario'

const TEXT_LIMIT = 120
const LOG_LIMIT = 40

export interface CompactElement {
  ref: string
  ordinal: number
  tag: string
  role: string
  name: string
  text: string
  value: string
  testId: string
  elementId: string
  fieldName: string
  placeholder: string
  visible: boolean
  inViewport: boolean
  enabled: boolean
  target: StepTarget | null
}

function clean(raw: string): string {
  const flat = raw.replace(/\s+/g, ' ').trim()
  return flat.length > TEXT_LIMIT ? flat.slice(0, TEXT_LIMIT) : flat
}

function testIdOf(node: GraphNode): string {
  for (const name of TEST_ATTRIBUTES) {
    const value = node.attrs[name]
    if (value) return value
  }
  return ''
}

function query(kind: QueryKind, value: string): StepTarget {
  return {
    kind: 'query',
    label: value,
    descriptorId: '',
    descriptor: null,
    query: { kind, value, attribute: '', tag: '', role: '', nth: -1 },
    ordinal: -1
  }
}

function targetOf(element: CompactElement): StepTarget | null {
  if (element.testId) return query('test-id', element.testId)
  if (element.elementId) return query('element-id', element.elementId)
  if (element.fieldName) return query('field-name', element.fieldName)
  if (element.name) return query('accessible-name', element.name)
  if (element.text) return query('text', element.text)
  if (element.ordinal >= 0) {
    return {
      kind: 'ordinal',
      label: '#' + element.ordinal,
      descriptorId: '',
      descriptor: null,
      query: null,
      ordinal: element.ordinal
    }
  }
  return null
}

export function compactElement(node: GraphNode): CompactElement {
  const element: CompactElement = {
    ref: node.key,
    ordinal: node.index,
    tag: node.tag,
    role: node.ax?.role ?? '',
    name: clean(node.ax?.name ?? ''),
    text: clean(node.text),
    value: clean(node.value),
    testId: testIdOf(node),
    elementId: node.attrs['id'] ?? '',
    fieldName: node.attrs['name'] ?? '',
    placeholder: clean(node.attrs['placeholder'] ?? ''),
    visible: node.visible,
    inViewport: node.inViewport,
    enabled: !(node.ax?.disabled ?? false),
    target: null
  }
  element.target = targetOf(element)
  return element
}

export function compactOutcome(outcome: ActionOutcome): Record<string, unknown> {
  return {
    ok: outcome.ok,
    kind: outcome.kind,
    message: outcome.message,
    code: outcome.code,
    durationMs: outcome.durationMs,
    ref: outcome.target?.ref ?? '',
    ordinal: outcome.target?.ordinal ?? -1,
    navigated: outcome.navigation !== null,
    url: outcome.navigation?.url ?? '',
    ready: outcome.actionability?.ready ?? true,
    blocked:
      outcome.actionability && !outcome.actionability.ready ? outcome.actionability.reason : '',
    dialogs: outcome.dialogs.length,
    downloads: outcome.downloads.length
  }
}

export function compactStep(step: StepResult): Record<string, unknown> {
  return {
    stepId: step.stepId,
    index: step.index,
    kind: step.kind,
    title: step.title,
    status: step.status,
    message: step.message,
    attempts: step.attempts,
    durationMs: step.durationMs,
    matchState: step.resolution?.state ?? '',
    confidence: step.resolution?.confidence ?? 0,
    healed: step.resolution?.healed ?? false,
    contextId: step.contextId,
    children: step.children.map(compactStep)
  }
}

export function compactContext(context: FailureContext): Record<string, unknown> {
  return {
    id: context.id,
    runId: context.runId,
    scenarioId: context.scenarioId,
    stepId: context.stepId,
    stepTitle: context.stepTitle,
    capturedAt: context.capturedAt,
    url: context.url,
    title: context.title,
    message: context.message,
    scanLevel: context.scanLevel,
    matchState: context.resolution?.state ?? '',
    confidence: context.resolution?.confidence ?? 0,
    candidates: (context.resolution?.candidates ?? []).slice(0, 5),
    assertions: context.assertions,
    outcome: context.outcome ? compactOutcome(context.outcome) : null,
    blindSpots: context.blindSpots.map((spot) => spot.kind + ': ' + spot.detail),
    elements: context.elements.slice(0, LOG_LIMIT),
    elementsTotal: context.elements.length,
    screenshotBytes: context.screenshot.length
  }
}
