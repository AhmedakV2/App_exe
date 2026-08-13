import type { ScanLevel } from '../discovery'
import type { Descriptor } from '../identity'
import { digest } from '../model'
import { migrateScenario } from './migrate'
import {
  ASSERTION_KINDS,
  DEFAULT_DEFAULTS,
  ELEMENT_ASSERTION_KINDS,
  ELEMENT_STEP_KINDS,
  SCENARIO_VERSION,
  STEP_KINDS,
  type Assertion,
  type AssertionKind,
  type ConditionKind,
  type ExpectedState,
  type Scenario,
  type ScenarioDefaults,
  type ScenarioIssue,
  type ScenarioReport,
  type ScenarioStep,
  type StepCondition,
  type StepKind,
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
    timeoutMs: clamp(num(source['timeoutMs'], defaults.stepTimeoutMs), 0, MAX_TIMEOUT_MS),
    retries: clamp(num(source['retries'], defaults.retries), 0, MAX_RETRIES),
    scanLevel:
      source['scanLevel'] === undefined ? null : level(source['scanLevel'], defaults.scanLevel),
    continueOnFailure: bool(source['continueOnFailure'], false),
    allowLowConfidence: bool(source['allowLowConfidence'], defaults.allowLowConfidence),
    expectState: normalizeExpected(source['expectState'], defaults.scanLevel)
  }
}

function normalizeTarget(source: Record<string, unknown>): StepTarget | null {
  const nested = asRecord(source['target'])
  const descriptorId = str(nested['descriptorId'] ?? source['descriptorId'])
  const descriptor = descriptorOf(nested['descriptor'] ?? source['descriptor'])
  const ordinalRaw = nested['ordinal'] ?? source['ordinal'] ?? nested['index'] ?? source['index']
  const ordinal = typeof ordinalRaw === 'number' && Number.isInteger(ordinalRaw) ? ordinalRaw : -1
  const label = str(nested['label'] ?? source['label'])

  if (descriptor) {
    return {
      kind: 'inline-descriptor',
      label: label || descriptor.target.name || descriptor.target.tag,
      descriptorId: descriptor.id,
      descriptor,
      ordinal
    }
  }
  if (descriptorId) {
    return {
      kind: 'descriptor',
      label: label || descriptorId,
      descriptorId,
      descriptor: null,
      ordinal
    }
  }
  if (ordinal >= 0) {
    return {
      kind: 'ordinal',
      label: label || 'sira ' + ordinal,
      descriptorId: '',
      descriptor: null,
      ordinal
    }
  }
  return null
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

function describe(
  kind: StepKind,
  source: Record<string, unknown>,
  target: StepTarget | null
): string {
  const label = target ? ' ' + target.label : ''
  if (kind === 'navigate') return 'Adres: ' + str(source['url'])
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

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, Math.round(value)))
}

function level(value: unknown, fallback: ScanLevel): ScanLevel {
  return value === 0 || value === 1 || value === 2 || value === 3 ? value : fallback
}
