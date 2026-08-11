import { SUPPORTED_MODEL_VERSIONS, type ElementModel, type GraphSnapshot } from './schema'

export type ValidationSeverity = 'error' | 'warning'

export interface ValidationIssue {
  severity: ValidationSeverity
  code: string
  ref: string
  detail: string
}

export interface ValidationReport {
  ok: boolean
  version: string
  checked: number
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
}

export class ModelValidationError extends Error {
  constructor(readonly report: ValidationReport) {
    super('Model dogrulama basarisiz: ' + report.errors.length + ' hata')
    this.name = 'ModelValidationError'
  }
}

export function validateSnapshot(snapshot: GraphSnapshot): ValidationReport {
  const errors: ValidationIssue[] = []
  const warnings: ValidationIssue[] = []
  const refs = new Set<string>()
  const ordinals = new Set<number>()
  const frames = new Set(snapshot.frames.map((frame) => frame.frameId))

  if (!SUPPORTED_MODEL_VERSIONS.includes(snapshot.modelVersion)) {
    errors.push(issue('error', 'unsupported-version', '', snapshot.modelVersion))
  }

  for (const element of snapshot.elements) {
    const ref = element.identity.ref
    if (refs.has(ref)) errors.push(issue('error', 'duplicate-ref', ref, 'tekrar eden referans'))
    refs.add(ref)

    if (element.identity.ordinal >= 0) {
      if (ordinals.has(element.identity.ordinal)) {
        errors.push(issue('error', 'duplicate-ordinal', ref, String(element.identity.ordinal)))
      }
      ordinals.add(element.identity.ordinal)
    }

    if (!element.identity.signature) {
      errors.push(issue('error', 'missing-signature', ref, 'imza uretilmemis'))
    }
    if (!frames.has(element.identity.frameId)) {
      errors.push(issue('error', 'unknown-frame', ref, element.identity.frameId))
    }
    for (const frameId of element.framePath.chain) {
      if (!frames.has(frameId)) {
        errors.push(issue('error', 'broken-frame-path', ref, frameId))
        break
      }
    }
  }

  for (const element of snapshot.elements) {
    checkLinks(element, refs, errors)
    checkGeometry(element, warnings)
    checkInteractivity(element, warnings)
  }

  const restricted = snapshot.frames.filter((frame) => frame.failed).length
  if (restricted > 0) {
    warnings.push(issue('warning', 'restricted-frames', '', String(restricted)))
  }
  if (snapshot.coverage.quietTimedOut) {
    warnings.push(issue('warning', 'quiet-timeout', '', 'kararlilik penceresi asildi'))
  }
  if (snapshot.coverage.occlusionSkipped > 0) {
    warnings.push(
      issue('warning', 'occlusion-skipped', '', String(snapshot.coverage.occlusionSkipped))
    )
  }
  if (snapshot.coverage.listenersSkipped > 0) {
    warnings.push(
      issue('warning', 'listeners-skipped', '', String(snapshot.coverage.listenersSkipped))
    )
  }

  return {
    ok: errors.length === 0,
    version: snapshot.modelVersion,
    checked: snapshot.elements.length,
    errors,
    warnings
  }
}

export function assertSnapshot(snapshot: GraphSnapshot): GraphSnapshot {
  const report = validateSnapshot(snapshot)
  if (!report.ok) throw new ModelValidationError(report)
  return snapshot
}

function checkLinks(
  element: ElementModel,
  refs: ReadonlySet<string>,
  errors: ValidationIssue[]
): void {
  const ref = element.identity.ref

  if (element.parentRef && !refs.has(element.parentRef)) {
    errors.push(issue('error', 'orphan-parent', ref, element.parentRef))
  }
  for (const child of element.childRefs) {
    if (!refs.has(child)) {
      errors.push(issue('error', 'orphan-child', ref, child))
      break
    }
  }
}

function checkGeometry(element: ElementModel, warnings: ValidationIssue[]): void {
  if (element.nodeType !== 1) return
  if (element.visibility.state === 'hidden') return
  if (!element.geometry.viewport || !element.geometry.center) {
    warnings.push(issue('warning', 'missing-geometry', element.identity.ref, element.tag))
  }
}

function checkInteractivity(element: ElementModel, warnings: ValidationIssue[]): void {
  if (!element.interactivity.interactive) return
  if (element.interactivity.reasons.length === 0) {
    warnings.push(issue('warning', 'unexplained-interactivity', element.identity.ref, element.tag))
  }
}

function issue(
  severity: ValidationSeverity,
  code: string,
  ref: string,
  detail: string
): ValidationIssue {
  return { severity, code, ref, detail }
}
