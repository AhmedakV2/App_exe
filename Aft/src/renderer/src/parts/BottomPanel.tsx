import React, { memo } from 'react'
import type { Console as ConsoleApi, Line } from '../useConsole'
import type { BottomTab } from '../workbench'
import ConsolePanel from './Console'
import { Glyph } from '../icons'
import { Sym } from '../ui'

export default memo(function BottomPanel({
  tab,
  api,
  focusSeed,
  problems,
  onTab,
  onClose
}: {
  tab: BottomTab
  api: ConsoleApi
  focusSeed: number
  problems: Line[]
  onTab: (tab: BottomTab) => void
  onClose: () => void
}): React.JSX.Element {
  return (
    <>
      <div className="ptabs">
        <button
          className={'ptab' + (tab === 'console' ? ' on' : '')}
          onClick={() => onTab('console')}
          type="button"
        >
          <Glyph name="terminal" size={12} />
          Konsol
          {api.pending ? (
            <span className="term-running">
              <span className="spinner" />
            </span>
          ) : null}
        </button>
        <button
          className={'ptab' + (tab === 'problems' ? ' on' : '')}
          onClick={() => onTab('problems')}
          type="button"
        >
          Sorunlar
          {problems.length ? <span className="cnt bad">{problems.length}</span> : null}
        </button>
        <span className="push" />
        <button className="ib" title="Temizle" onClick={api.clear} type="button">
          <Glyph name="trash" size={13} />
        </button>
        <button className="ib" title="Kapat Ctrl+K" onClick={onClose} type="button">
          <Glyph name="close" size={13} />
        </button>
      </div>
      <div className="pbody">
        {tab === 'console' ? <ConsolePanel api={api} focusSeed={focusSeed} /> : null}
        {tab === 'problems' ? (
          problems.length ? (
            <div className="log">
              {problems.map((line) => (
                <div key={line.id} className="issue">
                  <Sym tone="bad" />
                  <span className="msg">{line.text}</span>
                  <span className="loc">{line.time}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">
              <Glyph name="check" size={20} />
              <span>Sorun yok</span>
            </div>
          )
        ) : null}
      </div>
    </>
  )
})
