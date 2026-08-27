import React from 'react'
import type { AgentAction } from '../../../main/browser/types'
import type { Console as ConsoleApi } from '../useConsole'
import ConsolePanel from '../parts/Console'
import ElementList from '../parts/ElementList'

export default function BrowserPage({
  stageRef,
  api,
  vision,
  listOpen,
  listWidth,
  terminalOpen,
  termHeight,
  focusSeed,
  onListGrip,
  onTermGrip,
  onCloseList,
  onCloseTerminal,
  onAction
}: {
  stageRef: (node: HTMLDivElement | null) => void
  api: ConsoleApi
  vision: boolean
  listOpen: boolean
  listWidth: number
  terminalOpen: boolean
  termHeight: number
  focusSeed: number
  onListGrip: (event: React.PointerEvent<HTMLDivElement>) => void
  onTermGrip: (event: React.PointerEvent<HTMLDivElement>) => void
  onCloseList: () => void
  onCloseTerminal: () => void
  onAction: (action: AgentAction) => void
}): React.JSX.Element {
  return (
    <div className="split">
      {listOpen ? (
        <ElementList
          elements={api.elements}
          vision={vision}
          width={listWidth}
          onAction={onAction}
          onClose={onCloseList}
          onGrip={onListGrip}
        />
      ) : null}

      <div className="main">
        <div className="stage" ref={stageRef} />
        {terminalOpen ? (
          <ConsolePanel
            api={api}
            height={termHeight}
            focusSeed={focusSeed}
            onGrip={onTermGrip}
            onClose={onCloseTerminal}
          />
        ) : null}
      </div>
    </div>
  )
}
