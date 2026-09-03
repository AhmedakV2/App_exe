import React, { useCallback, useEffect, useState } from 'react'
import type { ScanReport } from '../../../main/browser/types'
import { IconButton } from '../icons'
import { Card, Empty, Metric, PageHead, Pill, Segmented } from '../ui'
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
    <div className="page">
      <PageHead
        title="Kapsam"
        meta={
          report ? (
            <>
              <Pill>{shortUrl(report.url)}</Pill>
              {coverage?.reused ? <Pill tone="accent">yeniden kullanıldı</Pill> : null}
              {coverage?.quietTimedOut ? <Pill tone="warn">kararlılık aşıldı</Pill> : null}
              {coverage?.framesFailed ? (
                <Pill tone="bad">{coverage.framesFailed} çerçeve</Pill>
              ) : null}
            </>
          ) : null
        }
        actions={
          <>
            <Segmented items={LEVELS} value={level} onPick={setLevel} disabled={busy} />
            <IconButton
              name="radar"
              title="Tara"
              onClick={() => void scan()}
              disabled={busy}
              small
              active
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

      {coverage ? (
        <div className="metric-row wide">
          <Metric label="düğüm" value={coverage.nodes} />
          <Metric label="eleman" value={coverage.elements} />
          <Metric label="etkileşilebilir" value={coverage.interactive} tone="accent" />
          <Metric label="görünen alan" value={coverage.inViewport} />
          <Metric label="shadow kök" value={coverage.shadowRoots} />
          <Metric label="çerçeve" value={coverage.frames} />
          <Metric
            label="kör nokta"
            value={coverage.blindSpots}
            tone={coverage.blindSpots ? 'warn' : 'flat'}
          />
          <Metric label="geçiş" value={coverage.passes} />
          <Metric label="süre" value={formatMs(coverage.durationMs)} />
        </div>
      ) : null}

      <div className="page-body cols-2">
        <Card label="Erişilemeyen bölgeler" scroll grow>
          {report && report.blindSpots.length ? (
            <div className="table-scroll">
              <div className="table wide">
                <div className="tr th">
                  <span className="td">tür</span>
                  <span className="td grow">ayrıntı</span>
                  <span className="td">çerçeve</span>
                </div>
                {report.blindSpots.map((spot, index) => (
                  <div key={index} className="tr">
                    <span className="td">
                      <Pill tone="warn">{SPOT_LABELS[spot.kind] ?? spot.kind}</Pill>
                    </span>
                    <span className="td grow">{spot.detail}</span>
                    <span className="td dim mono">{spot.frameId.slice(0, 10)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <Empty
              glyph="layers"
              text="Kör nokta bulunmadı"
              hint="Seçilen seviyede sayfanın tamamı erişilebilir durumda ya da henüz tarama yapılmadı."
            />
          )}
        </Card>

        <Card label="Çerçeveler" scroll>
          {report && report.frames.length ? (
            <div className="table-scroll">
              <div className="table wide">
                <div className="tr th">
                  <span className="td">derinlik</span>
                  <span className="td grow">adres</span>
                  <span className="td">durum</span>
                </div>
                {report.frames.map((frame) => (
                  <div key={frame.id} className="tr">
                    <span className="td">{frame.depth}</span>
                    <span className="td grow mono">{shortUrl(frame.url) || '—'}</span>
                    <span className="td">
                      <Pill tone={frame.failed ? 'bad' : 'ok'}>
                        {frame.failed ? 'bağlanamadı' : 'bağlı'}
                      </Pill>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <Empty
              glyph="globe"
              text="Çerçeve yok"
              hint="Sayfada iç çerçeve bulunmuyor ya da henüz tarama yapılmadı."
            />
          )}
        </Card>
      </div>

      {report ? (
        <div className="kv wide">
          <span className="kv-key">şema</span>
          <span className="kv-val mono">{coverage?.version}</span>
          <span className="kv-key">görünüm</span>
          <span className="kv-val mono">
            {report.viewport.width} × {report.viewport.height} · {report.viewport.pageHeight}
          </span>
          <span className="kv-key">engel kontrolü</span>
          <span className="kv-val">
            {coverage?.occlusionChecked} /{' '}
            {(coverage?.occlusionChecked ?? 0) + (coverage?.occlusionSkipped ?? 0)}
          </span>
          <span className="kv-key">dinleyici</span>
          <span className="kv-val">
            {coverage?.listenersProbed} /{' '}
            {(coverage?.listenersProbed ?? 0) + (coverage?.listenersSkipped ?? 0)}
          </span>
        </div>
      ) : null}
    </div>
  )
}
