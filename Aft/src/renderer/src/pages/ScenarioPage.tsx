import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ScenarioEntry } from '../../../main/scenario/ScenarioStore'
import type {
  Assertion,
  AssertionKind,
  QueryKind,
  Scenario,
  ScenarioReport,
  ScenarioStep,
  StepKind,
  StepTarget,
  TargetKind
} from '../../../main/scenario/types'
import {
  ASSERTION_KINDS,
  DEFAULT_DEFAULTS,
  QUERY_KINDS,
  SCENARIO_VERSION
} from '../../../main/scenario/types'
import { Glyph, IconButton } from '../icons'
import { Card, Empty, Field, PageHead, Pill, Segmented, TextButton, Toggle } from '../ui'
import { formatShortDate, percent, shortUrl } from '../format'
import type { Report } from '../report'

const LEVELS = [0, 1, 2, 3]

const ADD_KINDS: StepKind[] = [
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

const TARGET_KINDS: TargetKind[] = ['descriptor', 'inline-descriptor', 'query', 'ordinal']

const KIND_TITLES: Record<string, string> = {
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

const ELEMENT_KINDS: ReadonlySet<string> = new Set([
  'click',
  'double-click',
  'right-click',
  'hover',
  'type',
  'clear-type',
  'select-option',
  'upload'
])

const ELEMENT_ASSERTIONS: ReadonlySet<string> = new Set([
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

function uid(prefix: string): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function blankTarget(kind: TargetKind): StepTarget {
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

function blankStep(kind: StepKind, title: string): ScenarioStep {
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
    timeoutMs: DEFAULT_DEFAULTS.stepTimeoutMs,
    retries: DEFAULT_DEFAULTS.retries,
    scanLevel: null,
    mode: null,
    continueOnFailure: false,
    allowLowConfidence: false,
    expectState: null
  }
}

function blankScenario(baseUrl: string): Scenario {
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

const KIND_TONE: Record<string, 'ok' | 'warn' | 'bad' | 'flat' | 'accent'> = {
  assert: 'accent',
  group: 'flat'
}

function mapSteps(steps: ScenarioStep[], fn: (step: ScenarioStep) => ScenarioStep): ScenarioStep[] {
  return steps.map((step) => {
    const next = fn(step)
    if (!next.steps.length) return next
    return { ...next, steps: mapSteps(next.steps, fn) }
  })
}

function flatSteps(steps: ScenarioStep[], depth = 0): { step: ScenarioStep; depth: number }[] {
  const out: { step: ScenarioStep; depth: number }[] = []
  for (const step of steps) {
    out.push({ step, depth })
    if (step.steps.length) out.push(...flatSteps(step.steps, depth + 1))
  }
  return out
}

function dropStep(steps: ScenarioStep[], id: string): ScenarioStep[] {
  return steps
    .filter((step) => step.id !== id)
    .map((step) => (step.steps.length ? { ...step, steps: dropStep(step.steps, id) } : step))
}

function shiftStep(steps: ScenarioStep[], id: string, offset: number): ScenarioStep[] {
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

function replaceStep(steps: ScenarioStep[], id: string, next: ScenarioStep): ScenarioStep[] {
  return steps.map((step) => {
    if (step.id === id) return next
    if (!step.steps.length) return step
    return { ...step, steps: replaceStep(step.steps, id, next) }
  })
}

function valueLabel(kind: StepKind): string {
  if (kind === 'type' || kind === 'clear-type') return 'Metin'
  if (kind === 'press-key') return 'Tuş'
  if (kind === 'navigate') return 'Adres'
  if (kind === 'select-option') return 'Seçenek'
  if (kind === 'scroll') return 'Kaydırma (piksel)'
  if (kind === 'upload') return 'Dosya yolları (virgülle)'
  return ''
}

function valueOf(step: ScenarioStep): string {
  if (step.kind === 'press-key') return step.key
  if (step.kind === 'navigate') return step.url
  if (step.kind === 'select-option') return step.optionValue
  if (step.kind === 'scroll') return String(step.deltaY)
  if (step.kind === 'upload') return step.files.join(', ')
  return step.text
}

function patchValue(kind: StepKind, value: string): Partial<ScenarioStep> {
  if (kind === 'press-key') return { key: value }
  if (kind === 'navigate') return { url: value }
  if (kind === 'select-option') return { optionValue: value }
  if (kind === 'scroll') return { deltaY: Number(value) || 0 }
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

function TargetEditor({
  label,
  target,
  disabled,
  onChange
}: {
  label: string
  target: StepTarget | null
  disabled: boolean
  onChange: (next: StepTarget | null) => void
}): React.JSX.Element {
  const kind = target?.kind ?? 'none'

  return (
    <>
      <div className="card-split">{label}</div>

      <Field label="Hedefleme">
        <select
          value={kind}
          disabled={disabled}
          onChange={(event) => {
            const next = event.target.value
            if (next === 'none') {
              onChange(null)
              return
            }
            onChange({ ...blankTarget(next as TargetKind), label: target?.label ?? '' })
          }}
        >
          <option value="none">hedef yok</option>
          {TARGET_KINDS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </Field>

      {target ? (
        <Field label="Etiket">
          <input
            value={target.label}
            disabled={disabled}
            onChange={(event) => onChange({ ...target, label: event.target.value })}
            spellCheck={false}
          />
        </Field>
      ) : null}

      {target && (target.kind === 'descriptor' || target.kind === 'inline-descriptor') ? (
        <Field label="Descriptor kimliği">
          <input
            value={target.descriptorId}
            disabled={disabled}
            onChange={(event) => onChange({ ...target, descriptorId: event.target.value })}
            spellCheck={false}
          />
        </Field>
      ) : null}

      {target && target.kind === 'ordinal' ? (
        <Field label="Sıra">
          <input
            type="number"
            value={target.ordinal}
            disabled={disabled}
            onChange={(event) => onChange({ ...target, ordinal: Number(event.target.value) || 0 })}
          />
        </Field>
      ) : null}

      {target && target.kind === 'query' && target.query ? (
        <>
          <div className="grid-2">
            <Field label="Sorgu türü">
              <select
                value={target.query.kind}
                disabled={disabled}
                onChange={(event) =>
                  onChange({
                    ...target,
                    query: { ...target.query!, kind: event.target.value as QueryKind }
                  })
                }
              >
                {QUERY_KINDS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Kaçıncı (-1 hepsi)">
              <input
                type="number"
                value={target.query.nth}
                disabled={disabled}
                onChange={(event) =>
                  onChange({
                    ...target,
                    query: { ...target.query!, nth: Number(event.target.value) }
                  })
                }
              />
            </Field>
          </div>

          <Field label="Değer">
            <input
              value={target.query.value}
              disabled={disabled}
              onChange={(event) =>
                onChange({ ...target, query: { ...target.query!, value: event.target.value } })
              }
              spellCheck={false}
            />
          </Field>

          <div className="grid-2">
            <Field label="Etiket adı">
              <input
                value={target.query.tag}
                disabled={disabled}
                onChange={(event) =>
                  onChange({ ...target, query: { ...target.query!, tag: event.target.value } })
                }
                spellCheck={false}
              />
            </Field>
            <Field label="Rol">
              <input
                value={target.query.role}
                disabled={disabled}
                onChange={(event) =>
                  onChange({ ...target, query: { ...target.query!, role: event.target.value } })
                }
                spellCheck={false}
              />
            </Field>
          </div>

          {target.query.kind === 'test-id' ? (
            <Field label="Nitelik adı">
              <input
                value={target.query.attribute}
                disabled={disabled}
                onChange={(event) =>
                  onChange({
                    ...target,
                    query: { ...target.query!, attribute: event.target.value }
                  })
                }
                spellCheck={false}
              />
            </Field>
          ) : null}
        </>
      ) : null}
    </>
  )
}

export default function ScenarioPage({
  revision,
  busy,
  baseUrl,
  onReport,
  onRun,
  onChanged
}: {
  revision: number
  busy: boolean
  baseUrl: string
  onReport: (report: Report) => void
  onRun: (scenarioId: string) => void
  onChanged: () => void
}): React.JSX.Element {
  const [entries, setEntries] = useState<ScenarioEntry[]>([])
  const [selected, setSelected] = useState('')
  const [draft, setDraft] = useState<Scenario | null>(null)
  const [report, setReport] = useState<ScenarioReport | null>(null)
  const [stepId, setStepId] = useState('')
  const [filter, setFilter] = useState('')
  const [dirty, setDirty] = useState(false)
  const [working, setWorking] = useState(false)
  const [addKind, setAddKind] = useState<StepKind>('click')
  const [view, setView] = useState<'steps' | 'json'>('steps')
  const [stepView, setStepView] = useState<'form' | 'json'>('form')

  const jsonRef = useRef<HTMLTextAreaElement | null>(null)
  const stepJsonRef = useRef<HTMLTextAreaElement | null>(null)

  const rows = useMemo(() => {
    const text = filter.trim().toLowerCase()
    if (!text) return entries
    return entries.filter((entry) => entry.title.toLowerCase().includes(text))
  }, [entries, filter])

  const steps = useMemo(() => (draft ? flatSteps(draft.steps) : []), [draft])
  const step = useMemo(
    () => steps.find((item) => item.step.id === stepId)?.step ?? null,
    [stepId, steps]
  )

  const load = useCallback(async (): Promise<void> => {
    try {
      const result = await window.aftPlayback.list()
      if (!result.ok || !result.data) {
        onReport({ level: 'err', text: 'Senaryo listesi alınamadı: ' + result.message })
        return
      }
      setEntries(result.data.entries)
    } catch (error) {
      onReport({ level: 'err', text: 'Köprü hatası: ' + (error as Error).message })
    }
  }, [onReport])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load, revision])

  const open = useCallback(
    async (id: string): Promise<void> => {
      setWorking(true)
      try {
        const result = await window.aftPlayback.get(id)
        if (!result.ok || !result.data) {
          onReport({ level: 'err', text: 'Senaryo okunamadı: ' + result.message })
          return
        }
        setSelected(id)
        setDraft(result.data.scenario)
        setReport(result.data.report)
        setStepId(result.data.scenario.steps[0]?.id ?? '')
        setDirty(false)
      } catch (error) {
        onReport({ level: 'err', text: 'Köprü hatası: ' + (error as Error).message })
      } finally {
        setWorking(false)
      }
    },
    [onReport]
  )

  const patch = useCallback((change: Partial<Scenario>): void => {
    setDraft((prev) => (prev ? { ...prev, ...change } : prev))
    setDirty(true)
  }, [])

  const patchStep = useCallback((id: string, change: Partial<ScenarioStep>): void => {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            steps: mapSteps(prev.steps, (item) => (item.id === id ? { ...item, ...change } : item))
          }
        : prev
    )
    setDirty(true)
  }, [])

  const patchAssertion = useCallback((id: string, change: Partial<Assertion>): void => {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            steps: mapSteps(prev.steps, (item) =>
              item.id === id && item.assertion
                ? { ...item, assertion: { ...item.assertion, ...change } }
                : item
            )
          }
        : prev
    )
    setDirty(true)
  }, [])

  const removeStep = useCallback(
    (id: string): void => {
      setDraft((prev) => (prev ? { ...prev, steps: dropStep(prev.steps, id) } : prev))
      setDirty(true)
      if (stepId === id) setStepId('')
    },
    [stepId]
  )

  const moveStep = useCallback((id: string, offset: number): void => {
    setDraft((prev) => (prev ? { ...prev, steps: shiftStep(prev.steps, id, offset) } : prev))
    setDirty(true)
  }, [])

  const create = useCallback((): void => {
    const draftScenario = blankScenario(baseUrl)
    setSelected('')
    setDraft(draftScenario)
    setReport(null)
    setStepId(draftScenario.steps[0].id)
    setDirty(true)
  }, [baseUrl])

  const addStep = useCallback((): void => {
    const created = blankStep(addKind, KIND_TITLES[addKind] ?? addKind)
    setDraft((prev) => (prev ? { ...prev, steps: prev.steps.concat(created) } : prev))
    setStepId(created.id)
    setDirty(true)
  }, [addKind])

  const applyJson = useCallback((): void => {
    try {
      const parsed = JSON.parse(jsonRef.current?.value ?? '') as Scenario
      setDraft(parsed)
      setStepId(parsed.steps?.[0]?.id ?? '')
      setDirty(true)
      onReport({ level: 'ok', text: 'JSON senaryoya uygulandı' })
    } catch (error) {
      onReport({ level: 'err', text: 'JSON okunamadı: ' + (error as Error).message })
    }
  }, [onReport])

  const applyStepJson = useCallback((): void => {
    if (!step) return
    try {
      const parsed = JSON.parse(stepJsonRef.current?.value ?? '') as ScenarioStep
      setDraft((prev) =>
        prev ? { ...prev, steps: replaceStep(prev.steps, step.id, parsed) } : prev
      )
      setStepId(parsed.id || step.id)
      setDirty(true)
      onReport({ level: 'ok', text: 'Adım JSON ile güncellendi' })
    } catch (error) {
      onReport({ level: 'err', text: 'Adım JSON okunamadı: ' + (error as Error).message })
    }
  }, [onReport, step])

  const validate = useCallback(async (): Promise<void> => {
    if (!draft) return
    setWorking(true)
    try {
      const result = await window.aftPlayback.validate(draft)
      if (!result.ok || !result.data) {
        onReport({ level: 'err', text: 'Doğrulama başarısız: ' + result.message })
        return
      }
      setReport(result.data.report)
      onReport({
        level: result.data.report.ok ? 'ok' : 'err',
        text: result.data.report.ok ? 'Senaryo doğrulandı' : 'Senaryo geçersiz',
        detail: result.data.report.errors
          .slice(0, 4)
          .map((issue) => issue.path + ': ' + issue.message)
      })
    } finally {
      setWorking(false)
    }
  }, [draft, onReport])

  const save = useCallback(async (): Promise<void> => {
    if (!draft) return
    setWorking(true)
    try {
      const result = await window.aftPlayback.save({ ...draft, updatedAt: Date.now() })
      if (!result.ok || !result.data) {
        onReport({ level: 'err', text: 'Senaryo kaydedilemedi: ' + result.message })
        return
      }
      setDraft(result.data.scenario)
      setSelected(result.data.scenario.id)
      setReport(result.data.report)
      setDirty(false)
      onReport({ level: 'ok', text: 'Senaryo kaydedildi: ' + result.data.scenario.title })
      await load()
      onChanged()
    } catch (error) {
      onReport({ level: 'err', text: 'Köprü hatası: ' + (error as Error).message })
    } finally {
      setWorking(false)
    }
  }, [draft, load, onChanged, onReport])

  const remove = useCallback(async (): Promise<void> => {
    if (!selected) return
    setWorking(true)
    try {
      const result = await window.aftPlayback.remove(selected)
      if (!result.ok) {
        onReport({ level: 'err', text: 'Senaryo silinemedi: ' + result.message })
        return
      }
      setSelected('')
      setDraft(null)
      setReport(null)
      setStepId('')
      setDirty(false)
      onReport({ level: 'note', text: 'Senaryo silindi' })
      await load()
      onChanged()
    } finally {
      setWorking(false)
    }
  }, [load, onChanged, onReport, selected])

  const locked = working || busy

  return (
    <div className="page">
      <PageHead
        title="Senaryolar"
        meta={
          draft ? (
            <>
              <Pill tone={report?.ok ? 'ok' : 'bad'}>
                {report?.ok ? 'doğrulandı' : (report?.errors.length ?? 0) + ' hata'}
              </Pill>
              {report?.warnings.length ? (
                <Pill tone="warn">{report.warnings.length} uyarı</Pill>
              ) : null}
              {dirty ? <Pill tone="accent">kaydedilmedi</Pill> : null}
              <Pill>{steps.length} adım</Pill>
            </>
          ) : null
        }
        actions={
          <>
            <TextButton glyph="plus" label="Yeni" onClick={create} disabled={locked} />
            <TextButton
              glyph="shield"
              label="Doğrula"
              onClick={() => void validate()}
              disabled={!draft || locked}
            />
            <TextButton
              glyph="save"
              label="Kaydet"
              onClick={() => void save()}
              disabled={!draft || locked || !dirty}
              tone="primary"
            />
            <TextButton
              glyph="play"
              label="Çalıştır"
              onClick={() => onRun(selected)}
              disabled={!selected || locked || dirty}
            />
            <TextButton
              glyph="trash"
              label="Sil"
              onClick={() => void remove()}
              disabled={!selected || locked}
              tone="danger"
            />
          </>
        }
      />

      <div className="page-body cols-3">
        <Card
          label="Kütüphane"
          actions={<IconButton name="reload" title="Yenile" onClick={() => void load()} small />}
          scroll
        >
          <div className="search">
            <Glyph name="search" size={13} />
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filtre"
              spellCheck={false}
              aria-label="Senaryo filtresi"
            />
          </div>

          {rows.length ? (
            <div className="list">
              {rows.map((entry) => (
                <button
                  key={entry.id}
                  className={'list-row' + (entry.id === selected ? ' sel' : '')}
                  onClick={() => void open(entry.id)}
                  disabled={locked}
                  type="button"
                >
                  <Glyph name="file" size={13} />
                  <span className="list-title">{entry.title}</span>
                  <span className="list-meta">{entry.steps}</span>
                  <span className="list-meta">{formatShortDate(entry.updatedAt)}</span>
                </button>
              ))}
            </div>
          ) : (
            <Empty glyph="library" text="Senaryo yok" />
          )}
        </Card>

        <Card
          label={view === 'json' ? 'Senaryo JSON' : 'Adımlar'}
          scroll
          grow
          actions={
            draft ? (
              <>
                <Segmented
                  items={[
                    { id: 'steps', label: 'Adımlar' },
                    { id: 'json', label: 'JSON' }
                  ]}
                  value={view}
                  onPick={(id) => setView(id as 'steps' | 'json')}
                />
                {view === 'steps' ? (
                  <>
                    <select
                      className="picker slim"
                      value={addKind}
                      onChange={(event) => setAddKind(event.target.value as StepKind)}
                      aria-label="Adım türü"
                    >
                      {ADD_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {KIND_TITLES[kind] ?? kind}
                        </option>
                      ))}
                    </select>
                    <IconButton
                      name="plus"
                      title="Adım ekle"
                      onClick={addStep}
                      disabled={locked}
                      small
                    />
                  </>
                ) : (
                  <TextButton
                    glyph="check"
                    label="Uygula"
                    onClick={applyJson}
                    disabled={locked}
                    tone="primary"
                  />
                )}
              </>
            ) : null
          }
        >
          {draft ? (
            view === 'json' ? (
              <textarea
                key={'sc:' + draft.id + ':' + draft.updatedAt + ':' + steps.length}
                ref={jsonRef}
                className="code-area"
                defaultValue={JSON.stringify(draft, null, 2)}
                spellCheck={false}
                aria-label="Senaryo JSON"
              />
            ) : (
              <>
                <div className="grid-2">
                  <Field label="Başlık">
                    <input
                      value={draft.title}
                      onChange={(event) => patch({ title: event.target.value })}
                      spellCheck={false}
                    />
                  </Field>
                  <Field label="Başlangıç adresi">
                    <input
                      value={draft.baseUrl}
                      onChange={(event) => patch({ baseUrl: event.target.value })}
                      spellCheck={false}
                    />
                  </Field>
                </div>

                <div className="steps">
                  {steps.map(({ step: item, depth }, index) => (
                    <button
                      key={item.id}
                      className={'step-row' + (item.id === stepId ? ' sel' : '')}
                      style={{ paddingLeft: 10 + depth * 14 }}
                      onClick={() => setStepId(item.id)}
                      type="button"
                    >
                      <span className="step-no">{index + 1}</span>
                      <span className="step-title">{item.title}</span>
                      <Pill tone={KIND_TONE[item.kind] ?? 'flat'}>{item.kind}</Pill>
                      {item.continueOnFailure ? <Glyph name="flag" size={12} /> : null}
                    </button>
                  ))}
                </div>

                {report && report.errors.length ? (
                  <div className="issues">
                    {report.errors.slice(0, 6).map((issue, index) => (
                      <div key={index} className="issue bad">
                        <Glyph name="alert" size={12} />
                        {issue.path}: {issue.message}
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            )
          ) : (
            <Empty glyph="file" text="Senaryo seçilmedi" />
          )}
        </Card>

        <Card
          label="Adım ayarı"
          scroll
          actions={
            draft && step ? (
              <Segmented
                items={[
                  { id: 'form', label: 'Form' },
                  { id: 'json', label: 'JSON' }
                ]}
                value={stepView}
                onPick={(id) => setStepView(id as 'form' | 'json')}
              />
            ) : null
          }
        >
          {draft && step ? (
            stepView === 'json' ? (
              <>
                <textarea
                  key={'st:' + step.id + ':' + step.kind + ':' + step.title}
                  ref={stepJsonRef}
                  className="code-area"
                  defaultValue={JSON.stringify(step, null, 2)}
                  spellCheck={false}
                  aria-label="Adım JSON"
                />
                <div className="step-actions">
                  <TextButton
                    glyph="check"
                    label="Adımı güncelle"
                    onClick={applyStepJson}
                    disabled={locked}
                    tone="primary"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="step-actions">
                  <IconButton
                    name="up"
                    title="Yukarı"
                    onClick={() => moveStep(step.id, -1)}
                    disabled={locked}
                    small
                  />
                  <IconButton
                    name="down"
                    title="Aşağı"
                    onClick={() => moveStep(step.id, 1)}
                    disabled={locked}
                    small
                  />
                  <IconButton
                    name="trash"
                    title="Sil"
                    onClick={() => removeStep(step.id)}
                    disabled={locked}
                    small
                    danger
                  />
                </div>

                <div className="grid-2">
                  <Field label="Tür">
                    <select
                      value={step.kind}
                      disabled={locked}
                      onChange={(event) => {
                        const next = event.target.value as StepKind
                        patchStep(step.id, {
                          kind: next,
                          target: ELEMENT_KINDS.has(next)
                            ? (step.target ?? blankTarget('query'))
                            : step.target,
                          assertion:
                            next === 'assert'
                              ? (step.assertion ?? {
                                  kind: 'url-matches',
                                  target: null,
                                  expected: '',
                                  attribute: '',
                                  count: 0,
                                  soft: false,
                                  message: ''
                                })
                              : step.assertion
                        })
                      }}
                    >
                      {ADD_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {kind}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Başlık">
                    <input
                      value={step.title}
                      onChange={(event) => patchStep(step.id, { title: event.target.value })}
                      spellCheck={false}
                    />
                  </Field>
                </div>

                {valueLabel(step.kind) ? (
                  <Field label={valueLabel(step.kind)}>
                    <input
                      value={valueOf(step)}
                      onChange={(event) =>
                        patchStep(step.id, patchValue(step.kind, event.target.value))
                      }
                      spellCheck={false}
                    />
                  </Field>
                ) : null}

                {step.target?.descriptor ? (
                  <div className="kv">
                    <span className="kv-key">kalite</span>
                    <span className="kv-val">{percent(step.target.descriptor.quality.score)}</span>
                    <span className="kv-key">strateji</span>
                    <span className="kv-val">
                      {step.target.descriptor.strategies.map((entry) => entry.kind).join(', ')}
                    </span>
                  </div>
                ) : null}

                {step.kind === 'assert' ? null : (
                  <TargetEditor
                    label="Hedef"
                    target={step.target}
                    disabled={locked}
                    onChange={(next) => patchStep(step.id, { target: next })}
                  />
                )}

                {step.assertion ? (
                  <>
                    <div className="card-split">Doğrulama</div>
                    <Field label="Tür">
                      <select
                        value={step.assertion.kind}
                        onChange={(event) =>
                          patchAssertion(step.id, { kind: event.target.value as AssertionKind })
                        }
                      >
                        {ASSERTION_KINDS.map((kind) => (
                          <option key={kind} value={kind}>
                            {kind}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Beklenen">
                      <input
                        value={step.assertion.expected}
                        onChange={(event) =>
                          patchAssertion(step.id, { expected: event.target.value })
                        }
                        spellCheck={false}
                      />
                    </Field>
                    {step.assertion.kind === 'attribute-equals' ? (
                      <Field label="Nitelik">
                        <input
                          value={step.assertion.attribute}
                          onChange={(event) =>
                            patchAssertion(step.id, { attribute: event.target.value })
                          }
                          spellCheck={false}
                        />
                      </Field>
                    ) : null}
                    {step.assertion.kind === 'element-count' ? (
                      <Field label="Adet">
                        <input
                          type="number"
                          value={step.assertion.count}
                          onChange={(event) =>
                            patchAssertion(step.id, { count: Number(event.target.value) || 0 })
                          }
                        />
                      </Field>
                    ) : null}
                    <Toggle
                      label="Yumuşak doğrulama"
                      checked={step.assertion.soft}
                      onChange={(next) => patchAssertion(step.id, { soft: next })}
                    />
                    {ELEMENT_ASSERTIONS.has(step.assertion.kind) ? (
                      <TargetEditor
                        label="Doğrulama hedefi"
                        target={step.assertion.target}
                        disabled={locked}
                        onChange={(next) => patchAssertion(step.id, { target: next })}
                      />
                    ) : null}
                  </>
                ) : null}

                <div className="card-split">Adım ayarları</div>

                <div className="grid-2">
                  <Field label="Zaman aşımı">
                    <input
                      type="number"
                      value={step.timeoutMs}
                      onChange={(event) =>
                        patchStep(step.id, { timeoutMs: Number(event.target.value) || 0 })
                      }
                    />
                  </Field>
                  <Field label="Deneme">
                    <input
                      type="number"
                      value={step.retries}
                      onChange={(event) =>
                        patchStep(step.id, { retries: Number(event.target.value) || 0 })
                      }
                    />
                  </Field>
                </div>

                <Toggle
                  label="Hatada devam et"
                  checked={step.continueOnFailure}
                  onChange={(next) => patchStep(step.id, { continueOnFailure: next })}
                />
                <Toggle
                  label="Düşük güvene izin ver"
                  checked={step.allowLowConfidence}
                  onChange={(next) => patchStep(step.id, { allowLowConfidence: next })}
                />

                <div className="card-split">Senaryo varsayılanları</div>

                <div className="grid-2">
                  <Field label="Tarama seviyesi">
                    <select
                      value={draft.defaults.scanLevel}
                      onChange={(event) =>
                        patch({
                          defaults: {
                            ...draft.defaults,
                            scanLevel: Number(event.target.value) as 0 | 1 | 2 | 3
                          }
                        })
                      }
                    >
                      {LEVELS.map((level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Adım zaman aşımı">
                    <input
                      type="number"
                      value={draft.defaults.stepTimeoutMs}
                      onChange={(event) =>
                        patch({
                          defaults: {
                            ...draft.defaults,
                            stepTimeoutMs: Number(event.target.value) || 0
                          }
                        })
                      }
                    />
                  </Field>
                </div>

                <Toggle
                  label="İlk hatada dur"
                  checked={draft.defaults.stopOnFailure}
                  onChange={(next) =>
                    patch({ defaults: { ...draft.defaults, stopOnFailure: next } })
                  }
                />
                <Toggle
                  label="Sayfa durumunu doğrula"
                  checked={draft.defaults.verifyState}
                  onChange={(next) => patch({ defaults: { ...draft.defaults, verifyState: next } })}
                />

                <div className="kv">
                  <span className="kv-key">şema</span>
                  <span className="kv-val mono">{draft.version}</span>
                  <span className="kv-key">kimlik</span>
                  <span className="kv-val mono">{draft.id}</span>
                  <span className="kv-key">adres</span>
                  <span className="kv-val mono">{shortUrl(draft.baseUrl)}</span>
                </div>
              </>
            )
          ) : (
            <Empty glyph="sliders" text="Adım seçilmedi" />
          )}
        </Card>
      </div>
    </div>
  )
}
