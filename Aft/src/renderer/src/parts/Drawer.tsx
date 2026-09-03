import React, { memo, useState } from 'react'
import type { Console as ConsoleApi } from '../useConsole'
import ConsoleStream from './Console'
import { Glyph } from '../icons'
import { Empty } from '../ui'

export type DrawerTab = 'terminal' | 'agent' | 'dom'

const TABS: { id: DrawerTab; label: string; glyph: string }[] = [
  { id: 'terminal', label: 'Terminal', glyph: 'terminal' },
  { id: 'agent', label: 'Ajan', glyph: 'spark' },
  { id: 'dom', label: 'DOM', glyph: 'layers' }
]

export default memo(function Drawer({
  api,
  height,
  focusSeed,
  onGrip,
  onClose
}: {
  api: ConsoleApi
  height: number
  focusSeed: number
  onGrip: (event: React.PointerEvent<HTMLDivElement>) => void
  onClose: () => void
}): React.JSX.Element {
  const [tab, setTab] = useState<DrawerTab>('terminal')

  return (
    <section className="terminal" style={{ height }} aria-label="Yardımcı panel">
      <div
        className="term-grip"
        onPointerDown={onGrip}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Panel yüksekliği"
      />

      <header className="term-head">
        {TABS.map((item) => (
          <button
            key={item.id}
            className={'dock-tab' + (item.id === tab ? ' sel' : '')}
            onClick={() => setTab(item.id)}
            aria-pressed={item.id === tab}
            type="button"
          >
            <Glyph name={item.glyph} size={13} />
            {item.label}
          </button>
        ))}

        {api.pending ? (
          <span className="term-running">
            <span className="spinner tiny" />
            çalışıyor
          </span>
        ) : null}

        <span className="term-push" />

        {tab === 'terminal' ? (
          <button
            className="ghost-btn"
            title="Temizle"
            aria-label="Temizle"
            onClick={api.clear}
            type="button"
          >
            <Glyph name="trash" size={14} />
          </button>
        ) : null}
        <button
          className="ghost-btn"
          title="Paneli kapat"
          aria-label="Paneli kapat"
          onClick={onClose}
          type="button"
        >
          <Glyph name="minimize" size={14} />
        </button>
      </header>

      <div className="drawer-pane" hidden={tab !== 'terminal'}>
        <ConsoleStream api={api} focusSeed={focusSeed} />
      </div>

      <div className="drawer-pane" hidden={tab !== 'agent'}>
        <Empty
          glyph="spark"
          text="Ajan akışı beklemede"
          hint="Otonom ajan devreye alındığında plan, adım ve karar akışı bu panelde canlı olarak listelenecek."
        />
      </div>

      <div className="drawer-pane" hidden={tab !== 'dom'}>
        {api.elements.length ? (
          <div className="table-scroll">
            <div className="table-scroll">
              <div className="table wide">
                <div className="tr th">
                  <span className="td no">#</span>
                  <span className="td grow">ad</span>
                  <span className="td wide">tür</span>
                  <span className="td wide">etiket</span>
                </div>
                {api.elements.map((item) => (
                  <div key={item.i} className="tr">
                    <span className="td no">{item.i}</span>
                    <span className="td grow">{item.name || item.text || item.tag}</span>
                    <span className="td wide dim">{item.type || '—'}</span>
                    <span className="td wide mono">{item.tag}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <Empty
            glyph="layers"
            text="DOM analizi yok"
            hint="Görüş açıldığında sayfadaki etkileşimli öğeler burada tablolanır."
          />
        )}
      </div>
    </section>
  )
})
