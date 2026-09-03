import React, { useCallback, useEffect, useMemo, useState } from 'react'
import type { ScenarioEntry } from '../../../main/scenario/ScenarioStore'
import type {
  Assertion,
  AssertionKind,
  Scenario,
  ScenarioReport,
  ScenarioStep,
  StepKind
} from '../../../main/scenario/types'
import { ASSERTION_KINDS, DEFAULT_DEFAULTS, SCENARIO_VERSION } from '../../../main/scenario/types'
import { Glyph, IconButton } from '../icons'
import { Card, Empty, FieldRow, PageHead, Pill, Skeleton, TextButton, Toggle } from '../ui'
import { formatShortDate, percent, shortUrl } from '../format'
import type { Report } from '../report'

const LEVELS = [0, 1, 2, 3]

const ADD_KINDS: StepKind[] = ['navigate', 'wait', 'press-key', 'scroll', 'assert']

function uid(prefix: string): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function blankStep(kind: StepKind, title: string): ScenarioStep {
  return {
    id: uid('st-'),
    kind,
    title,
    target: null,
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
  const first = blankStep('navigate', 'Adrese git')
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

function valueLabel(kind: StepKind): string {
  if (kind === 'type' || kind === 'clear-type') return 'Metin'
  if (kind === 'press-key') return 'Tuş'
  if (kind === 'navigate') return 'Adres'
  if (kind === 'select-option') return 'Seçenek'
  if (kind === 'scroll') return 'Kaydırma'
  return ''
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
  const [addKind, setAddKind] = useState<StepKind>('navigate')

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
    const step = blankStep(addKind, addKind)
    setDraft((prev) => (prev ? { ...prev, steps: prev.steps.concat(step) } : prev))
    setStepId(step.id)
    setDirty(true)
  }, [addKind])

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
  const loading = working && !entries.length

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
              disabled={!draft || busy}
              busy={working}
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
            <TextButton
              glyph="save"
              label="Kaydet"
              onClick={() => void save()}
              disabled={!draft || busy || !dirty}
              busy={working}
              tone="primary"
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
              placeholder="Senaryo ara"
              spellCheck={false}
              aria-label="Senaryo filtresi"
            />
          </div>

          {loading ? <Skeleton rows={5} /> : null}

          {!loading && rows.length ? (
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
                  <span className="list-meta">{entry.steps} adım</span>
                  <span className="list-meta">{formatShortDate(entry.updatedAt)}</span>
                </button>
              ))}
            </div>
          ) : null}

          {!loading && !rows.length ? (
            <Empty
              glyph="library"
              text={filter ? 'Eşleşen senaryo yok' : 'Henüz senaryo yok'}
              hint={
                filter
                  ? 'Filtreyi temizleyip tüm kütüphaneyi görebilirsiniz.'
                  : 'Yeni bir senaryo oluşturun ya da tarayıcı sekmesinde kayıt alın.'
              }
            />
          ) : null}
        </Card>

        <Card
          label="Adımlar"
          grow
          scroll
          actions={
            draft ? (
              <div className="step-toolbar">
                <select
                  className="picker slim"
                  value={addKind}
                  onChange={(event) => setAddKind(event.target.value as StepKind)}
                  aria-label="Adım türü"
                >
                  {ADD_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
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
              </div>
            ) : null
          }
        >
          {draft ? (
            <>
              {steps.length ? (
                <div className="steps">
                  {steps.map(({ step: item, depth }, index) => (
                    <button
                      key={item.id}
                      className={'step-row' + (item.id === stepId ? ' sel' : '')}
                      style={{ paddingLeft: 16 + depth * 16 }}
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
              ) : (
                <Empty
                  glyph="file"
                  text="Bu senaryoda adım yok"
                  hint="Sağ üstteki tür seçicisinden bir adım ekleyerek başlayın."
                />
              )}

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
          ) : (
            <Empty
              glyph="file"
              text="Senaryo seçilmedi"
              hint="Soldaki kütüphaneden bir senaryo açın ya da yeni bir senaryo oluşturun."
            />
          )}
        </Card>

        <Card label="Ayarlar" scroll>
          {draft ? (
            <>
              <section className="form-group">
                <span className="card-split">Senaryo</span>

                <FieldRow label="Başlık">
                  <input
                    value={draft.title}
                    onChange={(event) => patch({ title: event.target.value })}
                    spellCheck={false}
                  />
                </FieldRow>

                <FieldRow label="Başlangıç adresi">
                  <input
                    value={draft.baseUrl}
                    onChange={(event) => patch({ baseUrl: event.target.value })}
                    spellCheck={false}
                  />
                </FieldRow>
              </section>

              {step ? (
                <section className="form-group">
                  <div className="form-head">
                    <span className="card-split">Adım</span>
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
                  </div>

                  <FieldRow label="Başlık">
                    <input
                      value={step.title}
                      onChange={(event) => patchStep(step.id, { title: event.target.value })}
                      spellCheck={false}
                    />
                  </FieldRow>

                  {valueLabel(step.kind) ? (
                    <FieldRow label={valueLabel(step.kind)}>
                      <input
                        value={
                          step.kind === 'press-key'
                            ? step.key
                            : step.kind === 'navigate'
                              ? step.url
                              : step.kind === 'select-option'
                                ? step.optionValue
                                : step.kind === 'scroll'
                                  ? String(step.deltaY)
                                  : step.text
                        }
                        onChange={(event) => {
                          const value = event.target.value
                          if (step.kind === 'press-key') patchStep(step.id, { key: value })
                          else if (step.kind === 'navigate') patchStep(step.id, { url: value })
                          else if (step.kind === 'select-option')
                            patchStep(step.id, { optionValue: value })
                          else if (step.kind === 'scroll')
                            patchStep(step.id, { deltaY: Number(value) || 0 })
                          else patchStep(step.id, { text: value })
                        }}
                        spellCheck={false}
                      />
                    </FieldRow>
                  ) : null}

                  {step.assertion ? (
                    <>
                      <FieldRow label="Doğrulama">
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
                      </FieldRow>

                      <FieldRow label="Beklenen">
                        <input
                          value={step.assertion.expected}
                          onChange={(event) =>
                            patchAssertion(step.id, { expected: event.target.value })
                          }
                          spellCheck={false}
                        />
                      </FieldRow>

                      <Toggle
                        label="Yumuşak doğrulama"
                        checked={step.assertion.soft}
                        onChange={(next) => patchAssertion(step.id, { soft: next })}
                      />
                    </>
                  ) : null}

                  <FieldRow label="Zaman aşımı" hint="milisaniye">
                    <input
                      type="number"
                      value={step.timeoutMs}
                      onChange={(event) =>
                        patchStep(step.id, { timeoutMs: Number(event.target.value) || 0 })
                      }
                    />
                  </FieldRow>

                  <FieldRow label="Deneme">
                    <input
                      type="number"
                      value={step.retries}
                      onChange={(event) =>
                        patchStep(step.id, { retries: Number(event.target.value) || 0 })
                      }
                    />
                  </FieldRow>

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

                  {step.target ? (
                    <div className="kv">
                      <span className="kv-key">hedef</span>
                      <span className="kv-val">{step.target.label || step.target.kind}</span>
                      <span className="kv-key">tür</span>
                      <span className="kv-val">{step.target.kind}</span>
                      {step.target.descriptor ? (
                        <>
                          <span className="kv-key">kalite</span>
                          <span className="kv-val">
                            {percent(step.target.descriptor.quality.score)}
                          </span>
                          <span className="kv-key">strateji</span>
                          <span className="kv-val">
                            {step.target.descriptor.strategies
                              .map((entry) => entry.kind)
                              .join(', ')}
                          </span>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              ) : (
                <section className="form-group">
                  <span className="card-split">Adım</span>
                  <Empty
                    glyph="sliders"
                    text="Adım seçilmedi"
                    hint="Ortadaki listeden bir adım seçtiğinizde ayarları burada açılır."
                  />
                </section>
              )}

              <section className="form-group">
                <span className="card-split">Varsayılanlar</span>

                <FieldRow label="Tarama seviyesi">
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
                </FieldRow>

                <FieldRow label="Adım zaman aşımı" hint="milisaniye">
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
                </FieldRow>

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
              </section>

              <section className="form-group">
                <span className="card-split">Künye</span>

                <div className="kv">
                  <span className="kv-key">şema</span>
                  <span className="kv-val mono">{draft.version}</span>
                  <span className="kv-key">kimlik</span>
                  <span className="kv-val mono">{draft.id}</span>
                  <span className="kv-key">adres</span>
                  <span className="kv-val mono">{shortUrl(draft.baseUrl)}</span>
                </div>
              </section>
            </>
          ) : (
            <Empty
              glyph="sliders"
              text="Ayar yok"
              hint="Bir senaryo açtığınızda senaryo, adım ve varsayılan ayarları burada düzenlenir."
            />
          )}
        </Card>
      </div>
    </div>
  )
}
