import React, { useCallback, useEffect, useState } from 'react'
import type { ScanReport } from '../../../main/browser/types'
import { Glyph } from '../icons'
import { Empty, Metric, Pill, Segmented, TextButton } from '../ui'
import { formatMs, shortUrl } from '../format'
import type { Report } from '../report'

const LEVELS = [
  { id: '0', label: 'Seviye 0' },
  { id: '1', label: 'Seviye 1' },
  { id: '2', label: 'Seviye 2' },
  { id: '3', label: 'Seviye 3' }
]

const SPOT_LABELS: Record<string, string> = {
  canvas: 'canvas',
  media: 'medya',
  'restricted-frame': 'kısıtlı çerçeve',
  'virtual-list': 'sanal liste',
  'collapsed-region': 'kapalı bölge'
}

export default function CoveragePage({
  revision,
  onReport
}: {
  revision: number
  onReport: (report: Report) => void
}): React.JSX.Element {
  const [report, setScan] = useState<ScanReport | null>(null)
  const [level, setLevel] = useState('1')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    try {
      const result = await window.aft.coverage()
      setScan(result)
      if (result) setLevel(String(result.level))
    } catch (error) {
      onReport({ level: 'err', text: 'Köprü hatası: ' + (error as Error).message })
    }
  }, [onReport])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load, revision])

  const scan = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      const result = await window.aft.scan(Number(level))
      onReport({ level: result.ok ? 'ok' : 'err', text: result.result })
      await load()
    } catch (error) {
      onReport({ level: 'err', text: 'Köprü hatası: ' + (error as Error).message })
    } finally {
      setBusy(false)
    }
  }, [level, load, onReport])

  const coverage = report?.coverage ?? null

  return (
    <>
      <header className="hdr">
        <span className="t">Kapsam</span>
        {report ? <span className="mono faint">{shortUrl(report.url) || 'ana sayfa'}</span> : null}
        {coverage?.reused ? <Pill tone="accent">yeniden kullanıldı</Pill> : null}
        {coverage?.quietTimedOut ? <Pill tone="warn">kararlılık aşıldı</Pill> : null}
        {coverage?.framesFailed ? <Pill tone="bad">{coverage.framesFailed} çerçeve</Pill> : null}
        <span className="push" />
        <Segmented items={LEVELS} value={level} onPick={setLevel} disabled={busy} />
        <TextButton
          glyph="radar"
          label="Tara"
          onClick={() => void scan()}
          disabled={busy}
          tone="primary"
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

      {coverage ? (
        <div className="metrics">
          <Metric label="Düğüm" value={coverage.nodes} />
          <Metric label="Eleman" value={coverage.elements} />
          <Metric label="Etkileşilebilir" value={coverage.interactive} tone="accent" />
          <Metric label="Görünen alan" value={coverage.inViewport} />
          <Metric label="Shadow kök" value={coverage.shadowRoots} />
          <Metric label="Çerçeve" value={coverage.frames} />
          <Metric
            label="Kör nokta"
            value={coverage.blindSpots}
            tone={coverage.blindSpots ? 'warn' : 'flat'}
          />
          <Metric label="Geçiş" value={coverage.passes} />
          <Metric label="Süre" value={formatMs(coverage.durationMs)} />
        </div>
      ) : null}

      <div className="split" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="col">
          <div className="ph">
            Erişilemeyen bölgeler
            <span className="push" />
            {report ? <span className="plain">{report.blindSpots.length}</span> : null}
          </div>
          <div className="gridwrap">
            {report && report.blindSpots.length ? (
              <table className="grid">
                <thead>
                  <tr>
                    <th style={{ width: 130 }}>Tür</th>
                    <th>Ayrıntı</th>
                    <th style={{ width: 110 }}>Çerçeve</th>
                  </tr>
                </thead>
                <tbody>
                  {report.blindSpots.map((spot, index) => (
                    <tr key={index}>
                      <td>
                        <Pill tone="warn">{SPOT_LABELS[spot.kind] ?? spot.kind}</Pill>
                      </td>
                      <td>{spot.detail}</td>
                      <td className="mono muted">{spot.frameId.slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty glyph="layers" text={report ? 'Kör nokta yok' : 'Tarama yok'} />
            )}
          </div>
        </div>

        <div className="col">
          <div className="ph">
            Çerçeveler
            <span className="push" />
            {report ? <span className="plain">{report.frames.length}</span> : null}
          </div>
          <div className="gridwrap">
            {report && report.frames.length ? (
              <table className="grid">
                <thead>
                  <tr>
                    <th style={{ width: 70 }}>Derinlik</th>
                    <th>Adres</th>
                    <th style={{ width: 100 }}>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {report.frames.map((frame) => (
                    <tr key={frame.id}>
                      <td className="num">{frame.depth}</td>
                      <td className="mono">{shortUrl(frame.url) || '—'}</td>
                      <td>
                        <Pill tone={frame.failed ? 'bad' : 'ok'}>
                          {frame.failed ? 'bağlanamadı' : 'bağlı'}
                        </Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty glyph="globe" text="Çerçeve yok" />
            )}
          </div>
          {report ? (
            <div className="pad" style={{ borderTop: '1px solid var(--line)' }}>
              <dl className="kv">
                <dt className="kv-key">Şema</dt>
                <dd className="kv-val mono">{coverage?.version}</dd>
                <dt className="kv-key">Görünüm</dt>
                <dd className="kv-val mono">
                  {report.viewport.width} × {report.viewport.height} · {report.viewport.pageHeight}
                </dd>
                <dt className="kv-key">Engel kontrolü</dt>
                <dd className="kv-val mono">
                  {coverage?.occlusionChecked} /{' '}
                  {(coverage?.occlusionChecked ?? 0) + (coverage?.occlusionSkipped ?? 0)}
                </dd>
                <dt className="kv-key">Dinleyici</dt>
                <dd className="kv-val mono">
                  {coverage?.listenersProbed} /{' '}
                  {(coverage?.listenersProbed ?? 0) + (coverage?.listenersSkipped ?? 0)}
                </dd>
              </dl>
            </div>
          ) : null}
        </div>
      </div>
    </>
  )
}
