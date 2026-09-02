import React, { useCallback, useEffect, useMemo, useState } from 'react'
import type { RunDetail, RunRow, ScenarioIndexRow } from '../../../main/data'
import type { FailureContext, RunStatus } from '../../../main/scenario/types'
import { Glyph, IconButton } from '../icons'
import { Card, Empty, Metric, PageHead, Pill, Segmented, TextButton } from '../ui'
import { formatBytes, formatMs, formatShortDate, percent } from '../format'
import ContextView from '../parts/ContextView'
import ShotView from '../parts/ShotView'
import type { Report } from '../report'

const PAGE_SIZE = 40

const STATUS_FILTERS: { id: string; label: string }[] = [
  { id: 'all', label: 'Tümü' },
  { id: 'passed', label: 'Başarılı' },
  { id: 'failed', label: 'Başarısız' },
  { id: 'errored', label: 'Hata' },
  { id: 'aborted', label: 'İptal' }
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

export default function ResultPage({
  revision,
  onReport
}: {
  revision: number
  onReport: (report: Report) => void
}): React.JSX.Element {
  const [rows, setRows] = useState<RunRow[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [status, setStatus] = useState('all')
  const [scenarioId, setScenarioId] = useState('')
  const [scenarios, setScenarios] = useState<ScenarioIndexRow[]>([])
  const [selected, setSelected] = useState('')
  const [detail, setDetail] = useState<RunDetail | null>(null)
  const [tab, setTab] = useState<Tab>('steps')
  const [text, setText] = useState('')
  const [context, setContext] = useState<FailureContext | null>(null)
  const [shot, setShot] = useState<string | null>(null)
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
      setText('')
      setContext(null)
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
    [onReport]
  )

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
      setTab('contexts')
    },
    [onReport]
  )

  const pages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total])
  const page = Math.floor(offset / PAGE_SIZE) + 1
  const run = detail?.run ?? null

  return (
    <div className="page">
      <PageHead
        title="Sonuçlar"
        meta={
          <>
            <Pill>{total} koşum</Pill>
            {run ? (
              <Pill tone={run.ok ? 'ok' : 'bad'}>{RUN_LABELS[run.status] ?? run.status}</Pill>
            ) : null}
          </>
        }
        actions={
          <>
            <Segmented
              items={STATUS_FILTERS}
              value={status}
              onPick={(id) => {
                setStatus(id)
                setOffset(0)
              }}
            />
            <IconButton
              name="reload"
              title="Yenile"
              onClick={() => void load()}
              disabled={busy}
              small
            />
          </>
        }
      />

      <div className="page-body cols-2">
        <Card
          label="Koşumlar"
          scroll
          actions={
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
          }
        >
          {rows.length ? (
            <>
              <div className="list">
                {rows.map((entry) => (
                  <button
                    key={entry.id}
                    className={'list-row' + (entry.id === selected ? ' sel' : '')}
                    onClick={() => void open(entry.id)}
                    type="button"
                  >
                    <span className={'dot ' + (entry.ok ? 'ok' : 'bad')} />
                    <span className="list-title">{entry.scenarioTitle}</span>
                    <span className="list-meta">
                      {entry.passed}/{entry.steps}
                    </span>
                    <span className="list-meta">{formatMs(entry.totalMs)}</span>
                    <span className="list-meta">{formatShortDate(entry.startedAt)}</span>
                  </button>
                ))}
              </div>

              {pages > 1 ? (
                <div className="pager">
                  <IconButton
                    name="back"
                    title="Önceki"
                    onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                    disabled={offset === 0}
                    small
                  />
                  <span className="pager-text">
                    {page} / {pages}
                  </span>
                  <IconButton
                    name="forward"
                    title="Sonraki"
                    onClick={() => setOffset(offset + PAGE_SIZE)}
                    disabled={page >= pages}
                    small
                  />
                </div>
              ) : null}
            </>
          ) : (
            <Empty glyph="history" text="Koşum kaydı yok" />
          )}
        </Card>

        <Card
          label="Koşum ayrıntısı"
          grow
          scroll
          actions={
            detail ? (
              <Segmented
                items={[
                  { id: 'steps', label: 'Adımlar' },
                  { id: 'contexts', label: 'Bağlam' },
                  { id: 'report', label: 'Rapor' }
                ]}
                value={tab}
                onPick={(id) => setTab(id as Tab)}
              />
            ) : null
          }
        >
          {detail && run ? (
            <>
              <div className="metric-row">
                <Metric label="adım" value={run.steps} />
                <Metric label="geçen" value={run.passed} tone="ok" />
                <Metric label="kalan" value={run.failed} tone={run.failed ? 'bad' : 'flat'} />
                <Metric label="güven" value={percent(run.meanConfidence)} />
                <Metric label="süre" value={formatMs(run.totalMs)} />
                <Metric label="tarama" value={detail.metrics.scans} />
                <Metric label="kesin" value={detail.metrics.resolvedExact} />
                <Metric
                  label="düşük"
                  value={detail.metrics.resolvedLow}
                  tone={detail.metrics.resolvedLow ? 'warn' : 'flat'}
                />
                <Metric
                  label="bulunamayan"
                  value={detail.metrics.resolvedMissing}
                  tone={detail.metrics.resolvedMissing ? 'bad' : 'flat'}
                />
              </div>

              {detail.failures.length ? (
                <div className="issues">
                  {detail.failures.slice(0, 5).map((failure, index) => (
                    <div key={index} className="issue bad">
                      <Glyph name="alert" size={12} />
                      {failure}
                    </div>
                  ))}
                </div>
              ) : null}

              {tab === 'steps' ? (
                <div className="table">
                  <div className="tr th">
                    <span className="td no">#</span>
                    <span className="td grow">adım</span>
                    <span className="td">tür</span>
                    <span className="td">güven</span>
                    <span className="td">süre</span>
                    <span className="td">durum</span>
                  </div>
                  {detail.steps.map((entry) => (
                    <div key={entry.runId + entry.stepIndex} className="tr">
                      <span className="td no">{entry.stepIndex + 1}</span>
                      <span className="td grow">{entry.title}</span>
                      <span className="td dim">{entry.kind}</span>
                      <span className="td">
                        {entry.confidence ? percent(entry.confidence) : '—'}
                      </span>
                      <span className="td">{formatMs(entry.durationMs)}</span>
                      <span className="td">
                        <Pill
                          tone={
                            entry.status === 'passed'
                              ? 'ok'
                              : entry.status === 'skipped'
                                ? 'flat'
                                : 'bad'
                          }
                        >
                          {STEP_LABELS[entry.status] ?? entry.status}
                        </Pill>
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}

              {tab === 'contexts' ? (
                detail.contexts.length ? (
                  <>
                    <div className="list">
                      {detail.contexts.map((entry) => (
                        <button
                          key={entry.id}
                          className={'list-row' + (entry.id === context?.id ? ' sel' : '')}
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

                    {context ? (
                      <ContextView
                        context={context}
                        inline
                        onClose={() => setContext(null)}
                        onShot={setShot}
                      />
                    ) : null}
                  </>
                ) : (
                  <Empty glyph="layers" text="Bağlam paketi yok" />
                )
              ) : null}

              {tab === 'report' ? (
                text ? (
                  <pre className="report-text">{text}</pre>
                ) : (
                  <div className="center">
                    <TextButton
                      glyph="file"
                      label="Raporu getir"
                      onClick={() => void loadReport()}
                    />
                  </div>
                )
              ) : null}
            </>
          ) : (
            <Empty glyph="history" text="Koşum seçilmedi" />
          )}
        </Card>
      </div>

      {shot ? <ShotView data={shot} onClose={() => setShot(null)} /> : null}
    </div>
  )
}
