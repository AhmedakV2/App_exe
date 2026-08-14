import { digest } from '../model'
import { ELEMENT_ASSERTION_KINDS } from '../scenario'
import type { StepTarget } from '../scenario'
import { assertStep, assertion, waitStep } from './StepFactory'
import { optionTarget, plain } from './Quality'
import type { EditRequest, RecordSession, RecordedStep } from './types'

export interface EditOutcome {
  ok: boolean
  message: string
  stepId: string
}

const MIN_WAIT_MS = 100

const MAX_WAIT_MS = 300000

export function edit(session: RecordSession, request: EditRequest): EditOutcome {
  switch (request.kind) {
    case 'remove':
      return remove(session, request.stepId)
    case 'move':
      return move(session, request.stepId, request.offset)
    case 'retitle':
      return retitle(session, request.stepId, request.title)
    case 'text':
      return retext(session, request.stepId, request.text)
    case 'target':
      return retarget(session, request.stepId, request.optionId)
    case 'wait':
      return insertWait(session, request.stepId, request.timeoutMs)
    case 'assert':
      return insertAssert(session, request)
    case 'timeout':
      return retime(session, request.stepId, request.timeoutMs)
    case 'tolerate':
      return tolerate(session, request.stepId, request.flag)
    case 'clear':
      return clear(session)
    default:
      return { ok: false, message: 'Bilinmeyen duzenleme', stepId: '' }
  }
}

export function renumber(session: RecordSession): void {
  session.steps.forEach((step, position) => {
    step.order = position
  })
  session.updatedAt = Date.now()
}

function remove(session: RecordSession, id: string): EditOutcome {
  const at = indexOf(session, id)
  if (at < 0) return missing(id)

  session.steps.splice(at, 1)
  renumber(session)
  return { ok: true, message: 'Adim silindi', stepId: id }
}

function move(session: RecordSession, id: string, offset: number): EditOutcome {
  const at = indexOf(session, id)
  if (at < 0) return missing(id)

  const target = at + (offset < 0 ? -1 : 1)
  if (target < 0 || target >= session.steps.length) {
    return { ok: false, message: 'Adim siniri asildi', stepId: id }
  }

  const [moved] = session.steps.splice(at, 1)
  session.steps.splice(target, 0, moved)
  renumber(session)
  return { ok: true, message: 'Adim tasindi', stepId: id }
}

function retitle(session: RecordSession, id: string, title: string): EditOutcome {
  const step = find(session, id)
  if (!step) return missing(id)

  const text = title.trim()
  if (!text) return { ok: false, message: 'Baslik bos olamaz', stepId: id }

  step.step.title = text
  session.updatedAt = Date.now()
  return { ok: true, message: 'Baslik guncellendi', stepId: id }
}

function retext(session: RecordSession, id: string, value: string): EditOutcome {
  const step = find(session, id)
  if (!step) return missing(id)

  if (step.kind === 'clear-type' || step.kind === 'type') step.step.text = value
  else if (step.kind === 'select-option') step.step.optionValue = value
  else if (step.kind === 'navigate') step.step.url = value
  else if (step.kind === 'press-key') step.step.key = value
  else if (step.kind === 'upload') step.step.files = value.split('\n').filter(Boolean)
  else if (step.kind === 'scroll') step.step.deltaY = Number(value) || 0
  else return { ok: false, message: 'Bu adimin degeri duzenlenemez', stepId: id }

  session.updatedAt = Date.now()
  return { ok: true, message: 'Adim degeri guncellendi', stepId: id }
}

function retarget(session: RecordSession, id: string, optionId: string): EditOutcome {
  const step = find(session, id)
  if (!step) return missing(id)

  const target = optionTarget(step.advice.alternatives, optionId)
  if (!target) return { ok: false, message: 'Onerilen hedef bulunamadi', stepId: id }

  step.step.target = clone(target)
  step.advice = {
    ...plain(),
    reasons: ['hedef elle secildi: ' + target.label],
    alternatives: step.advice.alternatives
  }
  session.updatedAt = Date.now()
  return { ok: true, message: 'Hedef degistirildi: ' + target.label, stepId: id }
}

function insertWait(session: RecordSession, id: string, timeoutMs: number): EditOutcome {
  const wait = Math.min(MAX_WAIT_MS, Math.max(MIN_WAIT_MS, Math.round(timeoutMs || 1000)))
  const at = id ? indexOf(session, id) : session.steps.length - 1
  if (id && at < 0) return missing(id)

  const created = blank(session, 'wait', at + 1)
  created.step = waitStep(created.id, wait, session.options)
  created.kind = 'wait'

  session.steps.splice(at + 1, 0, created)
  renumber(session)
  return { ok: true, message: 'Bekleme eklendi: ' + wait + ' ms', stepId: created.id }
}

function insertAssert(session: RecordSession, request: EditRequest): EditOutcome {
  const spec = request.assertion
  if (!spec) return { ok: false, message: 'Dogrulama tanimi yok', stepId: request.stepId }

  const anchor = request.stepId ? find(session, request.stepId) : null
  if (request.stepId && !anchor) return missing(request.stepId)

  const needsTarget = ELEMENT_ASSERTION_KINDS.includes(spec.kind)
  const target = anchor?.step.target ? clone(anchor.step.target) : null

  if (needsTarget && !target) {
    return {
      ok: false,
      message: 'Bu dogrulama icin hedefli bir adim secilmeli',
      stepId: request.stepId
    }
  }

  const at = anchor ? indexOf(session, anchor.id) : session.steps.length - 1
  const created = blank(session, 'assert', at + 1)
  created.kind = 'assert'
  created.step = assertStep(
    created.id,
    assertion(spec, needsTarget ? target : null),
    session.options
  )
  created.url = anchor?.url ?? session.baseUrl

  session.steps.splice(at + 1, 0, created)
  renumber(session)
  return { ok: true, message: 'Dogrulama eklendi', stepId: created.id }
}

function retime(session: RecordSession, id: string, timeoutMs: number): EditOutcome {
  const step = find(session, id)
  if (!step) return missing(id)

  step.step.timeoutMs = Math.min(MAX_WAIT_MS, Math.max(0, Math.round(timeoutMs)))
  if (step.kind === 'wait') step.step.title = 'Bekle: ' + step.step.timeoutMs + ' ms'
  session.updatedAt = Date.now()
  return { ok: true, message: 'Sure guncellendi', stepId: id }
}

function tolerate(session: RecordSession, id: string, flag: boolean): EditOutcome {
  const step = find(session, id)
  if (!step) return missing(id)

  step.step.continueOnFailure = flag
  session.updatedAt = Date.now()
  return {
    ok: true,
    message: flag ? 'Adim hatasi akisi durdurmayacak' : 'Adim hatasi akisi durduracak',
    stepId: id
  }
}

function clear(session: RecordSession): EditOutcome {
  session.steps.length = 0
  renumber(session)
  return { ok: true, message: 'Tum adimlar silindi', stepId: '' }
}

function blank(session: RecordSession, kind: string, order: number): RecordedStep {
  const at = Date.now()
  return {
    id: digest([session.id, kind, String(at), String(order), String(session.steps.length)]),
    order,
    at,
    origin: 'manual',
    kind: 'wait',
    step: waitStep('', 1000, session.options),
    advice: plain(),
    assertions: [],
    url: session.baseUrl,
    frameDepth: 0,
    shadowDepth: 0,
    rect: null,
    scanned: false,
    sourceKey: ''
  }
}

function clone(target: StepTarget): StepTarget {
  return {
    kind: target.kind,
    label: target.label,
    descriptorId: target.descriptorId,
    descriptor: target.descriptor,
    query: target.query ? { ...target.query } : null,
    ordinal: target.ordinal
  }
}

function find(session: RecordSession, id: string): RecordedStep | null {
  return session.steps.find((step) => step.id === id) ?? null
}

function indexOf(session: RecordSession, id: string): number {
  return session.steps.findIndex((step) => step.id === id)
}

function missing(id: string): EditOutcome {
  return { ok: false, message: 'Adim bulunamadi: ' + id, stepId: id }
}
