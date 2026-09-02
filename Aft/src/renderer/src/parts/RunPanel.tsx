import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ScenarioEntry } from '../../../main/scenario/ScenarioStore'
import type {
  FailureContext,
  PlaybackOptions,
  RunResult,
  StepResult,
  StepStatus,
  StoredContext
} from '../../../main/scenario/types'
import { Glyph, IconButton } from '../icons'
import { Bar, Empty, Metric, Pill, TextButton } from '../ui'
import { formatMs, percent } from '../format'
import ContextView from './ContextView'
import ShotView from './ShotView'
import type { Report } from '../report'

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

function statusTone(status: StepStatus): 'ok' | 'bad' | 'flat' {
  if (status === 'passed') return 'ok'
  if (status === 'skipped') return 'flat'
  return 'bad'
}

function flatten(steps: readonly StepResult[]): StepResult[] {
  const out: StepResult[] = []
  for (const step of steps) {
    out.push(step)
    if (step.children.length) out.push(...flatten(step.children))
  }
  return out
}

export default function RunPanel({
  active,
  revision,
  request,
  blocked,
  options,
  onReport,
  onBusy
}: {
  active: boolean
  revision: number
  request: string
  blocked: boolean
  options: Partial<PlaybackOptions>
  onReport: (report: Report) => void
  onBusy: (running: boolean) => void
}): React.JSX.Element {
  const [entries, setEntries] = useState<ScenarioEntry[]>([])
  const [picked, setPicked] = useState('')
  const [live, setLive] = useState<StepResult[]>([])
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [run, setRun] = useState<RunResult | null>(null)
  const [contexts, setContexts] = useState<StoredContext[]>([])
  const [context, setContext] = useState<FailureContext | null>(null)
  const [shot, setShot] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  const selected = picked || request
  const listRef = useRef<HTMLDivElement | null>(null)
  const reportRef = useRef(onReport)
  const busyRef = useRef(onBusy)

  useEffect(() => {
    reportRef.current = onReport
    busyRef.current = onBusy
  }, [onBusy, onReport])

  useEffect(() => {
    busyRef.current(running)
  }, [running])

  const refresh = useCallback((): void => {
    window.aftPlayback
      .list()
      .then((result) => {
        if (result.ok && result.data) setEntries(result.data.entries)
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    let alive = true
    window.aftPlayback
      .list()
      .then((result) => {
        if (!alive || !result.ok || !result.data) return
        setEntries(result.data.entries)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [revision])

  useEffect(() => {
    return window.aftPlayback.onProgress((payload) => {
      setProgress({ done: payload.done, total: payload.total })
      setLive((prev) => prev.concat(payload.step))
    })
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

  const start = useCallback(async (): Promise<void> => {
    if (!selected) return

    setRunning(true)
    setLive([])
    setRun(null)
    setContext(null)
    setContexts([])
    const total = entries.find((entry) => entry.id === selected)?.steps ?? 0
    setProgress({ done: 0, total })

    reportRef.current({
      level: 'note',
      text: 'Koşum başladı: ' + (entries.find((entry) => entry.id === selected)?.title ?? selected),
      detail: [
        total + ' adım',
        'hata görüntüsü ' + (options.screenshotOnFailure ? 'açık' : 'kapalı'),
        'ilk hatada dur ' + (options.stopOnFailure ? 'açık' : 'kapalı'),
        'durum doğrulama ' + (options.verifyState ? 'açık' : 'kapalı')
      ]
    })

    try {
      const result = await window.aftPlayback.run({ scenarioId: selected, options })
      if (!result.ok || !result.data) {
        reportRef.current({ level: 'err', text: 'Koşum başarısız: ' + result.message })
        return
      }

      setRun(result.data.run)
      reportRef.current({
        level: result.data.run.ok ? 'ok' : 'err',
        text:
          'Koşum ' +
          (RUN_LABELS[result.data.run.status] ?? result.data.run.status) +
          ': ' +
          result.data.run.scenarioTitle,
        detail: [
          result.data.run.metrics.passed + ' / ' + result.data.run.metrics.steps,
          formatMs(result.data.run.metrics.totalMs),
          ...result.data.run.failures.slice(0, 3)
        ]
      })

      if (result.data.run.contexts.length) {
        const stored = await window.aftPlayback.contexts()
        if (stored.ok && stored.data) setContexts(stored.data.contexts)
      }
    } catch (error) {
      reportRef.current({ level: 'err', text: 'Köprü hatası: ' + (error as Error).message })
    } finally {
      setRunning(false)
    }
  }, [entries, options, selected])

  const cancel = useCallback((): void => {
    void window.aftPlayback.cancel().then((result) => {
      if (result.ok) reportRef.current({ level: 'note', text: 'Koşum iptal edildi' })
    })
  }, [])

  const openContext = useCallback(async (id: string): Promise<void> => {
    const result = await window.aftPlayback.context(id)
    if (!result.ok || !result.data) {
      reportRef.current({ level: 'err', text: 'Bağlam okunamadı: ' + result.message })
      return
    }
    setContext(result.data.context)
  }, [])

  const shown = useMemo(() => (run ? flatten(run.steps) : live), [live, run])
  const percentDone = progress.total ? progress.done / progress.total : 0
  const activeId = live.length ? live[live.length - 1].stepId : ''

  return (
    <section className="run">
      <div className="side-bar">
        <select
          className="picker"
          value={selected}
          onChange={(event) => setPicked(event.target.value)}
          disabled={running}
          aria-label="Senaryo"
        >
          <option value="">senaryo seç</option>
          {entries.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.title}
            </option>
          ))}
        </select>
        <IconButton
          name="play"
          title="Başlat"
          onClick={() => void start()}
          disabled={running || blocked || !selected}
          small
          active
        />
        <IconButton name="square" title="Durdur" onClick={cancel} disabled={!running} small />
        <IconButton name="reload" title="Yenile" onClick={refresh} disabled={running} small />
      </div>

      {running ? (
        <div className="progress">
          <Bar value={percentDone} />
          <span className="progress-text">
            {progress.done} / {progress.total}
          </span>
        </div>
      ) : null}

      <div className="side-list" ref={listRef}>
        {shown.length ? (
          shown.map((item) => (
            <div
              key={item.stepId + item.index}
              className={
                'run-step ' +
                statusTone(item.status) +
                (item.stepId === activeId && running ? ' live' : '')
              }
            >
              <span className="run-no">{item.index + 1}</span>
              <span className="run-title">{item.title}</span>
              {item.resolution ? (
                <span className="run-conf">{percent(item.resolution.confidence)}</span>
              ) : null}
              <span className="run-ms">{formatMs(item.durationMs)}</span>
              <Pill tone={statusTone(item.status)}>{STATUS_LABELS[item.status]}</Pill>
            </div>
          ))
        ) : (
          <Empty glyph="play" text="Koşum yok" />
        )}
      </div>

      {run ? (
        <div className="side-foot">
          <div className="metric-row tight">
            <Metric
              label="durum"
              value={RUN_LABELS[run.status] ?? run.status}
              tone={run.ok ? 'ok' : 'bad'}
            />
            <Metric label="geçen" value={run.metrics.passed + '/' + run.metrics.steps} />
            <Metric label="güven" value={percent(run.metrics.meanConfidence)} />
            <Metric label="süre" value={formatMs(run.metrics.totalMs)} />
          </div>

          {run.failures.slice(0, 3).map((failure, index) => (
            <div key={index} className="issue bad">
              <Glyph name="alert" size={12} />
              {failure}
            </div>
          ))}

          {contexts.length ? (
            <div className="chip-row">
              {contexts.slice(0, 8).map((entry) => (
                <TextButton
                  key={entry.id}
                  glyph="alert"
                  label={entry.id.slice(0, 10)}
                  onClick={() => void openContext(entry.id)}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {active && context ? (
        <ContextView context={context} onClose={() => setContext(null)} onShot={setShot} />
      ) : null}
      {active && shot ? <ShotView data={shot} onClose={() => setShot(null)} /> : null}
    </section>
  )
}
