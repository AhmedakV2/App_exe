import React, { memo, useState } from 'react'
import type { Console as ConsoleApi } from '../useConsole'
import type { AgentLogEntry } from '../../../main/bridge/api-types'
import ConsoleStream from './Console'
import { Glyph } from '../icons'
import { formatClock } from '../format'
import { Empty } from '../ui'

type DrawerTab = 'terminal' | 'agent'

const TABS: { id: DrawerTab; label: string; glyph: string }[] = [
  { id: 'terminal', label: 'Terminal', glyph: 'terminal' },
  { id: 'agent', label: 'Ajan', glyph: 'spark' }
]

export default memo(function Drawer({
  api,
  agentLog,
  height,
  focusSeed,
  onGrip,
  onClose
}: {
  api: ConsoleApi
  agentLog: AgentLogEntry[]
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
        {agentLog.length ? (
          <ol className="agent-feed">
            {agentLog.map((entry, index) => (
              <li key={entry.at + ':' + index} className={'agent-feed-row ' + entry.level}>
                <span className="agent-feed-time">{formatClock(entry.at)}</span>
                <span className="agent-feed-text">{entry.text}</span>
                {entry.detail.length ? (
                  <span className="agent-feed-detail">{entry.detail.join(' · ')}</span>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <Empty
            glyph="spark"
            text="Ajan akışı beklemede"
            hint="Ajan bir araç çalıştırdığında plan, adım ve karar akışı burada canlı olarak listelenir."
          />
        )}
      </div>
    </section>
  )
})
