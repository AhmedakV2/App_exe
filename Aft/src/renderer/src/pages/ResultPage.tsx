import React, { useCallback, useEffect, useMemo, useState } from 'react'
import type { RunDetail, RunRow, RunStepRow, ScenarioIndexRow } from '../../../main/data'
import type { FailureContext, RunStatus } from '../../../main/scenario/types'
import { Glyph } from '../icons'
import { Empty, Metric, Pill, Segmented, Sym, TextButton } from '../ui'
import { formatBytes, formatDate, formatMs, formatShortDate, percent } from '../format'
import ContextView from '../parts/ContextView'
import ShotView from '../parts/ShotView'
import type { Report } from '../report'

const PAGE_SIZE = 40

const STATUS_FILTERS: { id: string; label: string }[] = [
  { id: 'all', label: 'Tümü' },
  { id: 'passed', label: 'Başarılı' },
  { id: 'failed', label: 'Başarısız' },
  { id: 'errored', label: 'Hata' }
]

const RUN_LABELS: Record<string, string> = {
  passed: 'başarılı',
  failed: 'başarısız',
  errored: 'hata',
  aborted: 'iptal'
}

const STEP_LABELS: Record<string, string> = {
  passed: 'geçti',
  failed: 'kaldı',
  errored: 'hata',
  skipped: 'atlandı'
}

type Tab = 'steps' | 'contexts' | 'report'

type Span = { row: RunStepRow; start: number; end: number; number: string }

function tone(status: string): 'ok' | 'bad' | 'warn' | 'flat' {
  if (status === 'passed') return 'ok'
  if (status === 'skipped') return 'flat'
  if (status === 'errored') return 'warn'
  return 'bad'
}

function runTone(row: RunRow): 'ok' | 'bad' | 'warn' {
  if (row.ok) return 'ok'
  return row.status === 'failed' ? 'bad' : 'warn'
}

function spansOf(rows: RunStepRow[]): Span[] {
  const parents = new Set(
    rows.map((row) => row.parentIndex).filter((value): value is number => value !== null)
  )
  const childCounter = new Map<number, number>()
  const numbers = new Map<number, string>()
  let top = 0
  let cursor = 0
  const out: Span[] = []
  const starts = new Map<number, number>()
  for (const row of rows) {
    let number: string
    if (row.parentIndex === null) {
      top += 1
      number = String(top)
    } else {
      const count = (childCounter.get(row.parentIndex) ?? 0) + 1
      childCounter.set(row.parentIndex, count)
      number = (numbers.get(row.parentIndex) ?? '') + '.' + count
    }
    numbers.set(row.stepIndex, number)
    if (parents.has(row.stepIndex)) {
      starts.set(row.stepIndex, cursor)
      out.push({ row, start: cursor, end: cursor, number })
      continue
    }
    out.push({ row, start: cursor, end: cursor + row.durationMs, number })
    cursor += row.durationMs
  }
  for (const span of out) {
    if (!parents.has(span.row.stepIndex)) continue
    const children = out.filter((item) => item.row.parentIndex === span.row.stepIndex)
    span.end = children.length
      ? Math.max(...children.map((item) => item.end))
      : span.start + span.row.durationMs
  }
  return out
}

export default function ResultPage({
  revision,
  focusRun,
  onReport,
  onRun,
  onFocus
}: {
  revision: number
  focusRun: string
  onReport: (report: Report) => void
  onRun: (scenarioId: string) => void
  onFocus: (id: string) => void
}): React.JSX.Element {
  const [rows, setRows] = useState<RunRow[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [status, setStatus] = useState('all')
  const [scenarioId, setScenarioId] = useState('')
  const [scenarios, setScenarios] = useState<ScenarioIndexRow[]>([])
  const [selected, setSelected] = useState(focusRun)
  const [detail, setDetail] = useState<RunDetail | null>(null)
  const [tab, setTab] = useState<Tab>('steps')
  const [text, setText] = useState('')
  const [context, setContext] = useState<FailureContext | null>(null)
  const [shot, setShot] = useState<string | null>(null)
  const [stepSel, setStepSel] = useState(-1)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      const result = await window.aftData.runs({
        scenarioId,
        status: status === 'all' ? null : (status as RunStatus),
        limit: PAGE_SIZE,
        offset
      })
      if (!result.ok || !result.data) {
        onReport({ level: 'err', text: 'Koşum listesi alınamadı: ' + result.message })
        return
      }
      setRows(result.data.rows)
      setTotal(result.data.total)
    } catch (error) {
      onReport({ level: 'err', text: 'Köprü hatası: ' + (error as Error).message })
    } finally {
      setBusy(false)
    }
  }, [offset, onReport, scenarioId, status])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load, revision])

  useEffect(() => {
    window.aftData
      .scenarios()
      .then((result) => {
        if (result.ok && result.data) setScenarios(result.data.rows)
      })
      .catch(() => undefined)
  }, [revision])

  const open = useCallback(
    async (id: string): Promise<void> => {
      setSelected(id)
      onFocus(id)
      setText('')
      setStepSel(-1)
      setBusy(true)
      try {
        const result = await window.aftData.run(id)
        if (!result.ok || !result.data) {
          onReport({ level: 'err', text: 'Koşum okunamadı: ' + result.message })
          setDetail(null)
          return
        }
        setDetail(result.data.detail)
      } finally {
        setBusy(false)
      }
    },
    [onFocus, onReport]
  )

  useEffect(() => {
    if (!focusRun || focusRun === detail?.run.id) return
    const timer = window.setTimeout(() => void open(focusRun), 0)
    return () => window.clearTimeout(timer)
  }, [detail?.run.id, focusRun, open])

  useEffect(() => {
    if (selected || !rows.length) return
    const first = rows[0].id
    const timer = window.setTimeout(() => void open(first), 0)
    return () => window.clearTimeout(timer)
  }, [open, rows, selected])

  const loadReport = useCallback(async (): Promise<void> => {
    if (!selected) return
    const result = await window.aftData.report(selected)
    if (!result.ok || !result.data) {
      onReport({ level: 'err', text: 'Rapor okunamadı: ' + result.message })
      return
    }
    setText(result.data.text)
  }, [onReport, selected])

  useEffect(() => {
    if (tab !== 'report' || !selected || text) return
    const timer = window.setTimeout(() => void loadReport(), 0)
    return () => window.clearTimeout(timer)
  }, [loadReport, selected, tab, text])

  const openContext = useCallback(
    async (id: string): Promise<void> => {
      const result = await window.aftPlayback.context(id)
      if (!result.ok || !result.data) {
        onReport({ level: 'err', text: 'Bağlam okunamadı: ' + result.message })
        return
      }
      setContext(result.data.context)
    },
    [onReport]
  )

  const copyReport = useCallback(async (): Promise<void> => {
    if (!selected) return
    const result = await window.aftData.report(selected)
    if (!result.ok || !result.data) {
      onReport({ level: 'err', text: 'Rapor okunamadı: ' + result.message })
      return
    }
    try {
      await navigator.clipboard.writeText(result.data.text)
      onReport({ level: 'ok', text: 'Rapor panoya kopyalandı' })
    } catch {
      setText(result.data.text)
      setTab('report')
    }
  }, [onReport, selected])

  const pages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total])
  const page = Math.floor(offset / PAGE_SIZE) + 1
  const run = detail?.run ?? null
  const spans = useMemo(() => (detail ? spansOf(detail.steps) : []), [detail])
  const totalMs = useMemo(() => Math.max(1, ...spans.map((span) => span.end)), [spans])
  const stepRow =
    stepSel >= 0 ? (detail?.steps.find((row) => row.stepIndex === stepSel) ?? null) : null
  const scale = useMemo(
    () => Array.from({ length: 10 }, (_, index) => formatMs((totalMs * index) / 10)),
    [totalMs]
  )

  return (
    <>
      <div className="split" style={{ gridTemplateColumns: '300px 1fr' }}>
        <div className="col">
          <div className="ph">
            Koşumlar
            <span className="push" />
            <span className="plain">{total}</span>
            <button
              className="ib"
              title="Yenile"
              onClick={() => void load()}
              disabled={busy}
              type="button"
            >
              <Glyph name="reload" size={13} />
            </button>
          </div>
          <div
            className="pad"
            style={{ padding: '8px 10px', borderBottom: '1px solid var(--line)', gap: 6 }}
          >
            <Segmented
              items={STATUS_FILTERS}
              value={status}
              onPick={(id) => {
                setStatus(id)
                setOffset(0)
              }}
            />
            <select
              className="picker slim"
              value={scenarioId}
              onChange={(event) => {
                setScenarioId(event.target.value)
                setOffset(0)
              }}
              aria-label="Senaryo süzgeci"
            >
              <option value="">tüm senaryolar</option>
              {scenarios.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.title}
                </option>
              ))}
            </select>
          </div>
          <div className="col scroll" style={{ flex: 1, borderRight: 0 }}>
            {rows.length ? (
              <div className="list-rows">
                {rows.map((entry) => (
                  <button
                    key={entry.id}
                    className={'list-row' + (entry.id === selected ? ' sel' : '')}
                    onClick={() => void open(entry.id)}
                    type="button"
                  >
                    <Sym tone={runTone(entry)} />
                    <span className="list-title">{entry.scenarioTitle}</span>
                    <span className="list-meta">
                      {entry.passed}/{entry.steps} · {formatMs(entry.totalMs)}
                    </span>
                    <span className="list-meta">{formatShortDate(entry.startedAt)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <Empty glyph="history" text="Koşum kaydı yok" />
            )}
          </div>
          {pages > 1 ? (
            <div className="pager">
              <button
                className="ib"
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                disabled={offset === 0}
                type="button"
              >
                <Glyph name="back" size={13} />
              </button>
              <span className="pager-text">
                {page} / {pages}
              </span>
              <button
                className="ib"
                onClick={() => setOffset(offset + PAGE_SIZE)}
                disabled={page >= pages}
                type="button"
              >
                <Glyph name="forward" size={13} />
              </button>
            </div>
          ) : null}
        </div>

        <div className="col">
          {detail && run ? (
            <>
              <header className="hdr">
                <Sym tone={runTone(run)} />
                <span className="t">{run.scenarioTitle}</span>
                <Pill tone={run.ok ? 'ok' : 'bad'}>{RUN_LABELS[run.status] ?? run.status}</Pill>
                <span className="chip">{run.id}</span>
                <span className="mono faint">
                  {formatDate(run.startedAt)} · {formatMs(run.totalMs)}
                </span>
                <span className="push" />
                <button
                  className="ib"
                  title="Raporu kopyala"
                  onClick={() => void copyReport()}
                  type="button"
                >
                  <Glyph name="copy" size={13} />
                </button>
                <TextButton
                  glyph="play"
                  label="Çalıştır"
                  onClick={() => onRun(run.scenarioId)}
                  tone="primary"
                />
              </header>

              <div className="metrics">
                <Metric label="Adımlar" value={run.passed + ' / ' + run.steps} />
                <Metric
                  label="Kaldı · atlandı"
                  value={run.failed + ' · ' + detail.metrics.skipped}
                  tone={run.failed ? 'bad' : 'flat'}
                />
                <Metric label="Güven" value={percent(run.meanConfidence)} />
                <Metric
                  label="Süre"
                  value={formatMs(run.totalMs)}
                  hint={detail.metrics.retries + ' yeniden deneme'}
                />
                <Metric
                  label="Tarama"
                  value={detail.metrics.scans}
                  hint={formatMs(detail.metrics.scanMs)}
                />
                <Metric
                  label="Kimlik"
                  value={detail.metrics.resolvedExact}
                  hint={
                    detail.metrics.resolvedLow +
                    ' düşük · ' +
                    detail.metrics.resolvedMissing +
                    ' yok'
                  }
                  tone={
                    detail.metrics.resolvedMissing
                      ? 'bad'
                      : detail.metrics.resolvedLow
                        ? 'warn'
                        : 'flat'
                  }
                />
              </div>

              <div className="rtabs" style={{ background: 'var(--bg1)' }}>
                <button
                  className={'rtab' + (tab === 'steps' ? ' on' : '')}
                  onClick={() => setTab('steps')}
                  type="button"
                >
                  Adımlar
                </button>
                <button
                  className={'rtab' + (tab === 'contexts' ? ' on' : '')}
                  onClick={() => setTab('contexts')}
                  type="button"
                >
                  Bağlam
                  {detail.contexts.length ? (
                    <span className="chip bad">{detail.contexts.length}</span>
                  ) : null}
                </button>
                <button
                  className={'rtab' + (tab === 'report' ? ' on' : '')}
                  onClick={() => setTab('report')}
                  type="button"
                >
                  Rapor
                </button>
              </div>

              {tab === 'steps' ? (
                <div
                  className="split"
                  style={{ gridTemplateColumns: stepRow ? '1fr 300px' : '1fr' }}
                >
                  <div className="col scroll">
                    <div className="gantt">
                      <div className="gh">Adım</div>
                      <div className="gh scale">
                        {scale.map((label, index) => (
                          <span key={index}>{label}</span>
                        ))}
                      </div>
                      {spans.map((span) => {
                        const left = (span.start / totalMs) * 100
                        const width = Math.max(0.3, ((span.end - span.start) / totalMs) * 100)
                        const sel = span.row.stepIndex === stepSel
                        return (
                          <React.Fragment key={span.row.stepIndex}>
                            <div
                              className={'gl click' + (sel ? ' sel' : '')}
                              style={{ paddingLeft: 10 + (span.row.parentIndex === null ? 0 : 14) }}
                              onClick={() => setStepSel(span.row.stepIndex)}
                            >
                              <Sym tone={tone(span.row.status)} />
                              <span className="mono faint">{span.number}</span>
                              <span className="lb">{span.row.title}</span>
                            </div>
                            <div
                              className={'gb click' + (sel ? ' sel' : '')}
                              onClick={() => setStepSel(span.row.stepIndex)}
                            >
                              <i
                                className={tone(span.row.status)}
                                style={{ left: left + '%', width: width + '%' }}
                              />
                              <em style={{ left: Math.min(88, left + width + 0.8) + '%' }}>
                                {span.row.status === 'skipped'
                                  ? STEP_LABELS.skipped
                                  : formatMs(span.row.durationMs) +
                                    (span.row.attempts > 1
                                      ? ' · ' + span.row.attempts + ' deneme'
                                      : '')}
                              </em>
                            </div>
                          </React.Fragment>
                        )
                      })}
                    </div>
                  </div>
                  {stepRow ? (
                    <div className="col scroll">
                      <div className="ph">
                        Adım {stepRow.stepIndex + 1}
                        <span className="push" />
                        <Pill tone={tone(stepRow.status)}>
                          {STEP_LABELS[stepRow.status] ?? stepRow.status}
                        </Pill>
                      </div>
                      <div className="pad">
                        <dl className="kv">
                          <dt className="kv-key">Başlık</dt>
                          <dd className="kv-val">{stepRow.title}</dd>
                          <dt className="kv-key">Tür</dt>
                          <dd className="kv-val mono">{stepRow.kind}</dd>
                          <dt className="kv-key">Süre</dt>
                          <dd className="kv-val mono">{formatMs(stepRow.durationMs)}</dd>
                          <dt className="kv-key">Deneme</dt>
                          <dd className="kv-val mono">{stepRow.attempts}</dd>
                          <dt className="kv-key">Tarama</dt>
                          <dd className="kv-val mono">{stepRow.scanned ? 'evet' : 'hayır'}</dd>
                          <dt className="kv-key">Eşleşme</dt>
                          <dd
                            className={
                              'kv-val mono ' +
                              (stepRow.matchState === 'exact'
                                ? 'ok'
                                : stepRow.matchState === 'not-found'
                                  ? 'bad'
                                  : 'warn')
                            }
                          >
                            {stepRow.matchState ?? '—'}
                          </dd>
                          <dt className="kv-key">Güven</dt>
                          <dd className="kv-val mono">
                            {stepRow.confidence ? percent(stepRow.confidence) : '—'}
                          </dd>
                          <dt className="kv-key">Kalite</dt>
                          <dd className="kv-val mono">
                            {stepRow.quality ? percent(stepRow.quality) : '—'}
                          </dd>
                          <dt className="kv-key">Onarım</dt>
                          <dd className="kv-val mono">{stepRow.healed ? 'evet' : 'hayır'}</dd>
                          <dt className="kv-key">Tanımlayıcı</dt>
                          <dd className="kv-val mono">{stepRow.descriptorId || '—'}</dd>
                        </dl>
                        {stepRow.winners.length ? (
                          <div className="chip-row">
                            {stepRow.winners.map((kind) => (
                              <span key={kind} className="chip ok">
                                {kind}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {stepRow.contextId ? (
                          <TextButton
                            glyph="alert"
                            label="Hata bağlamını aç"
                            onClick={() => void openContext(stepRow.contextId)}
                            tone="primary"
                          />
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {tab === 'contexts' ? (
                <div className="col scroll">
                  {detail.failures.length ? (
                    <div className="issues">
                      {detail.failures.map((failure, index) => (
                        <div key={index} className="issue">
                          <Sym tone="bad" />
                          <span className="msg">{failure}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {detail.contexts.length ? (
                    <div className="list-rows">
                      {detail.contexts.map((entry) => (
                        <button
                          key={entry.id}
                          className="list-row"
                          onClick={() => void openContext(entry.id)}
                          type="button"
                        >
                          <Glyph name="alert" size={13} />
                          <span className="list-title mono">{entry.id}</span>
                          <span className="list-meta">{formatBytes(entry.bytes)}</span>
                          <span className="list-meta">{formatShortDate(entry.capturedAt)}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <Empty glyph="layers" text="Bağlam paketi yok" />
                  )}
                </div>
              ) : null}

              {tab === 'report' ? (
                <div className="col scroll">
                  {text ? (
                    <pre className="report-text">{text}</pre>
                  ) : (
                    <Empty glyph="file" text="Rapor yükleniyor" />
                  )}
                </div>
              ) : null}
            </>
          ) : (
            <Empty glyph="history" text={busy ? 'Yükleniyor' : 'Koşum seçilmedi'} />
          )}
        </div>
      </div>

      {context ? (
        <ContextView context={context} onClose={() => setContext(null)} onShot={setShot} />
      ) : null}
      {shot ? <ShotView data={shot} onClose={() => setShot(null)} /> : null}
    </>
  )
}
