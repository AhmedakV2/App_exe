import React, { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  DataStats,
  FragileStep,
  HealthSummary,
  OutboxSummary,
  RunRow
} from '../../../main/data'
import type { HealingProposal } from '../../../main/identity'
import type { ScanReport } from '../../../main/browser/types'
import { Glyph } from '../icons'
import { Empty, Metric, Pill, Sym, TextButton } from '../ui'
import { formatBytes, formatMs, formatShortDate, percent, shortUrl } from '../format'
import type { Report } from '../report'

const DAYS = 14

const RUN_LABELS: Record<string, string> = {
  passed: 'başarılı',
  failed: 'başarısız',
  errored: 'hata',
  aborted: 'iptal'
}

function dayKey(at: number): string {
  const value = new Date(at)
  return value.getFullYear() + '-' + value.getMonth() + '-' + value.getDate()
}

export default function OverviewPage({
  revision,
  onReport,
  onOpenRun,
  onOpenIdentity,
  onOpenScenario,
  onRecord
}: {
  revision: number
  onReport: (report: Report) => void
  onOpenRun: (id: string) => void
  onOpenIdentity: (tab: string) => void
  onOpenScenario: (id: string, title: string) => void
  onRecord: () => void
}): React.JSX.Element {
  const [summary, setSummary] = useState<HealthSummary | null>(null)
  const [fragile, setFragile] = useState<FragileStep[]>([])
  const [runs, setRuns] = useState<RunRow[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<DataStats | null>(null)
  const [outbox, setOutbox] = useState<OutboxSummary | null>(null)
  const [approvals, setApprovals] = useState<HealingProposal[]>([])
  const [scan, setScan] = useState<ScanReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(0)

  const load = useCallback(async (): Promise<void> => {
    setBusy(true)
    setNow(Date.now())
    try {
      const [health, list, state, queue, pending, coverage] = await Promise.all([
        window.aftData.health(),
        window.aftData.runs({ limit: 400, offset: 0 }),
        window.aftData.stats(),
        window.aftData.outbox(),
        window.aftIdentity.approvals(),
        window.aft.coverage()
      ])
      if (health.ok && health.data) {
        setSummary(health.data.summary)
        setFragile(health.data.fragile)
      }
      if (list.ok && list.data) {
        setRuns(list.data.rows)
        setTotal(list.data.total)
      }
      if (state.ok && state.data) setStats(state.data.stats)
      if (queue.ok && queue.data) setOutbox(queue.data.summary)
      if (pending.ok && pending.data) setApprovals(pending.data)
      setScan(coverage)
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

  const days = useMemo(() => {
    if (!now) return []
    const out: { label: string; passed: number; failed: number }[] = []
    const index = new Map<string, number>()
    for (let offset = DAYS - 1; offset >= 0; offset -= 1) {
      const at = now - offset * 86400000
      index.set(dayKey(at), out.length)
      out.push({ label: String(new Date(at).getDate()), passed: 0, failed: 0 })
    }
    for (const row of runs) {
      const slot = index.get(dayKey(row.startedAt))
      if (slot === undefined) continue
      if (row.ok) out[slot].passed += 1
      else out[slot].failed += 1
    }
    return out
  }, [now, runs])

  const peak = Math.max(1, ...days.map((day) => day.passed + day.failed))
  const passed = runs.filter((row) => row.ok).length
  const rate = runs.length ? passed / runs.length : 0
  const meanMs = runs.length ? runs.reduce((sum, row) => sum + row.totalMs, 0) / runs.length : 0
  const recent = runs.slice(0, 14)

  const approve = useCallback(
    async (id: string): Promise<void> => {
      const result = await window.aftIdentity.approve(id)
      onReport({
        level: result.ok ? 'ok' : 'err',
        text: result.ok ? 'Onarım onaylandı' : 'Onaylanamadı: ' + result.message
      })
      await load()
    },
    [load, onReport]
  )

  return (
    <>
      <header className="hdr">
        <span className="t">Genel bakış</span>
        <Pill>{total} koşum</Pill>
        {scan ? <Pill>{shortUrl(scan.url) || 'ana sayfa'}</Pill> : null}
        <span className="push" />
        <TextButton
          glyph="bolt"
          label="Kırılganları gör"
          onClick={() => onOpenIdentity('fragile')}
        />
        <TextButton glyph="record" label="Yeni kayıt" onClick={onRecord} tone="primary" />
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
        <Metric
          label="Başarı oranı"
          value={percent(rate)}
          tone={rate >= 0.9 ? 'ok' : rate >= 0.7 ? 'warn' : 'bad'}
        />
        <Metric
          label="Koşum"
          value={runs.length}
          hint={passed + ' başarılı · ' + (runs.length - passed) + ' başarısız'}
        />
        <Metric label="Ort. süre" value={formatMs(meanMs)} />
        <Metric label="Ort. güven" value={percent(summary?.meanConfidence ?? 0)} />
        <Metric
          label="Kırılgan adım"
          value={fragile.length}
          tone={fragile.length ? 'warn' : 'flat'}
        />
        <Metric
          label="Bekleyen onay"
          value={approvals.length}
          tone={approvals.length ? 'warn' : 'flat'}
        />
        <Metric
          label="Onarılan"
          value={summary?.healed ?? 0}
          tone={summary?.healed ? 'ok' : 'flat'}
        />
        <Metric
          label="Kapsam"
          value={scan ? scan.coverage.interactive : '—'}
          hint={scan ? 'etkileşilebilir · seviye ' + scan.level : 'tarama yok'}
        />
      </div>

      <div className="split" style={{ gridTemplateColumns: '1fr 360px' }}>
        <div className="col">
          <div className="ph">
            Günlük koşum · geçen / kalan
            <span className="push" />
            <Pill tone="ok">geçen</Pill>
            <Pill tone="bad">kalan</Pill>
          </div>
          <div className="pad" style={{ borderBottom: '1px solid var(--line)' }}>
            <div className="bars">
              {days.map((day, index) => (
                <b key={index} title={day.passed + ' geçen · ' + day.failed + ' kalan'}>
                  <i style={{ height: Math.round((day.passed / peak) * 88) + 'px' }} />
                  <i
                    className="f"
                    style={{ height: Math.round((day.failed / peak) * 88) + 'px' }}
                  />
                  <span>{day.label}</span>
                </b>
              ))}
            </div>
          </div>
          <div className="gridwrap">
            {recent.length ? (
              <table className="grid">
                <thead>
                  <tr>
                    <th style={{ width: 30 }} />
                    <th>Senaryo</th>
                    <th style={{ width: 90 }}>Durum</th>
                    <th style={{ width: 56 }}>Adım</th>
                    <th style={{ width: 56 }}>Güven</th>
                    <th style={{ width: 64 }}>Süre</th>
                    <th style={{ width: 90 }}>Zaman</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((row) => (
                    <tr key={row.id} className="click" onClick={() => onOpenRun(row.id)}>
                      <td className="first">
                        <Sym tone={row.ok ? 'ok' : row.status === 'failed' ? 'bad' : 'warn'} />
                      </td>
                      <td>{row.scenarioTitle}</td>
                      <td className={row.ok ? 'ok' : 'bad'}>
                        {RUN_LABELS[row.status] ?? row.status}
                      </td>
                      <td className="num">
                        {row.passed}/{row.steps}
                      </td>
                      <td className={'num' + (row.meanConfidence < 0.8 ? ' warn' : '')}>
                        {row.meanConfidence.toFixed(2)}
                      </td>
                      <td className="num">{formatMs(row.totalMs)}</td>
                      <td className="muted">{formatShortDate(row.startedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty glyph="history" text="Koşum kaydı yok" />
            )}
          </div>
        </div>

        <div className="col scroll">
          <div className="ph">
            Onay bekleyen iyileştirmeler
            <span className="push" />
            {approvals.length ? <Pill tone="warn">{approvals.length}</Pill> : null}
          </div>
          {approvals.length ? (
            approvals.slice(0, 6).map((entry) => (
              <div key={entry.descriptorId} className="appr">
                <Sym tone={entry.decision === 'blocked' ? 'bad' : 'warn'} />
                <div style={{ minWidth: 0 }}>
                  <div>{entry.next.target.name || entry.next.target.tag}</div>
                  <div className="s">
                    {entry.lost
                      .map((kind) => '−' + kind)
                      .concat(entry.gained.map((kind) => '+' + kind))
                      .join(' ') || entry.reason}{' '}
                    · {percent(entry.confidence)}
                  </div>
                </div>
                {entry.decision === 'blocked' ? (
                  <TextButton label="İncele" onClick={() => onOpenIdentity('approvals')} small />
                ) : (
                  <TextButton
                    label="Onayla"
                    onClick={() => void approve(entry.descriptorId)}
                    small
                  />
                )}
              </div>
            ))
          ) : (
            <div className="side-empty">Bekleyen onay yok</div>
          )}

          <div className="ph">
            Kırılgan adımlar
            <span className="push" />
            {fragile.length ? <Pill tone="warn">{fragile.length}</Pill> : null}
          </div>
          {fragile.length ? (
            fragile.slice(0, 6).map((entry) => (
              <div key={entry.descriptorId} className="cov">
                <span className="mono" title={entry.title}>
                  {entry.title}
                </span>
                <span className="bar">
                  <span
                    className={
                      'bar-fill ' +
                      (entry.meanConfidence > 0.82
                        ? 'ok'
                        : entry.meanConfidence > 0.5
                          ? 'warn'
                          : 'bad')
                    }
                    style={{ width: Math.round(entry.meanConfidence * 100) + '%' }}
                  />
                </span>
                <span className="mono val">{percent(entry.meanConfidence)}</span>
              </div>
            ))
          ) : (
            <div className="side-empty">Kırılgan adım yok</div>
          )}

          <div className="ph">
            Kör noktalar
            <span className="push" />
            {scan ? <Pill>{scan.blindSpots.length}</Pill> : null}
          </div>
          {scan && scan.blindSpots.length ? (
            scan.blindSpots.slice(0, 6).map((spot, index) => (
              <div key={index} className="cov" style={{ gridTemplateColumns: '1fr auto' }}>
                <span className="mono">{spot.detail}</span>
                <Pill tone="warn">{spot.kind}</Pill>
              </div>
            ))
          ) : (
            <div className="side-empty">{scan ? 'Kör nokta yok' : 'Tarama yok'}</div>
          )}

          <div className="ph">Veri</div>
          <dl className="kv" style={{ padding: '8px 12px' }}>
            <dt className="kv-key">Veritabanı</dt>
            <dd className="kv-val mono">
              {stats ? formatBytes(stats.bytes) + ' · ' + stats.journalMode : '—'}
            </dd>
            <dt className="kv-key">Giden kuyruk</dt>
            <dd className="kv-val mono">
              {outbox ? outbox.pending + ' bekliyor · ' + outbox.failed + ' hata' : '—'}
            </dd>
            <dt className="kv-key">Senaryo</dt>
            <dd className="kv-val mono">{stats ? stats.scenarios : '—'}</dd>
            <dt className="kv-key">Son koşum</dt>
            <dd className="kv-val mono">{formatShortDate(summary?.lastRunAt ?? 0)}</dd>
          </dl>
          {runs.length ? (
            <div className="side-empty">
              <button
                className="btn ghost sm"
                onClick={() => onOpenScenario(runs[0].scenarioId, runs[0].scenarioTitle)}
                type="button"
              >
                Son senaryoyu aç
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </>
  )
}
