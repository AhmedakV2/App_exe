import React, { useCallback, useEffect, useState } from 'react'
import type { DataStats, OutboxSummary, ScenarioIndexRow } from '../../../main/data'
import { Glyph } from '../icons'
import { Empty, Metric, Pill, Sym, TextButton } from '../ui'
import { formatBytes, formatShortDate } from '../format'
import type { Report } from '../report'

const FLUSH_LIMIT = 50

export default function DataPage({
  revision,
  onReport
}: {
  revision: number
  onReport: (report: Report) => void
}): React.JSX.Element {
  const [stats, setStats] = useState<DataStats | null>(null)
  const [faults, setFaults] = useState<string[]>([])
  const [outbox, setOutbox] = useState<OutboxSummary | null>(null)
  const [scenarios, setScenarios] = useState<ScenarioIndexRow[]>([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      const [state, queue, index] = await Promise.all([
        window.aftData.stats(),
        window.aftData.outbox(),
        window.aftData.scenarios()
      ])
      if (state.ok && state.data) {
        setStats(state.data.stats)
        setFaults(state.data.faults)
      }
      if (queue.ok && queue.data) setOutbox(queue.data.summary)
      if (index.ok && index.data) setScenarios(index.data.rows)
    } catch (error) {
      onReport({ level: 'err', text: 'Köprü hatası: ' + (error as Error).message })
    } finally {
      setBusy(false)
    }
  }, [onReport])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load, revision])

  const flush = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      const result = await window.aftData.flush(FLUSH_LIMIT)
      if (!result.ok || !result.data) {
        onReport({ level: 'err', text: 'Kuyruk boşaltılamadı: ' + result.message })
        return
      }
      setOutbox(result.data.summary)
      onReport({
        level: result.data.report.failed ? 'err' : 'ok',
        text: 'Kuyruk: ' + result.data.report.sent + ' gönderildi',
        detail: result.data.report.errors.slice(0, 3)
      })
    } finally {
      setBusy(false)
    }
  }, [onReport])

  const reconcile = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      const result = await window.aftData.reconcile()
      if (!result.ok || !result.data) {
        onReport({ level: 'err', text: 'Eşitleme başarısız: ' + result.message })
        return
      }
      onReport({
        level: 'ok',
        text: 'Eşitleme: ' + result.data.report.removedRows + ' satır',
        detail: result.data.report.orphanFiles.slice(0, 3)
      })
      await load()
    } finally {
      setBusy(false)
    }
  }, [load, onReport])

  const sweep = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      const result = await window.aftData.sweep()
      if (!result.ok || !result.data) {
        onReport({ level: 'err', text: 'Temizlik başarısız: ' + result.message })
        return
      }
      onReport({
        level: 'ok',
        text: 'Temizlik: ' + result.data.report.runsRemoved + ' koşum',
        detail: [
          result.data.report.reportsRemoved + ' rapor',
          result.data.report.contextsRemoved + ' bağlam',
          result.data.report.skippedPending + ' bekleyen'
        ]
      })
      await load()
    } finally {
      setBusy(false)
    }
  }, [load, onReport])

  return (
    <>
      <header className="hdr">
        <span className="t">Veri</span>
        {stats ? <span className="mono faint">{stats.filePath}</span> : null}
        {outbox && outbox.failed ? <Pill tone="bad">{outbox.failed} hatalı</Pill> : null}
        {faults.length ? <Pill tone="bad">{faults.length} sorun</Pill> : null}
        <span className="push" />
        <TextButton
          glyph="cloud"
          label="Kuyruğu gönder"
          onClick={() => void flush()}
          disabled={busy}
        />
        <TextButton glyph="link" label="Eşitle" onClick={() => void reconcile()} disabled={busy} />
        <TextButton
          glyph="broom"
          label="Temizle"
          onClick={() => void sweep()}
          disabled={busy}
          tone="danger"
        />
        <button
          className="ib"
          title="Yenile"
          onClick={() => void load()}
          disabled={busy}
          type="button"
        >
          <Glyph name="reload" size={13} />
        </button>
      </header>

      <div className="metrics">
        <Metric label="Senaryo" value={stats?.scenarios ?? 0} />
        <Metric label="Koşum" value={stats?.runs ?? 0} />
        <Metric label="Adım" value={stats?.steps ?? 0} />
        <Metric label="Bağlam" value={stats?.contexts ?? 0} />
        <Metric label="Kuyruk" value={stats?.outbox ?? 0} tone={stats?.outbox ? 'warn' : 'flat'} />
        <Metric
          label="Bekleyen"
          value={outbox?.pending ?? 0}
          tone={outbox?.pending ? 'warn' : 'flat'}
        />
        <Metric label="Gönderilen" value={outbox?.sent ?? 0} tone="ok" />
        <Metric label="Hatalı" value={outbox?.failed ?? 0} tone={outbox?.failed ? 'bad' : 'flat'} />
      </div>

      <div className="split" style={{ gridTemplateColumns: '1fr 360px' }}>
        <div className="col">
          <div className="ph">
            Senaryo indeksi
            <span className="push" />
            <span className="plain">{scenarios.length}</span>
          </div>
          <div className="gridwrap">
            {scenarios.length ? (
              <table className="grid">
                <thead>
                  <tr>
                    <th>Senaryo</th>
                    <th style={{ width: 60 }}>Adım</th>
                    <th style={{ width: 130 }}>Şema</th>
                    <th style={{ width: 160 }}>Dosya</th>
                    <th style={{ width: 100 }}>Güncelleme</th>
                  </tr>
                </thead>
                <tbody>
                  {scenarios.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.title}</td>
                      <td className="num">{entry.steps}</td>
                      <td className="mono muted">{entry.schemaVersion}</td>
                      <td className="mono muted">{entry.fileName}</td>
                      <td className="muted">{formatShortDate(entry.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty glyph="library" text="Senaryo yok" />
            )}
          </div>
        </div>

        <div className="col scroll">
          <div className="ph">Depo</div>
          <div className="pad">
            <dl className="kv">
              <dt className="kv-key">Dosya</dt>
              <dd className="kv-val mono" title={stats?.filePath}>
                {stats?.filePath ?? '—'}
              </dd>
              <dt className="kv-key">Boyut</dt>
              <dd className="kv-val mono">{formatBytes(stats?.bytes ?? 0)}</dd>
              <dt className="kv-key">Şema sürümü</dt>
              <dd className="kv-val mono">{stats?.userVersion ?? '—'}</dd>
              <dt className="kv-key">Günlük kipi</dt>
              <dd className="kv-val mono">{stats?.journalMode ?? '—'}</dd>
              <dt className="kv-key">En eski bekleyen</dt>
              <dd className="kv-val mono">{formatShortDate(outbox?.oldestPendingAt ?? 0)}</dd>
              <dt className="kv-key">Gönderiliyor</dt>
              <dd className="kv-val mono">{outbox?.sending ?? 0}</dd>
            </dl>
          </div>
          <div className="ph">
            Sorunlar
            <span className="push" />
            {faults.length ? <Pill tone="bad">{faults.length}</Pill> : null}
          </div>
          {faults.length ? (
            <div className="issues">
              {faults.map((fault, index) => (
                <div key={index} className="issue">
                  <Sym tone="bad" />
                  <span className="msg">{fault}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="side-empty">Depo sağlıklı</div>
          )}
        </div>
      </div>
    </>
  )
}
