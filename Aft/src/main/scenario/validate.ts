import { DEFAULT_WAIT_MS, MAX_WAIT_MS, type InputMode } from '../action'
import type { ScanLevel } from '../discovery'
import type { Descriptor } from '../identity'
import { digest } from '../model'
import { migrateScenario } from './migrate'
import {
  ASSERTION_KINDS,
  DEFAULT_DEFAULTS,
  ELEMENT_ASSERTION_KINDS,
  ELEMENT_STEP_KINDS,
  QUERY_KINDS,
  SCENARIO_VERSION,
  STEP_KINDS,
  type Assertion,
  type AssertionKind,
  type ConditionKind,
  type ExpectedState,
  type QueryKind,
  type Scenario,
  type ScenarioDefaults,
  type ScenarioIssue,
  type ScenarioReport,
  type ScenarioStep,
  type StepCondition,
  type StepKind,
  type StepQuery,
  type StepTarget
} from './types'

const CONDITION_KINDS: readonly ConditionKind[] = [
  'always',
  'previous-passed',
  'previous-failed',
  'assertion-passes',
  'assertion-fails'
]

const GROUP_DEPTH = 4

const MAX_RETRIES = 10

const MAX_TIMEOUT_MS = 600000

export class ScenarioError extends Error {
  constructor(
    message: string,
    readonly issues: ScenarioIssue[] = []
  ) {
    super(message)
    this.name = 'ScenarioError'
  }
}

export function parseScenario(raw: unknown): Scenario {
  const source = migrateScenario(asRecord(raw))
  const defaults = normalizeDefaults(source['defaults'])
  const steps = normalizeSteps(source['steps'], defaults, 'steps', 0)
  const title = str(source['title'], 'Adsiz senaryo')
  const baseUrl = str(source['baseUrl'])

  return {
    version: SCENARIO_VERSION,
    id: str(source['id']) || digest([title, baseUrl, steps.length]),
    title,
    description: str(source['description']),
    baseUrl,
    createdAt: num(source['createdAt'], Date.now()),
    updatedAt: num(source['updatedAt'], Date.now()),
    defaults,
    steps
  }
}

export function validateScenario(scenario: Scenario): ScenarioReport {
  const errors: ScenarioIssue[] = []
  const warnings: ScenarioIssue[] = []
  const ids = new Set<string>()

  if (!scenario.steps.length) errors.push({ path: 'steps', message: 'senaryo bos' })
  if (!scenario.baseUrl && !scenario.steps.some((step) => step.kind === 'navigate')) {
    warnings.push({ path: 'baseUrl', message: 'baslangic adresi yok, ilk adres adimi gerekli' })
  }

  inspect(scenario.steps, 'steps', ids, errors, warnings)

  return { ok: errors.length === 0, errors, warnings }
}

export function assertScenario(scenario: Scenario): Scenario {
  const report = validateScenario(scenario)
  if (report.ok) return scenario

  const detail = report.errors.map((issue) => issue.path + ': ' + issue.message).join(', ')
  throw new ScenarioError('Senaryo dogrulanamadi: ' + detail, report.errors)
}

function inspect(
  steps: readonly ScenarioStep[],
  path: string,
  ids: Set<string>,
  errors: ScenarioIssue[],
  warnings: ScenarioIssue[]
): void {
  steps.forEach((step, position) => {
    const at = path + '[' + position + ']'

    if (ids.has(step.id)) errors.push({ path: at, message: 'adim kimligi tekrarli: ' + step.id })
    ids.add(step.id)

    if (ELEMENT_STEP_KINDS.includes(step.kind) && !step.target) {
      errors.push({ path: at, message: step.kind + ' adimi hedefsiz' })
    }
    if (step.kind === 'navigate' && !step.url) {
      errors.push({ path: at, message: 'adres adimi bos' })
    }
    if (step.kind === 'press-key' && !step.key) {
      errors.push({ path: at, message: 'tus degeri bos' })
    }
    if (step.kind === 'type' && !step.text) {
      errors.push({ path: at, message: 'yazilacak metin bos' })
    }
    if (step.kind === 'select-option' && !step.optionValue) {
      errors.push({ path: at, message: 'secenek degeri bos' })
    }
    if (step.kind === 'upload' && !step.files.length) {
      errors.push({ path: at, message: 'dosya listesi bos' })
    }
    if (step.kind === 'wait' && step.waitMs <= 0) {
      errors.push({ path: at, message: 'bekleme suresi bos' })
    }
    if (step.kind === 'wait' && step.timeoutMs > 0 && step.timeoutMs < step.waitMs) {
      warnings.push({ path: at, message: 'zaman asimi bekleme suresinden kisa' })
    }
    if (step.kind === 'assert' && !step.assertion) {
      errors.push({ path: at, message: 'dogrulama tanimi yok' })
    }
    if (step.kind === 'group' && !step.steps.length) {
      errors.push({ path: at, message: 'grup bos' })
    }
    if (step.assertion) inspectAssertion(step.assertion, at + '.assertion', errors)
    if (step.condition?.kind.startsWith('assertion') && !step.condition.assertion) {
      errors.push({ path: at + '.condition', message: 'kosul dogrulamasi tanimsiz' })
    }
    if (step.target?.kind === 'ordinal') {
      warnings.push({ path: at, message: 'sira ile hedefleme kalici degil, descriptor onerilir' })
    }
    if (step.target?.descriptor && step.target.descriptor.quality.tier === 'weak') {
      warnings.push({ path: at, message: 'kimlik kalitesi dusuk' })
    }
    if (step.steps.length) inspect(step.steps, at + '.steps', ids, errors, warnings)
  })
}

function inspectAssertion(assertion: Assertion, path: string, errors: ScenarioIssue[]): void {
  if (ELEMENT_ASSERTION_KINDS.includes(assertion.kind) && !assertion.target) {
    errors.push({ path, message: assertion.kind + ' dogrulamasi hedefsiz' })
  }
  if (assertion.kind === 'attribute-equals' && !assertion.attribute) {
    errors.push({ path, message: 'nitelik adi bos' })
  }
  if (assertion.kind === 'url-matches' && !assertion.expected) {
    errors.push({ path, message: 'adres kalibi bos' })
  }
}

function normalizeDefaults(raw: unknown): ScenarioDefaults {
  const source = asRecord(raw)
  return {
    scanLevel: level(source['scanLevel'], DEFAULT_DEFAULTS.scanLevel),
    stepTimeoutMs: clamp(
      num(source['stepTimeoutMs'], DEFAULT_DEFAULTS.stepTimeoutMs),
      0,
      MAX_TIMEOUT_MS
    ),
    retries: clamp(num(source['retries'], DEFAULT_DEFAULTS.retries), 0, MAX_RETRIES),
    stopOnFailure: bool(source['stopOnFailure'], DEFAULT_DEFAULTS.stopOnFailure),
    verifyState: bool(source['verifyState'], DEFAULT_DEFAULTS.verifyState),
    allowLowConfidence: bool(source['allowLowConfidence'], DEFAULT_DEFAULTS.allowLowConfidence)
  }
}

function normalizeSteps(
  raw: unknown,
  defaults: ScenarioDefaults,
  path: string,
  depth: number
): ScenarioStep[] {
  if (!Array.isArray(raw)) return []
  if (depth > GROUP_DEPTH) throw new ScenarioError('Grup derinligi asildi: ' + path)

  return raw.map((entry, position) => normalizeStep(entry, defaults, path, position, depth))
}

function normalizeStep(
  raw: unknown,
  defaults: ScenarioDefaults,
  path: string,
  position: number,
  depth: number
): ScenarioStep {
  const source = asRecord(raw)
  const kind = stepKind(source['kind'] ?? source['action'])
  const target = normalizeTarget(source)
  const title = str(source['title']) || describe(kind, source, target)

  return {
    id: str(source['id']) || digest([path, position, kind, title]),
    kind,
    title,
    target,
    assertion: normalizeAssertion(source['assertion'] ?? (kind === 'assert' ? source : null)),
    condition: normalizeCondition(source['condition']),
    steps: normalizeSteps(source['steps'], defaults, path + '[' + position + '].steps', depth + 1),
    text: str(source['text']),
    key: str(source['key']),
    url: str(source['url']),
    deltaY: num(source['deltaY'], 0),
    optionValue: str(source['optionValue']),
    files: strList(source['files']),
    waitMs: waitOf(kind, source),
    timeoutMs: clamp(num(source['timeoutMs'], defaults.stepTimeoutMs), 0, MAX_TIMEOUT_MS),
    retries: clamp(num(source['retries'], defaults.retries), 0, MAX_RETRIES),
    scanLevel:
      source['scanLevel'] === undefined ? null : level(source['scanLevel'], defaults.scanLevel),
    mode: inputMode(source['mode']),
    continueOnFailure: bool(source['continueOnFailure'], false),
    allowLowConfidence: bool(source['allowLowConfidence'], defaults.allowLowConfidence),
    expectState: normalizeExpected(source['expectState'], defaults.scanLevel)
  }
}

const QUERY_FIELDS: readonly { field: string; kind: QueryKind }[] = [
  { field: 'testId', kind: 'test-id' },
  { field: 'elementId', kind: 'element-id' },
  { field: 'fieldName', kind: 'field-name' },
  { field: 'name', kind: 'accessible-name' },
  { field: 'text', kind: 'text' }
]

const FLAT_QUERY_FIELDS: readonly string[] = ['testId', 'elementId', 'fieldName']

function normalizeTarget(source: Record<string, unknown>): StepTarget | null {
  const nested = asRecord(source['target'])
  const descriptorId = str(nested['descriptorId'] ?? source['descriptorId'])
  const descriptor = descriptorOf(nested['descriptor'] ?? source['descriptor'])
  const query = normalizeQuery(nested, source)
  const ordinalRaw = nested['ordinal'] ?? source['ordinal'] ?? nested['index'] ?? source['index']
  const ordinal = typeof ordinalRaw === 'number' && Number.isInteger(ordinalRaw) ? ordinalRaw : -1
  const label = str(nested['label'] ?? source['label'])

  if (descriptor) {
    return {
      kind: 'inline-descriptor',
      label: label || descriptor.target.name || descriptor.target.tag,
      descriptorId: descriptor.id,
      descriptor,
      query: null,
      ordinal
    }
  }
  if (descriptorId) {
    return {
      kind: 'descriptor',
      label: label || descriptorId,
      descriptorId,
      descriptor: null,
      query: null,
      ordinal
    }
  }
  if (query) {
    return {
      kind: 'query',
      label: label || query.kind + ' "' + query.value + '"',
      descriptorId: '',
      descriptor: null,
      query,
      ordinal
    }
  }
  if (ordinal >= 0) {
    return {
      kind: 'ordinal',
      label: label || 'sira ' + ordinal,
      descriptorId: '',
      descriptor: null,
      query: null,
      ordinal
    }
  }
  return null
}

function normalizeQuery(
  nested: Record<string, unknown>,
  source: Record<string, unknown>
): StepQuery | null {
  const structured = asRecord(nested['query'])
  const structuredKind = str(structured['kind'])
  const structuredValue = str(structured['value'])

  if (QUERY_KINDS.includes(structuredKind as QueryKind) && structuredValue) {
    return buildQuery(structuredKind as QueryKind, structuredValue, structured)
  }

  const explicit = str(nested['query'])
  const declared = str(nested['queryKind'])
  const kind = QUERY_KINDS.includes(declared as QueryKind) ? (declared as QueryKind) : null

  if (kind && explicit) return buildQuery(kind, explicit, nested)
  if (explicit) return buildQuery('text', explicit, nested)

  for (const entry of QUERY_FIELDS) {
    const value = str(nested[entry.field])
    if (value) return buildQuery(entry.kind, value, nested)
  }
  for (const entry of QUERY_FIELDS) {
    if (!FLAT_QUERY_FIELDS.includes(entry.field)) continue
    const value = str(source[entry.field])
    if (value) return buildQuery(entry.kind, value, source, true)
  }
  return null
}

function buildQuery(
  kind: QueryKind,
  value: string,
  source: Record<string, unknown>,
  flat = false
): StepQuery {
  const nth = num(source['nth'], -1)

  return {
    kind,
    value,
    attribute: flat ? '' : str(source['attribute']),
    tag: str(source['tag']).toLowerCase(),
    role: str(source['role']),
    nth: Number.isInteger(nth) && nth >= 0 ? nth : -1
  }
}

function normalizeAssertion(raw: unknown): Assertion | null {
  const source = asRecord(raw)
  const kind = source['assert'] ?? source['kind']
  if (typeof kind !== 'string' || !ASSERTION_KINDS.includes(kind as AssertionKind)) return null

  return {
    kind: kind as AssertionKind,
    target: normalizeTarget(source),
    expected: str(source['expected']),
    attribute: str(source['attribute']),
    count: num(source['count'], 1),
    soft: bool(source['soft'], false),
    message: str(source['message'])
  }
}

function normalizeCondition(raw: unknown): StepCondition | null {
  const source = asRecord(raw)
  const kind = source['kind']
  if (typeof kind !== 'string' || !CONDITION_KINDS.includes(kind as ConditionKind)) return null
  if (kind === 'always') return null

  return {
    kind: kind as ConditionKind,
    assertion: normalizeAssertion(source['assertion'])
  }
}

function normalizeExpected(raw: unknown, fallback: ScanLevel): ExpectedState | null {
  if (raw === undefined || raw === null) return null
  const source = asRecord(raw)

  return {
    urlPattern: str(source['urlPattern']),
    titlePattern: str(source['titlePattern']),
    minInteractive: num(source['minInteractive'], 0),
    maxBlindSpots: num(source['maxBlindSpots'], Number.MAX_SAFE_INTEGER),
    scanLevel: level(source['scanLevel'], fallback)
  }
}

function waitOf(kind: StepKind, source: Record<string, unknown>): number {
  const explicit = source['waitMs'] ?? source['durationMs'] ?? source['delayMs']
  if (explicit !== undefined) return clamp(num(explicit, 0), 0, MAX_WAIT_MS)
  if (kind !== 'wait') return 0
  return clamp(num(source['timeoutMs'], DEFAULT_WAIT_MS), 0, MAX_WAIT_MS)
}

function describe(
  kind: StepKind,
  source: Record<string, unknown>,
  target: StepTarget | null
): string {
  const label = target ? ' ' + target.label : ''
  if (kind === 'navigate') return 'Adres: ' + str(source['url'])
  if (kind === 'wait') return 'Bekle: ' + waitOf(kind, source) + ' ms'
  if (kind === 'assert') {
    const nested = asRecord(source['assertion'])
    const name = str(nested['kind'] ?? nested['assert'] ?? source['assert'], 'tanimsiz')
    return 'Dogrulama: ' + name + label
  }
  return kind + label
}

function descriptorOf(raw: unknown): Descriptor | null {
  const source = asRecord(raw)
  return typeof source['id'] === 'string' && Array.isArray(source['strategies'])
    ? (raw as Descriptor)
    : null
}

function stepKind(raw: unknown): StepKind {
  const value = String(raw ?? '')
  if (!STEP_KINDS.includes(value as StepKind))
    throw new ScenarioError('Gecersiz adim turu: ' + value)
  return value as StepKind
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function strList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : []
}

function inputMode(value: unknown): InputMode | null {
  return value === 'real-input' || value === 'direct-call' ? value : null
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, Math.round(value)))
}

function level(value: unknown, fallback: ScanLevel): ScanLevel {
  return value === 0 || value === 1 || value === 2 || value === 3 ? value : fallback
}
