import React, { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { FailureContext } from '../../../main/scenario/types'
import { Glyph } from '../icons'
import { Empty, Metric, Pill, Segmented } from '../ui'
import { formatDate, formatMs, percent, shortUrl } from '../format'

type Tab = 'trace' | 'candidates' | 'assertions' | 'blind' | 'elements' | 'shot'

const TABS: { id: Tab; label: string }[] = [
  { id: 'trace', label: 'Stratejiler' },
  { id: 'candidates', label: 'Adaylar' },
  { id: 'assertions', label: 'Doğrulama' },
  { id: 'blind', label: 'Kör nokta' },
  { id: 'elements', label: 'Elemanlar' },
  { id: 'shot', label: 'Görüntü' }
]

export default memo(function ContextView({
  context,
  onClose,
  onShot
}: {
  context: FailureContext
  onClose: () => void
  onShot: (data: string) => void
}): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('trace')
  const [filter, setFilter] = useState('')
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

  const resolution = context.resolution

  const elements = useMemo(() => {
    const text = filter.trim().toLowerCase()
    const rows = context.elements
    if (!text) return rows.slice(0, 300)
    return rows
      .filter(
        (item) =>
          item.name.toLowerCase().includes(text) ||
          item.text.toLowerCase().includes(text) ||
          item.tag.toLowerCase().includes(text) ||
          item.role.toLowerCase().includes(text)
      )
      .slice(0, 300)
  }, [context.elements, filter])

  const tabs = useMemo(
    () => TABS.filter((item) => (item.id === 'shot' ? Boolean(context.screenshot) : true)),
    [context.screenshot]
  )

  return (
    <div
      className="sheet"
      role="dialog"
      aria-modal="true"
      aria-label="Hata bağlamı"
      onClick={onClose}
    >
      <div className="sheet-frame" onClick={(event) => event.stopPropagation()}>
        <header className="sheet-head">
          <span className="sheet-title">
            <Glyph name="alert" size={14} />
            {context.stepTitle}
          </span>
          <span className="sheet-push" />
          <button
            ref={closeRef}
            className="ghost-btn"
            title="Kapat"
            aria-label="Kapat"
            onClick={onClose}
            type="button"
          >
            <Glyph name="close" size={15} />
          </button>
        </header>

        <div className="sheet-body">
          <div className="metric-row">
            <Metric label="durum" value={resolution ? resolution.state : 'akış'} tone="bad" />
            <Metric
              label="güven"
              value={resolution ? percent(resolution.confidence) : '—'}
              tone={resolution && resolution.confidence >= 0.82 ? 'ok' : 'warn'}
            />
            <Metric label="tarama" value={'seviye ' + context.scanLevel} />
            <Metric label="eleman" value={context.elements.length} />
            <Metric
              label="kör nokta"
              value={context.blindSpots.length}
              tone={context.blindSpots.length ? 'warn' : 'flat'}
            />
          </div>

          <div className="kv">
            <span className="kv-key">adres</span>
            <span className="kv-val mono">{shortUrl(context.url)}</span>
            <span className="kv-key">başlık</span>
            <span className="kv-val">{context.title || '—'}</span>
            <span className="kv-key">zaman</span>
            <span className="kv-val">{formatDate(context.capturedAt)}</span>
            <span className="kv-key">paket</span>
            <span className="kv-val mono">{context.id}</span>
          </div>

          <div className="sheet-msg">{context.message}</div>

          <Segmented
            items={tabs.map((item) => ({ id: item.id, label: item.label }))}
            value={tab}
            onPick={(id) => setTab(id as Tab)}
          />

          {tab === 'trace' ? (
            resolution && resolution.trace.length ? (
              <div className="rows">
                {resolution.trace.map((entry, index) => (
                  <div key={index} className={'row' + (entry.skipped ? ' dim' : '')}>
                    <span className="row-key">{entry.kind}</span>
                    <span className="row-mid">{entry.reason}</span>
                    <span className="row-num">{entry.skipped ? '—' : entry.matched}</span>
                    <span className="row-num">{formatMs(entry.durationMs)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <Empty glyph="target" text="Strateji izi yok" />
            )
          ) : null}

          {tab === 'candidates' ? (
            resolution && resolution.candidates.length ? (
              <div className="rows">
                {resolution.candidates.map((entry) => (
                  <div key={entry.ref} className="row">
                    <span className="row-key">sıra {entry.ordinal}</span>
                    <span className="row-mid mono">{entry.ref}</span>
                    <span className="row-num">{percent(entry.score)}</span>
                    <span className="row-tags">
                      {entry.votes.slice(0, 3).map((vote) => (
                        <span key={vote} className="chip">
                          {vote}
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <Empty glyph="target" text="Aday yok" />
            )
          ) : null}

          {tab === 'assertions' ? (
            context.assertions.length ? (
              <div className="rows">
                {context.assertions.map((entry, index) => (
                  <div key={index} className="row">
                    <span className="row-key">{entry.kind}</span>
                    <span className="row-mid">{entry.expected}</span>
                    <span className="row-mid">{entry.actual}</span>
                    <Pill tone={entry.passed ? 'ok' : 'bad'}>
                      {entry.passed ? 'geçti' : 'kaldı'}
                    </Pill>
                  </div>
                ))}
              </div>
            ) : (
              <Empty glyph="shield" text="Doğrulama yok" />
            )
          ) : null}

          {tab === 'blind' ? (
            context.blindSpots.length ? (
              <div className="rows">
                {context.blindSpots.map((spot, index) => (
                  <div key={index} className="row">
                    <span className="row-key">{spot.kind}</span>
                    <span className="row-mid">{spot.detail}</span>
                    <span className="row-num mono">{spot.key}</span>
                  </div>
                ))}
              </div>
            ) : (
              <Empty glyph="layers" text="Kör nokta yok" />
            )
          ) : null}

          {tab === 'elements' ? (
            <>
              <div className="search">
                <Glyph name="search" size={13} />
                <input
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder="Filtre"
                  spellCheck={false}
                  aria-label="Eleman filtresi"
                />
              </div>
              {elements.length ? (
                <div className="rows">
                  {elements.map((item) => (
                    <div key={item.ref} className={'row' + (item.visible ? '' : ' dim')}>
                      <span className="row-num">{item.ordinal}</span>
                      <span className="row-key">{item.tag}</span>
                      <span className="row-mid">{item.name || item.text || item.role}</span>
                      {item.interactive ? <Pill tone="accent">etkileşilebilir</Pill> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <Empty glyph="grid" text="Eşleşen eleman yok" />
              )}
            </>
          ) : null}

          {tab === 'shot' && context.screenshot ? (
            <button className="shot-btn" onClick={() => onShot(context.screenshot)} type="button">
              <img
                className="shot-thumb"
                src={'data:image/png;base64,' + context.screenshot}
                alt=""
              />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
})
