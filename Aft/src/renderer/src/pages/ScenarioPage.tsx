import React, { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  Assertion,
  AssertionKind,
  Scenario,
  ScenarioReport,
  ScenarioStep,
  StepKind
} from '../../../main/scenario/types'
import { ASSERTION_KINDS, DEFAULT_DEFAULTS, SCENARIO_VERSION } from '../../../main/scenario/types'
import { Glyph } from '../icons'
import { Empty, Pill, Switch, Sym, TextButton } from '../ui'
import { percent } from '../format'
import type { Report } from '../report'
import type { OutlineItem } from '../workbench'
import { KIND_GLYPH, outlineOf } from '../workbench'

const LEVELS = [0, 1, 2, 3]

const ADD_KINDS: StepKind[] = ['navigate', 'wait', 'press-key', 'scroll', 'assert', 'group']

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

function mapSteps(steps: ScenarioStep[], fn: (step: ScenarioStep) => ScenarioStep): ScenarioStep[] {
  return steps.map((step) => {
    const next = fn(step)
    if (!next.steps.length) return next
    return { ...next, steps: mapSteps(next.steps, fn) }
  })
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

function insertAfter(steps: ScenarioStep[], id: string, item: ScenarioStep): ScenarioStep[] {
  const index = steps.findIndex((step) => step.id === id)
  if (index >= 0) {
    const next = steps.slice()
    next.splice(index + 1, 0, item)
    return next
  }
  return steps.map((step) =>
    step.steps.length ? { ...step, steps: insertAfter(step.steps, id, item) } : step
  )
}

function findStep(steps: ScenarioStep[], id: string): ScenarioStep | null {
  for (const step of steps) {
    if (step.id === id) return step
    const inner = findStep(step.steps, id)
    if (inner) return inner
  }
  return null
}

function valueLabel(kind: StepKind): string {
  if (kind === 'type' || kind === 'clear-type') return 'Metin'
  if (kind === 'press-key') return 'Tuş'
  if (kind === 'navigate') return 'Adres'
  if (kind === 'select-option') return 'Seçenek'
  if (kind === 'scroll') return 'Kaydırma'
  return ''
}

function valueOf(step: ScenarioStep): string {
  if (step.kind === 'press-key') return step.key
  if (step.kind === 'navigate') return step.url
  if (step.kind === 'select-option') return step.optionValue
  if (step.kind === 'scroll') return String(step.deltaY)
  if (step.kind === 'assert')
    return step.assertion ? step.assertion.kind + ' ' + step.assertion.expected : ''
  if (step.kind === 'group') return step.steps.length + ' alt adım'
  return step.text
}

function targetOf(step: ScenarioStep): string {
  if (step.target) return step.target.label || step.target.kind
  if (step.assertion?.target) return step.assertion.target.label || step.assertion.target.kind
  return valueOf(step)
}

function strategyOf(step: ScenarioStep): string {
  const descriptor = step.target?.descriptor ?? step.assertion?.target?.descriptor ?? null
  if (descriptor) return descriptor.strategies[0]?.kind ?? '—'
  const query = step.target?.query ?? step.assertion?.target?.query ?? null
  if (query) return query.kind
  return '—'
}

function scoreOf(step: ScenarioStep): number | null {
  const descriptor = step.target?.descriptor ?? step.assertion?.target?.descriptor ?? null
  return descriptor ? descriptor.quality.score : null
}

function scoreTone(score: number): 'ok' | 'warn' | 'bad' {
  if (score >= 0.82) return 'ok'
  if (score >= 0.5) return 'warn'
  return 'bad'
}

export default function ScenarioPage({
  tabId,
  scenarioId,
  revision,
  busy,
  baseUrl,
  outlineSeed,
  onReport,
  onRun,
  onChanged,
  onOutline,
  onDirty,
  onOpened,
  onClose
}: {
  tabId: string
  scenarioId: string
  revision: number
  busy: boolean
  baseUrl: string
  outlineSeed: { id: string; n: number }
  onReport: (report: Report) => void
  onRun: (scenarioId: string) => void
  onChanged: () => void
  onOutline: (items: OutlineItem[], selected: string) => void
  onDirty: (tabId: string, dirty: boolean) => void
  onOpened: (previousId: string, id: string, title: string) => void
  onClose: (tabId: string) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState<Scenario | null>(() =>
    scenarioId ? null : blankScenario(baseUrl)
  )
  const [report, setReport] = useState<ScenarioReport | null>(null)
  const [stepId, setStepId] = useState(() => (scenarioId ? '' : (draft?.steps[0]?.id ?? '')))
  const [dirty, setDirty] = useState(!scenarioId)
  const [seenSeed, setSeenSeed] = useState(outlineSeed.n)
  if (outlineSeed.n !== seenSeed) {
    setSeenSeed(outlineSeed.n)
    if (outlineSeed.id) setStepId(outlineSeed.id)
  }
  const [working, setWorking] = useState(false)
  const [addKind, setAddKind] = useState<StepKind>('navigate')
  const [saved, setSaved] = useState(Boolean(scenarioId))

  const outline = useMemo(() => (draft ? outlineOf(draft.steps) : []), [draft])
  const step = useMemo(() => (draft ? findStep(draft.steps, stepId) : null), [draft, stepId])

  useEffect(() => {
    onOutline(outline, stepId)
  }, [onOutline, outline, stepId])

  useEffect(() => {
    onDirty(tabId, dirty)
  }, [dirty, onDirty, tabId])

  const loadScenario = useCallback(async (): Promise<void> => {
    if (!scenarioId) return
    setWorking(true)
    try {
      const result = await window.aftPlayback.get(scenarioId)
      if (!result.ok || !result.data) {
        onReport({ level: 'err', text: 'Senaryo okunamadı: ' + result.message })
        return
      }
      const loaded = result.data.scenario
      setDraft(loaded)
      setReport(result.data.report)
      setStepId((prev) => prev || loaded.steps[0]?.id || '')
      setDirty(false)
    } catch (error) {
      onReport({ level: 'err', text: 'Köprü hatası: ' + (error as Error).message })
    } finally {
      setWorking(false)
    }
  }, [onReport, scenarioId])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadScenario(), 0)
    return () => window.clearTimeout(timer)
  }, [loadScenario, revision])

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

  const duplicateStep = useCallback((id: string): void => {
    setDraft((prev) => {
      if (!prev) return prev
      const source = findStep(prev.steps, id)
      if (!source) return prev
      const copy: ScenarioStep = { ...source, id: uid('st-'), steps: [] }
      return { ...prev, steps: insertAfter(prev.steps, id, copy) }
    })
    setDirty(true)
  }, [])

  const addStep = useCallback((): void => {
    const item = blankStep(addKind, addKind)
    setDraft((prev) => {
      if (!prev) return prev
      if (stepId && findStep(prev.steps, stepId))
        return { ...prev, steps: insertAfter(prev.steps, stepId, item) }
      return { ...prev, steps: prev.steps.concat(item) }
    })
    setStepId(item.id)
    setDirty(true)
  }, [addKind, stepId])

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
      setSaved(true)
      onReport({ level: 'ok', text: 'Senaryo kaydedildi: ' + result.data.scenario.title })
      onChanged()
      if (!scenarioId) onOpened(tabId, result.data.scenario.id, result.data.scenario.title)
    } catch (error) {
      onReport({ level: 'err', text: 'Köprü hatası: ' + (error as Error).message })
    } finally {
      setWorking(false)
    }
  }, [draft, onChanged, onOpened, onReport, scenarioId, tabId])

  const remove = useCallback(async (): Promise<void> => {
    if (!scenarioId) return
    setWorking(true)
    try {
      const result = await window.aftPlayback.remove(scenarioId)
      if (!result.ok) {
        onReport({ level: 'err', text: 'Senaryo silinemedi: ' + result.message })
        return
      }
      setDirty(false)
      onReport({ level: 'note', text: 'Senaryo silindi' })
      onChanged()
      onClose(tabId)
    } finally {
      setWorking(false)
    }
  }, [onChanged, onClose, onReport, scenarioId, tabId])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!event.ctrlKey || event.key.toLowerCase() !== 's') return
      event.preventDefault()
      if (dirty && !working) void save()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dirty, save, working])

  const locked = working || busy
  const errors = report?.errors ?? []
  const warnings = report?.warnings ?? []

  if (!draft) {
    return <Empty glyph="file" text={working ? 'Yükleniyor' : 'Senaryo bulunamadı'} />
  }

  return (
    <>
      <header className="hdr">
        <Glyph name="file" size={14} />
        <input
          className="t"
          value={draft.title}
          onChange={(event) => patch({ title: event.target.value })}
          spellCheck={false}
          aria-label="Senaryo başlığı"
        />
        {report ? (
          <Pill tone={report.ok ? 'ok' : 'bad'}>
            {report.ok ? 'doğrulandı' : errors.length + ' hata'}
          </Pill>
        ) : null}
        {warnings.length ? <Pill tone="warn">{warnings.length} uyarı</Pill> : null}
        {dirty ? <Pill tone="accent">kaydedilmedi</Pill> : null}
        <span className="push" />
        <TextButton
          glyph="shield"
          label="Doğrula"
          onClick={() => void validate()}
          disabled={locked}
          small
        />
        <TextButton
          glyph="play"
          label="Çalıştır"
          onClick={() => onRun(draft.id)}
          disabled={!saved || locked || dirty}
          small
        />
        <TextButton
          glyph="save"
          label="Kaydet"
          onClick={() => void save()}
          disabled={locked || !dirty}
          tone="primary"
          small
        />
        <TextButton
          glyph="trash"
          label="Sil"
          onClick={() => void remove()}
          disabled={!scenarioId || locked}
          tone="danger"
          small
        />
      </header>

      <div className="tb">
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
        <TextButton glyph="plus" label="Adım ekle" onClick={addStep} disabled={locked} small />
        <span className="sp" />
        <button
          className="ib"
          title="Yukarı"
          onClick={() => step && moveStep(step.id, -1)}
          disabled={!step || locked}
          type="button"
        >
          <Glyph name="up" size={13} />
        </button>
        <button
          className="ib"
          title="Aşağı"
          onClick={() => step && moveStep(step.id, 1)}
          disabled={!step || locked}
          type="button"
        >
          <Glyph name="down" size={13} />
        </button>
        <button
          className="ib"
          title="Çoğalt"
          onClick={() => step && duplicateStep(step.id)}
          disabled={!step || locked}
          type="button"
        >
          <Glyph name="copy" size={13} />
        </button>
        <button
          className="ib danger"
          title="Sil"
          onClick={() => step && removeStep(step.id)}
          disabled={!step || locked}
          type="button"
        >
          <Glyph name="trash" size={13} />
        </button>
        <span className="push" />
        <span className="faint">Taban</span>
        <input
          className="in mono"
          style={{ width: 240 }}
          value={draft.baseUrl}
          onChange={(event) => patch({ baseUrl: event.target.value })}
          spellCheck={false}
          aria-label="Başlangıç adresi"
        />
      </div>

      <div className="split" style={{ gridTemplateColumns: '1fr 320px' }}>
        <div className="col">
          <div className="gridwrap">
            <table className="grid">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th style={{ width: 28 }} />
                  <th style={{ width: 90 }}>Tür</th>
                  <th>Başlık</th>
                  <th style={{ width: 160 }}>Hedef</th>
                  <th style={{ width: 100 }}>Strateji</th>
                  <th style={{ width: 56 }}>Kalite</th>
                </tr>
              </thead>
              <tbody>
                {outline.map((item) => {
                  const current = findStep(draft.steps, item.id)
                  if (!current) return null
                  const score = scoreOf(current)
                  const issue = errors.find((entry) => entry.path.includes(current.id))
                  return (
                    <tr
                      key={item.id}
                      className={'click' + (item.id === stepId ? ' sel' : '')}
                      onClick={() => setStepId(item.id)}
                    >
                      <td className="num first">{item.number}</td>
                      <td className="first">
                        {issue ? (
                          <Sym tone="bad" />
                        ) : current.continueOnFailure ? (
                          <Sym tone="warn" />
                        ) : (
                          <Sym tone="flat" text="" />
                        )}
                      </td>
                      <td>
                        <span className="kind" style={{ paddingLeft: item.depth * 14 }}>
                          <Glyph name={KIND_GLYPH[current.kind] ?? 'file'} size={13} />
                          {current.kind}
                        </span>
                      </td>
                      <td>{current.title}</td>
                      <td className="mono" title={targetOf(current)}>
                        {targetOf(current) || '—'}
                      </td>
                      <td className="mono">{strategyOf(current)}</td>
                      <td className={'num' + (score === null ? '' : ' ' + scoreTone(score))}>
                        {score === null ? '—' : score.toFixed(2)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {errors.length || warnings.length ? (
            <div
              className="issues"
              style={{ borderTop: '1px solid var(--line)', maxHeight: 140, overflow: 'auto' }}
            >
              {errors.slice(0, 8).map((issue, index) => (
                <div key={'e' + index} className="issue">
                  <Sym tone="bad" />
                  <span className="msg">{issue.message}</span>
                  <span className="loc">{issue.path}</span>
                </div>
              ))}
              {warnings.slice(0, 6).map((issue, index) => (
                <div key={'w' + index} className="issue">
                  <Sym tone="warn" />
                  <span className="msg">{issue.message}</span>
                  <span className="loc">{issue.path}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="col scroll">
          <div className="ph">Özellikler</div>
          {step ? (
            <div className="pad">
              <div className="sec2">Adım</div>
              <div className="fields">
                <label>Tür</label>
                <span className="in mono">{step.kind}</span>
                <label>Başlık</label>
                <input
                  value={step.title}
                  onChange={(event) => patchStep(step.id, { title: event.target.value })}
                  spellCheck={false}
                />
                {valueLabel(step.kind) ? (
                  <>
                    <label>{valueLabel(step.kind)}</label>
                    <input
                      className="mono"
                      value={valueOf(step)}
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
                  </>
                ) : null}
                <label>Zaman aşımı</label>
                <input
                  className="mono"
                  type="number"
                  value={step.timeoutMs}
                  onChange={(event) =>
                    patchStep(step.id, { timeoutMs: Number(event.target.value) || 0 })
                  }
                />
                <label>Yeniden deneme</label>
                <input
                  className="mono"
                  type="number"
                  value={step.retries}
                  onChange={(event) =>
                    patchStep(step.id, { retries: Number(event.target.value) || 0 })
                  }
                />
              </div>

              {step.assertion ? (
                <>
                  <div className="sec2">Doğrulama</div>
                  <div className="fields">
                    <label>Tür</label>
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
                    <label>Beklenen</label>
                    <input
                      className="mono"
                      value={step.assertion.expected}
                      onChange={(event) =>
                        patchAssertion(step.id, { expected: event.target.value })
                      }
                      spellCheck={false}
                    />
                    <label>Yumuşak</label>
                    <span>
                      <Switch
                        on={step.assertion.soft}
                        label="Yumuşak doğrulama"
                        onChange={(next) => patchAssertion(step.id, { soft: next })}
                      />
                    </span>
                  </div>
                </>
              ) : null}

              {step.target ? (
                <>
                  <div className="sec2">Hedef</div>
                  <dl className="kv">
                    <dt className="kv-key">Etiket</dt>
                    <dd className="kv-val">{step.target.label || step.target.kind}</dd>
                    <dt className="kv-key">Tür</dt>
                    <dd className="kv-val mono">{step.target.kind}</dd>
                    {step.target.descriptor ? (
                      <>
                        <dt className="kv-key">Tanımlayıcı</dt>
                        <dd className="kv-val mono">{step.target.descriptor.id}</dd>
                        <dt className="kv-key">Bağlam</dt>
                        <dd className="kv-val mono">
                          {step.target.descriptor.context.urlPattern} · frame{' '}
                          {step.target.descriptor.context.frameDepth}
                        </dd>
                        <dt className="kv-key">Kalite</dt>
                        <dd
                          className={
                            'kv-val mono ' + scoreTone(step.target.descriptor.quality.score)
                          }
                        >
                          {step.target.descriptor.quality.tier} ·{' '}
                          {percent(step.target.descriptor.quality.score)}
                        </dd>
                      </>
                    ) : null}
                  </dl>
                  {step.target.descriptor ? (
                    <>
                      <span className="bar">
                        <span
                          className={'bar-fill ' + scoreTone(step.target.descriptor.quality.score)}
                          style={{
                            width: Math.round(step.target.descriptor.quality.score * 100) + '%'
                          }}
                        />
                      </span>
                      <div className="chip-row">
                        {step.target.descriptor.strategies.map((entry) => (
                          <span key={entry.kind} className="chip">
                            {entry.kind} {entry.weight.toFixed(2)}
                          </span>
                        ))}
                      </div>
                      {step.target.descriptor.quality.reasons.length ? (
                        <div className="faint" style={{ fontSize: 11 }}>
                          {step.target.descriptor.quality.reasons.join(' · ')}
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </>
              ) : null}

              <div className="sec2">Davranış</div>
              <div className="fields">
                <label>Hata olsa da devam</label>
                <span>
                  <Switch
                    on={step.continueOnFailure}
                    label="Hata olsa da devam"
                    onChange={(next) => patchStep(step.id, { continueOnFailure: next })}
                  />
                </span>
                <label>Düşük güvenle ilerle</label>
                <span>
                  <Switch
                    on={step.allowLowConfidence}
                    label="Düşük güvenle ilerle"
                    onChange={(next) => patchStep(step.id, { allowLowConfidence: next })}
                  />
                </span>
                <label>Tarama seviyesi</label>
                <select
                  value={step.scanLevel === null ? '' : String(step.scanLevel)}
                  onChange={(event) =>
                    patchStep(step.id, {
                      scanLevel:
                        event.target.value === ''
                          ? null
                          : (Number(event.target.value) as 0 | 1 | 2 | 3)
                    })
                  }
                >
                  <option value="">varsayılan</option>
                  {LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="side-empty">Adım seçilmedi</div>
          )}

          <div className="ph">Senaryo varsayılanları</div>
          <div className="pad">
            <div className="fields">
              <label>Tarama seviyesi</label>
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
              <label>Adım zaman aşımı</label>
              <input
                className="mono"
                type="number"
                value={draft.defaults.stepTimeoutMs}
                onChange={(event) =>
                  patch({
                    defaults: { ...draft.defaults, stepTimeoutMs: Number(event.target.value) || 0 }
                  })
                }
              />
              <label>Yeniden deneme</label>
              <input
                className="mono"
                type="number"
                value={draft.defaults.retries}
                onChange={(event) =>
                  patch({
                    defaults: { ...draft.defaults, retries: Number(event.target.value) || 0 }
                  })
                }
              />
              <label>İlk hatada dur</label>
              <span>
                <Switch
                  on={draft.defaults.stopOnFailure}
                  label="İlk hatada dur"
                  onChange={(next) =>
                    patch({ defaults: { ...draft.defaults, stopOnFailure: next } })
                  }
                />
              </span>
              <label>Durum doğrula</label>
              <span>
                <Switch
                  on={draft.defaults.verifyState}
                  label="Durum doğrula"
                  onChange={(next) => patch({ defaults: { ...draft.defaults, verifyState: next } })}
                />
              </span>
            </div>
            <dl className="kv">
              <dt className="kv-key">Şema</dt>
              <dd className="kv-val mono">{draft.version}</dd>
              <dt className="kv-key">Kimlik</dt>
              <dd className="kv-val mono">{draft.id}</dd>
              <dt className="kv-key">Adım</dt>
              <dd className="kv-val mono">{outline.length}</dd>
            </dl>
          </div>
        </div>
      </div>
    </>
  )
}
