import React, { useCallback, useEffect, useState } from 'react'
import type { DataStats, OutboxSummary, ScenarioIndexRow } from '../../../main/data'
import { Glyph, IconButton } from '../icons'
import { Card, Empty, Metric, PageHead, Pill, TextButton } from '../ui'
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

      const report = result.data.report
      setOutbox(result.data.summary)

      if (!report.claimed) {
        onReport({ level: 'note', text: 'Kuyrukta gönderilecek kayıt yok' })
        return
      }

      onReport({
        level: report.failed ? 'err' : 'ok',
        text: 'Kuyruk: ' + report.sent + ' / ' + report.claimed + ' gönderildi',
        detail: [
          report.failed + ' hatalı',
          result.data.summary.pending + ' bekleyen',
          ...report.errors.slice(0, 3)
        ]
      })
    } catch (error) {
      onReport({ level: 'err', text: 'Köprü hatası: ' + (error as Error).message })
    } finally {
      setBusy(false)
      await load()
    }
  }, [load, onReport])

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
        text: 'Eşitleme tamam: ' + result.data.scenarios + ' senaryo indekslendi',
        detail: [
          result.data.report.removedRows + ' kayıt düşürüldü',
          result.data.report.orphanFiles.length + ' artık dosya',
          ...result.data.report.orphanFiles.slice(0, 3)
        ]
      })
    } catch (error) {
      onReport({ level: 'err', text: 'Köprü hatası: ' + (error as Error).message })
    } finally {
      setBusy(false)
      await load()
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
      setOutbox(result.data.summary)
      onReport({
        level: 'ok',
        text: 'Temizlik: ' + result.data.report.runsRemoved + ' koşum silindi',
        detail: [
          result.data.report.reportsRemoved + ' rapor',
          result.data.report.contextsRemoved + ' bağlam',
          result.data.report.skippedPending + ' kuyrukta beklediği için atlandı'
        ]
      })
    } catch (error) {
      onReport({ level: 'err', text: 'Köprü hatası: ' + (error as Error).message })
    } finally {
      setBusy(false)
      await load()
    }
  }, [load, onReport])

  return (
    <div className="page">
      <PageHead
        title="Veri"
        meta={
          <>
            {stats ? <Pill>{formatBytes(stats.bytes)}</Pill> : null}
            {stats ? <Pill>{stats.journalMode}</Pill> : null}
            {outbox && outbox.pending ? <Pill tone="warn">{outbox.pending} bekleyen</Pill> : null}
            {outbox && outbox.failed ? <Pill tone="bad">{outbox.failed} hatalı</Pill> : null}
            {faults.length ? <Pill tone="bad">{faults.length} sorun</Pill> : null}
          </>
        }
        actions={
          <>
            <TextButton
              glyph="cloud"
              label="Kuyruğu gönder"
              onClick={() => void flush()}
              disabled={busy || !(outbox ? outbox.pending + outbox.failed : 0)}
            />
            <TextButton
              glyph="link"
              label="Eşitle"
              onClick={() => void reconcile()}
              disabled={busy}
            />
            <TextButton
              glyph="broom"
              label="Temizle"
              onClick={() => void sweep()}
              disabled={busy}
              tone="danger"
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

      <div className="metric-row wide">
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

      <div className="page-body cols-2">
        <Card label="Senaryo indeksi" scroll grow>
          {scenarios.length ? (
            <div className="table-scroll">
              <div className="table wide">
                <div className="tr th">
                  <span className="td grow">Senaryo</span>
                  <span className="td">Adım</span>
                  <span className="td">Şema</span>
                  <span className="td">Güncelleme</span>
                </div>
                {scenarios.map((entry) => (
                  <div key={entry.id} className="tr">
                    <span className="td grow">{entry.title}</span>
                    <span className="td">{entry.steps}</span>
                    <span className="td dim mono">{entry.schemaVersion}</span>
                    <span className="td dim">{formatShortDate(entry.updatedAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <Empty
              glyph="library"
              text="İndekste senaryo yok"
              hint="Senaryolar sekmesinden bir senaryo kaydettiğinizde burada listelenir."
            />
          )}
        </Card>

        <Card label="Depo" scroll>
          <div className="kv">
            <span className="kv-key">Dosya</span>
            <span className="kv-val mono">{stats?.filePath ?? '—'}</span>
            <span className="kv-key">Boyut</span>
            <span className="kv-val">{formatBytes(stats?.bytes ?? 0)}</span>
            <span className="kv-key">Şema sürümü</span>
            <span className="kv-val mono">{stats?.userVersion ?? '—'}</span>
            <span className="kv-key">Günlük kipi</span>
            <span className="kv-val mono">{stats?.journalMode ?? '—'}</span>
            <span className="kv-key">En eski bekleyen</span>
            <span className="kv-val">{formatShortDate(outbox?.oldestPendingAt ?? 0)}</span>
            <span className="kv-key">Gönderim hedefi</span>
            <span className="kv-val mono">data/outbox</span>
          </div>

          {faults.length ? (
            <div className="issues">
              {faults.map((fault, index) => (
                <div key={index} className="issue bad">
                  <Glyph name="alert" size={12} />
                  {fault}
                </div>
              ))}
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  )
}
