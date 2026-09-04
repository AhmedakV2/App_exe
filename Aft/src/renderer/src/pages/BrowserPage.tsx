import React from 'react'
import type { AgentAction, BrowserState, NavKind, PageElement } from '../../../main/browser/types'
import type { PlaybackOptions } from '../../../main/scenario/types'
import ElementList from '../parts/ElementList'
import RecordPanel from '../RecordPanel'
import RunPanel from '../parts/RunPanel'
import StageBar from '../parts/StageBar'
import { Glyph } from '../icons'
import type { Report } from '../report'

export type DockTab = 'record' | 'playback' | null

export default function BrowserPage({
  stageRef,
  state,
  visionCount,
  urlSeed,
  elements,
  listOpen,
  listWidth,
  dock,
  dockWidth,
  devtoolsOpen,
  devtoolsWidth,
  revision,
  runRequest,
  recording,
  playing,
  playOptions,
  onNav,
  onVision,
  onListGrip,
  onDockGrip,
  onDevGrip,
  onCloseList,
  onDock,
  onAction,
  onReport,
  onSaved,
  onBusy
}: {
  stageRef: (node: HTMLDivElement | null) => void
  state: BrowserState
  visionCount: number
  urlSeed: number
  elements: PageElement[]
  listOpen: boolean
  listWidth: number
  dock: DockTab
  dockWidth: number
  devtoolsOpen: boolean
  devtoolsWidth: number
  revision: number
  runRequest: string
  recording: boolean
  playing: boolean
  playOptions: Partial<PlaybackOptions>
  onNav: (kind: NavKind) => void
  onVision: () => void
  onListGrip: (event: React.PointerEvent<HTMLDivElement>) => void
  onDockGrip: (event: React.PointerEvent<HTMLDivElement>) => void
  onDevGrip: (event: React.PointerEvent<HTMLDivElement>) => void
  onCloseList: () => void
  onDock: (tab: DockTab) => void
  onAction: (action: AgentAction) => void
  onReport: (report: Report) => void
  onSaved: () => void
  onBusy: (running: boolean) => void
}): React.JSX.Element {
  return (
    <div className="split">
      {listOpen ? (
        <ElementList
          elements={elements}
          vision={state.vision}
          width={listWidth}
          onAction={onAction}
          onClose={onCloseList}
          onGrip={onListGrip}
        />
      ) : null}

      <div className="main">
        <StageBar
          state={state}
          visionCount={visionCount}
          urlSeed={urlSeed}
          onNav={onNav}
          onAction={onAction}
          onVision={onVision}
        />
        <div className="stage" ref={stageRef}>
          {devtoolsOpen ? (
            <div
              className="dev-grip"
              style={{ right: devtoolsWidth }}
              onPointerDown={onDevGrip}
              role="separator"
              aria-orientation="vertical"
              aria-label="İnceleme paneli genişliği"
            />
          ) : null}
        </div>
      </div>

      {dock ? (
        <section className="side" style={{ width: dockWidth }}>
          <div
            className="side-grip"
            onPointerDown={onDockGrip}
            role="separator"
            aria-orientation="vertical"
            aria-label="Panel genişliği"
          />

          <header className="dock-head">
            <button
              className={'dock-tab' + (dock === 'record' ? ' sel' : '')}
              onClick={() => onDock('record')}
              type="button"
            >
              <Glyph name="record" size={13} />
              Kayıt
              {recording ? <span className="dock-dot rec" /> : null}
            </button>
            <button
              className={'dock-tab' + (dock === 'playback' ? ' sel' : '')}
              onClick={() => onDock('playback')}
              type="button"
            >
              <Glyph name="play" size={13} />
              Oynatma
              {playing ? <span className="dock-dot run" /> : null}
            </button>
            <span className="dock-push" />
            <button
              className="ghost-btn"
              title="Paneli kapat"
              aria-label="Paneli kapat"
              onClick={() => onDock(null)}
              type="button"
            >
              <Glyph name="collapse" size={15} />
            </button>
          </header>

          <div className="dock-body" hidden={dock !== 'record'}>
            <RecordPanel blocked={playing} onReport={onReport} onSaved={onSaved} />
          </div>

          <div className="dock-body" hidden={dock !== 'playback'}>
            <RunPanel
              active={dock === 'playback'}
              revision={revision}
              request={runRequest}
              blocked={recording}
              options={playOptions}
              onReport={onReport}
              onBusy={onBusy}
            />
          </div>
        </section>
      ) : null}
    </div>
  )
}
