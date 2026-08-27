import React from 'react'
import RecordPanel from '../RecordPanel'
import type { Report } from '../report'

export default function RecordPage({
  stageRef,
  panelWidth,
  onGrip,
  blocked,
  onReport,
  onSaved
}: {
  stageRef: (node: HTMLDivElement | null) => void
  panelWidth: number
  onGrip: (event: React.PointerEvent<HTMLDivElement>) => void
  blocked: boolean
  onReport: (report: Report) => void
  onSaved: () => void
}): React.JSX.Element {
  return (
    <div className="split">
      <div className="stage" ref={stageRef} />

      <section className="side" style={{ width: panelWidth }}>
        <div
          className="side-grip"
          onPointerDown={onGrip}
          role="separator"
          aria-orientation="vertical"
          aria-label="Panel genişliği"
        />
        <RecordPanel blocked={blocked} onReport={onReport} onSaved={onSaved} />
      </section>
    </div>
  )
}
