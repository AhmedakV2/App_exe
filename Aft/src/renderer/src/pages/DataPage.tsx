import React, { useCallback, useEffect, useState } from 'react'
import type { DataStats, OutboxSummary, ScenarioIndexRow } from '../../../main/data'
import { Glyph, IconButton } from '../icons'
import { Card, Empty, Metric, PageHead, Pill, Skeleton, TextButton } from '../ui'
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

  const loading = busy && !stats

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
              busy={busy}
            />
            <TextButton glyph="link" label="Eşitle" onClick={() => void reconcile()} busy={busy} />
            <TextButton
              glyph="broom"
              label="Temizle"
              onClick={() => void sweep()}
              busy={busy}
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
        <Metric label="senaryo" value={stats?.scenarios ?? 0} />
        <Metric label="koşum" value={stats?.runs ?? 0} />
        <Metric label="adım" value={stats?.steps ?? 0} />
        <Metric label="bağlam" value={stats?.contexts ?? 0} />
        <Metric label="kuyruk" value={stats?.outbox ?? 0} tone={stats?.outbox ? 'warn' : 'flat'} />
        <Metric
          label="bekleyen"
          value={outbox?.pending ?? 0}
          tone={outbox?.pending ? 'warn' : 'flat'}
        />
        <Metric label="gönderilen" value={outbox?.sent ?? 0} tone="ok" />
        <Metric label="hatalı" value={outbox?.failed ?? 0} tone={outbox?.failed ? 'bad' : 'flat'} />
      </div>

      <div className="page-body cols-2">
        <Card label="Senaryo indeksi" grow>
          {loading ? <Skeleton rows={6} /> : null}

          {!loading && scenarios.length ? (
            <div className="table-scroll">
              <div className="table wide">
                <div className="tr th">
                  <span className="td grow">senaryo</span>
                  <span className="td num">adım</span>
                  <span className="td num">şema</span>
                  <span className="td wide">güncelleme</span>
                </div>
                {scenarios.map((entry) => (
                  <div key={entry.id} className="tr">
                    <span className="td grow">{entry.title}</span>
                    <span className="td num">{entry.steps}</span>
                    <span className="td num dim mono">{entry.schemaVersion}</span>
                    <span className="td wide dim">{formatShortDate(entry.updatedAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {!loading && !scenarios.length ? (
            <Empty
              glyph="library"
              text="İndekste senaryo yok"
              hint="Senaryolar sekmesinden bir senaryo kaydettiğinizde burada listelenir."
            />
          ) : null}
        </Card>

        <Card label="Depo" scroll>
          <div className="kv">
            <span className="kv-key">dosya</span>
            <span className="kv-val mono">{stats?.filePath ?? '—'}</span>
            <span className="kv-key">boyut</span>
            <span className="kv-val">{formatBytes(stats?.bytes ?? 0)}</span>
            <span className="kv-key">şema sürümü</span>
            <span className="kv-val mono">{stats?.userVersion ?? '—'}</span>
            <span className="kv-key">günlük kipi</span>
            <span className="kv-val mono">{stats?.journalMode ?? '—'}</span>
            <span className="kv-key">en eski bekleyen</span>
            <span className="kv-val">{formatShortDate(outbox?.oldestPendingAt ?? 0)}</span>
            <span className="kv-key">gönderim hedefi</span>
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
          ) : (
            <div className="note ok">
              <Glyph name="check" size={12} />
              Bütünlük sorunu bulunmadı
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
