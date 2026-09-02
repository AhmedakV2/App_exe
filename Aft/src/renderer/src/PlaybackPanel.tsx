import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ContextPayload,
  ProgressPayload,
  RunPayload,
  ScenarioPayload
} from '../../main/bridge/playback-types'
import type { ScenarioEntry } from '../../main/scenario/ScenarioStore'
import type {
  FailureContext,
  PlaybackOptions,
  RunResult,
  StepResult,
  StepStatus,
  StoredContext
} from '../../main/scenario/types'
import { Glyph, IconButton } from './icons'

type ReportLevel = 'ok' | 'err' | 'note'

export type PlaybackReport = { level: ReportLevel; text: string; detail?: string[] }

const STATUS_LABELS: Record<StepStatus, string> = {
  passed: 'geçti',
  failed: 'kaldı',
  errored: 'hata',
  skipped: 'atlandı'
}

const RUN_LABELS: Record<string, string> = {
  passed: 'başarılı',
  failed: 'başarısız',
  errored: 'hata',
  aborted: 'iptal'
}

function statusClass(status: StepStatus): string {
  if (status === 'passed') return 'ok'
  if (status === 'skipped') return 'muted'
  return 'bad'
}

function formatMs(ms: number): string {
  if (ms < 1000) return ms + ' ms'
  return (ms / 1000).toFixed(1).replace('.', ',') + ' sn'
}

function formatDate(at: number): string {
  if (!at) return ''
  const stamp = new Date(at)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return (
    pad(stamp.getDate()) +
    '.' +
    pad(stamp.getMonth() + 1) +
    ' ' +
    pad(stamp.getHours()) +
    ':' +
    pad(stamp.getMinutes())
  )
}

function flatten(steps: readonly StepResult[]): StepResult[] {
  const out: StepResult[] = []
  for (const step of steps) {
    out.push(step)
    if (step.children.length) out.push(...flatten(step.children))
  }
  return out
}

const StepLine = memo(function StepLine({ step }: { step: StepResult }): React.JSX.Element {
  const confidence = step.resolution ? Math.round(step.resolution.confidence * 100) : null

  return (
    <div className={'play-step ' + statusClass(step.status)}>
      <span className="play-step-no">{step.index + 1}</span>
      <span className="play-step-dot" />
      <span className="play-step-title">{step.title}</span>
      {confidence === null ? null : <span className="play-step-conf">%{confidence}</span>}
      <span className="play-step-ms">{formatMs(step.durationMs)}</span>
      <span className="play-step-state">{STATUS_LABELS[step.status]}</span>
    </div>
  )
})

const ContextView = memo(function ContextView({
  context,
  onClose,
  onShot
}: {
  context: FailureContext
  onClose: () => void
  onShot: (data: string) => void
}): React.JSX.Element {
  const resolution = context.resolution

  return (
    <div className="play-context">
      <div className="play-context-head">
        <span className="play-block-label">Hata bağlamı</span>
        <button className="ghost-btn" title="Kapat" onClick={onClose} type="button">
          <Glyph name="close" size={13} />
        </button>
      </div>

      <div className="play-facts">
        <span className="play-tag">{context.stepTitle}</span>
        <span className="play-tag">seviye {context.scanLevel}</span>
        {context.coverage ? (
          <span className="play-tag">{context.coverage.interactive} etkileşilebilir</span>
        ) : null}
        {context.blindSpots.length ? (
          <span className="play-tag warn">{context.blindSpots.length} kör nokta</span>
        ) : null}
        <span className="play-tag">{context.elements.length} eleman</span>
      </div>

      <div className="play-context-url">{context.url}</div>
      <div className="play-context-msg">{context.message}</div>

      {resolution ? (
        <div className="play-trace">
          <span className="play-block-label">Denenen stratejiler</span>
          {resolution.trace.map((entry, position) => (
            <div key={position} className="play-trace-row">
              <span className="play-trace-kind">{entry.kind}</span>
              <span className="play-trace-detail">
                {entry.skipped ? 'atlandı' : entry.matched + ' aday'} · {entry.reason}
              </span>
            </div>
          ))}
          {resolution.candidates.length ? (
            <div className="play-trace-row">
              <span className="play-trace-kind">adaylar</span>
              <span className="play-trace-detail">
                {resolution.candidates
                  .slice(0, 4)
                  .map(
                    (entry) => 'sıra ' + entry.ordinal + ' (%' + Math.round(entry.score * 100) + ')'
                  )
                  .join(', ')}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {context.assertions.length ? (
        <div className="play-trace">
          <span className="play-block-label">Doğrulamalar</span>
          {context.assertions.map((entry, position) => (
            <div key={position} className="play-trace-row">
              <span className="play-trace-kind">{entry.kind}</span>
              <span className="play-trace-detail">
                beklenen {entry.expected} · bulunan {entry.actual}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {context.blindSpots.length ? (
        <div className="play-trace">
          <span className="play-block-label">Erişilemeyen bölgeler</span>
          {context.blindSpots.slice(0, 6).map((spot, position) => (
            <div key={position} className="play-trace-row">
              <span className="play-trace-kind">{spot.kind}</span>
              <span className="play-trace-detail">{spot.detail}</span>
            </div>
          ))}
        </div>
      ) : null}

      {context.screenshot ? (
        <button
          className="play-shot-btn"
          onClick={() => onShot(context.screenshot)}
          title="Hata anı görüntüsünü büyüt"
          aria-label="Hata anı görüntüsünü büyüt"
          type="button"
        >
          <img
            className="play-shot"
            src={'data:image/png;base64,' + context.screenshot}
            alt="Hata anı ekran görüntüsü"
          />
          <span className="play-shot-hint">
            <Glyph name="zoom" size={13} />
            büyüt
          </span>
        </button>
      ) : null}
    </div>
  )
})

const ShotView = memo(function ShotView({
  data,
  onClose
}: {
  data: string
  onClose: () => void
}): React.JSX.Element {
  const closeRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    closeRef.current?.focus()
    window.aft.setModal(true)

    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.aft.setModal(false)
    }
  }, [onClose])

  return (
    <div
      className="shot-view"
      role="dialog"
      aria-modal="true"
      aria-label="Hata anı ekran görüntüsü"
      onClick={onClose}
    >
      <div className="shot-frame" onClick={(event) => event.stopPropagation()}>
        <button
          ref={closeRef}
          className="shot-close"
          title="Kapat"
          aria-label="Kapat"
          onClick={onClose}
          type="button"
        >
          <Glyph name="close" size={16} />
        </button>
        <img
          className="shot-img"
          src={'data:image/png;base64,' + data}
          alt="Hata anı ekran görüntüsü"
        />
      </div>
    </div>
  )
})

export default function PlaybackPanel({
  active,
  revision,
  blocked,
  onReport,
  onBusy
}: {
  active: boolean
  revision: number
  blocked: boolean
  onReport: (report: PlaybackReport) => void
  onBusy: (running: boolean) => void
}): React.JSX.Element {
  const [entries, setEntries] = useState<ScenarioEntry[]>([])
  const [selected, setSelected] = useState('')
  const [detail, setDetail] = useState<ScenarioPayload | null>(null)
  const [live, setLive] = useState<StepResult[]>([])
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [run, setRun] = useState<RunResult | null>(null)
  const [contexts, setContexts] = useState<StoredContext[]>([])
  const [context, setContext] = useState<FailureContext | null>(null)
  const [options, setOptions] = useState<Partial<PlaybackOptions>>({
    screenshotOnFailure: true,
    stopOnFailure: true
  })
  const [shot, setShot] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [running, setRunning] = useState(false)

  const reportRef = useRef(onReport)
  const busyRef = useRef(onBusy)
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    reportRef.current = onReport
    busyRef.current = onBusy
  }, [onBusy, onReport])

  useEffect(() => {
    busyRef.current(running)
  }, [running])

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const result = await window.aftPlayback.list()
      if (!result.ok || !result.data) {
        reportRef.current({ level: 'err', text: 'Senaryo listesi alınamadı: ' + result.message })
        return
      }
      setEntries(result.data.entries)
    } catch (error) {
      reportRef.current({ level: 'err', text: 'Köprü hatası: ' + (error as Error).message })
    }
  }, [])

  useEffect(() => {
    if (!active) return
    let alive = true

    window.aftPlayback
      .list()
      .then((result) => {
        if (!alive || !result.ok || !result.data) return
        setEntries(result.data.entries)
      })
      .catch((error: Error) => {
        reportRef.current({ level: 'err', text: 'Oynatma köprüsü hazır değil: ' + error.message })
      })

    return () => {
      alive = false
    }
  }, [active, revision])

  useEffect(() => {
    const off = window.aftPlayback.onProgress((payload: ProgressPayload) => {
      setProgress({ done: payload.done, total: payload.total })
      setLive((prev) => prev.concat(payload.step))
    })
    return off
  }, [])

  useEffect(() => {
    window.aftPlayback
      .last()
      .then((result) => {
        if (result.ok && result.data) setRun(result.data)
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [live.length])

  const select = useCallback(async (id: string): Promise<void> => {
    setSelected(id)
    setBusy(true)
    try {
      const result = await window.aftPlayback.get(id)
      if (!result.ok || !result.data) {
        reportRef.current({ level: 'err', text: 'Senaryo okunamadı: ' + result.message })
        setDetail(null)
        return
      }
      setDetail(result.data)
    } catch (error) {
      reportRef.current({ level: 'err', text: 'Köprü hatası: ' + (error as Error).message })
    } finally {
      setBusy(false)
    }
  }, [])

  const start = useCallback(async (): Promise<void> => {
    if (!selected) return

    setRunning(true)
    setLive([])
    setRun(null)
    setContext(null)
    setContexts([])
    setProgress({ done: 0, total: detail?.scenario.steps.length ?? 0 })

    try {
      const result = await window.aftPlayback.run({ scenarioId: selected, options })
      if (!result.ok || !result.data) {
        reportRef.current({ level: 'err', text: 'Koşum başarısız: ' + result.message })
        return
      }

      const payload: RunPayload = result.data
      setRun(payload.run)

      reportRef.current({
        level: payload.run.ok ? 'ok' : 'err',
        text:
          'Koşum ' +
          (RUN_LABELS[payload.run.status] ?? payload.run.status) +
          ': ' +
          payload.run.scenarioTitle,
        detail: [
          'geçen ' + payload.run.metrics.passed + ' / ' + payload.run.metrics.steps,
          'tarama ' + payload.run.metrics.scans,
          'süre ' + formatMs(payload.run.metrics.totalMs),
          ...payload.run.failures.slice(0, 3)
        ]
      })

      if (payload.run.contexts.length) {
        const stored = await window.aftPlayback.contexts()
        if (stored.ok && stored.data) setContexts(stored.data.contexts)
      }
    } catch (error) {
      reportRef.current({ level: 'err', text: 'Köprü hatası: ' + (error as Error).message })
    } finally {
      setRunning(false)
    }
  }, [detail, options, selected])

  const cancel = useCallback((): void => {
    void window.aftPlayback.cancel().then((result) => {
      if (result.ok) reportRef.current({ level: 'note', text: 'Koşum iptal edildi' })
    })
  }, [])

  const remove = useCallback(async (): Promise<void> => {
    if (!selected) return
    setBusy(true)
    try {
      const result = await window.aftPlayback.remove(selected)
      if (!result.ok) {
        reportRef.current({ level: 'err', text: 'Senaryo silinemedi: ' + result.message })
        return
      }
      setSelected('')
      setDetail(null)
      reportRef.current({ level: 'note', text: 'Senaryo silindi' })
      await refresh()
    } finally {
      setBusy(false)
    }
  }, [refresh, selected])

  const openContext = useCallback(async (id: string): Promise<void> => {
    try {
      const result = await window.aftPlayback.context(id)
      if (!result.ok || !result.data) {
        reportRef.current({ level: 'err', text: 'Bağlam paketi okunamadı: ' + result.message })
        return
      }
      const payload: ContextPayload = result.data
      setContext(payload.context)
    } catch (error) {
      reportRef.current({ level: 'err', text: 'Köprü hatası: ' + (error as Error).message })
    }
  }, [])

  const closeShot = useCallback((): void => setShot(null), [])

  const toggle = useCallback((key: keyof PlaybackOptions): void => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const shown = useMemo(() => (run ? flatten(run.steps) : live), [live, run])
  const report = detail?.report ?? null
  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <section className="play">
      <div className="play-bar">
        <IconButton
          name="play"
          title="Senaryoyu çalıştır"
          onClick={() => void start()}
          disabled={busy || running || blocked || !selected || !report?.ok}
          small
          active={!running}
        />
        <IconButton
          name="square"
          title="Koşumu durdur"
          onClick={cancel}
          disabled={!running}
          small
        />
        <span className="play-bar-gap" />
        <IconButton
          name="camera"
          title="Hata anında ekran görüntüsü"
          onClick={() => toggle('screenshotOnFailure')}
          active={Boolean(options.screenshotOnFailure)}
          disabled={running}
          small
        />
        <IconButton
          name="flag"
          title="İlk hatada dur"
          onClick={() => toggle('stopOnFailure')}
          active={Boolean(options.stopOnFailure)}
          disabled={running}
          small
        />
        <IconButton
          name="reload"
          title="Listeyi yenile"
          onClick={() => void refresh()}
          disabled={running}
          small
        />
        <IconButton
          name="trash"
          title="Senaryoyu sil"
          onClick={() => void remove()}
          disabled={busy || running || !selected}
          small
          danger
        />
      </div>

      {blocked ? <div className="play-note">Kayıt sürerken koşum başlatılamaz.</div> : null}

      <div className="play-library">
        {entries.length ? (
          entries.map((entry) => (
            <button
              key={entry.id}
              className={'play-row' + (entry.id === selected ? ' sel' : '')}
              onClick={() => void select(entry.id)}
              disabled={running}
              type="button"
            >
              <Glyph name="file" size={13} />
              <span className="play-row-title">{entry.title}</span>
              <span className="play-row-meta">{entry.steps} adım</span>
              <span className="play-row-meta">{formatDate(entry.updatedAt)}</span>
            </button>
          ))
        ) : (
          <div className="play-empty">
            <Glyph name="file" size={20} />
            <span>Kayıtlı senaryo yok.</span>
            <span className="muted">Kayıt panelinden bir senaryo kaydedin.</span>
          </div>
        )}
      </div>

      {detail ? (
        <div className="play-detail">
          <span className="play-detail-url">{detail.scenario.baseUrl}</span>
          <div className="play-facts">
            <span className="play-tag">{detail.scenario.steps.length} adım</span>
            <span className="play-tag">seviye {detail.scenario.defaults.scanLevel}</span>
            <span className="play-tag">{detail.scenario.defaults.retries} deneme</span>
            {report?.ok ? (
              <span className="play-tag ok">doğrulandı</span>
            ) : (
              <span className="play-tag bad">{report?.errors.length ?? 0} hata</span>
            )}
            {report?.warnings.length ? (
              <span className="play-tag warn">{report.warnings.length} uyarı</span>
            ) : null}
          </div>
          {report && !report.ok
            ? report.errors.slice(0, 3).map((issue, position) => (
                <div key={position} className="play-issue bad">
                  {issue.path}: {issue.message}
                </div>
              ))
            : null}
        </div>
      ) : null}

      {running ? (
        <div className="play-progress">
          <div className="play-progress-bar" style={{ width: percent + '%' }} />
          <span className="play-progress-text">
            {progress.done} / {progress.total} adım
          </span>
        </div>
      ) : null}

      <div className="play-steps" ref={listRef}>
        {shown.map((step) => (
          <StepLine key={step.stepId + step.index} step={step} />
        ))}
      </div>

      {run ? (
        <div className="play-result">
          <div className="play-facts">
            <span className={'play-tag ' + (run.ok ? 'ok' : 'bad')}>
              {RUN_LABELS[run.status] ?? run.status}
            </span>
            <span className="play-tag">
              {run.metrics.passed}/{run.metrics.steps} geçti
            </span>
            <span className="play-tag">kesin {run.metrics.resolvedExact}</span>
            {run.metrics.resolvedLow ? (
              <span className="play-tag warn">düşük {run.metrics.resolvedLow}</span>
            ) : null}
            {run.metrics.resolvedMissing ? (
              <span className="play-tag bad">bulunamayan {run.metrics.resolvedMissing}</span>
            ) : null}
            <span className="play-tag">güven %{Math.round(run.metrics.meanConfidence * 100)}</span>
            <span className="play-tag">tarama {run.metrics.scans}</span>
            <span className="play-tag">{formatMs(run.metrics.totalMs)}</span>
          </div>

          {run.failures.slice(0, 3).map((failure, position) => (
            <div key={position} className="play-issue bad">
              {failure}
            </div>
          ))}

          {contexts.length ? (
            <div className="play-contexts">
              <span className="play-block-label">Hata bağlam paketleri</span>
              <div className="play-options">
                {contexts.slice(0, 6).map((entry) => (
                  <button
                    key={entry.id}
                    className="play-option"
                    onClick={() => void openContext(entry.id)}
                    type="button"
                  >
                    <Glyph name="alert" size={12} />
                    <span>{entry.id}</span>
                    <span className="play-option-meta">{Math.round(entry.bytes / 1024)} KB</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {context ? (
        <ContextView context={context} onClose={() => setContext(null)} onShot={setShot} />
      ) : null}

      {active && shot ? <ShotView data={shot} onClose={closeShot} /> : null}
    </section>
  )
}
