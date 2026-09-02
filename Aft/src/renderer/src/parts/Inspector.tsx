import React, { memo } from 'react'
import type { AgentAction, PageElement } from '../../../main/browser/types'
import type { RightTab } from '../workbench'
import type { RecordReport } from '../RecordPanel'
import RecordPanel from '../RecordPanel'
import RunPanel from './RunPanel'
import ElementList from './ElementList'
import { Glyph } from '../icons'

export default memo(function Inspector({
  tab,
  recording,
  playing,
  vision,
  elements,
  revision,
  runRequest,
  onTab,
  onClose,
  onAction,
  onReport,
  onSaved,
  onBusy
}: {
  tab: RightTab
  recording: boolean
  playing: boolean
  vision: boolean
  elements: PageElement[]
  revision: number
  runRequest: string
  onTab: (tab: RightTab) => void
  onClose: () => void
  onAction: (action: AgentAction) => void
  onReport: (report: RecordReport) => void
  onSaved: () => void
  onBusy: (running: boolean) => void
}): React.JSX.Element {
  return (
    <>
      <div className="rtabs">
        <button
          className={'rtab' + (tab === 'record' ? ' on' : '')}
          onClick={() => onTab('record')}
          type="button"
        >
          <Glyph name="record" size={12} />
          Kayıt
          {recording ? <span className="dot rec" /> : null}
        </button>
        <button
          className={'rtab' + (tab === 'playback' ? ' on' : '')}
          onClick={() => onTab('playback')}
          type="button"
        >
          <Glyph name="play" size={11} />
          Oynatma
          {playing ? <span className="dot run" /> : null}
        </button>
        <button
          className={'rtab' + (tab === 'elements' ? ' on' : '')}
          onClick={() => onTab('elements')}
          type="button"
        >
          <Glyph name="grid" size={12} />
          Öğeler
          {elements.length ? <span className="chip">{elements.length}</span> : null}
        </button>
        <span className="push" />
        <button className="ib" title="Paneli kapat" onClick={onClose} type="button">
          <Glyph name="close" size={13} />
        </button>
      </div>
      <div className="rbody" hidden={tab !== 'record'}>
        <RecordPanel blocked={playing} onReport={onReport} onSaved={onSaved} />
      </div>
      <div className="rbody" hidden={tab !== 'playback'}>
        <RunPanel
          active={tab === 'playback'}
          revision={revision}
          request={runRequest}
          blocked={recording}
          onReport={onReport}
          onBusy={onBusy}
        />
      </div>
      <div className="rbody" hidden={tab !== 'elements'}>
        <ElementList elements={elements} vision={vision} onAction={onAction} />
      </div>
    </>
  )
})
