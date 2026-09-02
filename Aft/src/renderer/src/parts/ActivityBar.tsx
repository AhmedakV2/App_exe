import React, { memo } from 'react'
import type { Activity } from '../workbench'
import { Glyph } from '../icons'

const ITEMS: { id: Activity; glyph: string; label: string }[] = [
  { id: 'files', glyph: 'files', label: 'Gezgin' },
  { id: 'browser', glyph: 'globe', label: 'Tarayıcı' },
  { id: 'runs', glyph: 'run', label: 'Koşumlar' },
  { id: 'identity', glyph: 'pulse', label: 'Kimlik' },
  { id: 'coverage', glyph: 'radar', label: 'Kapsam' },
  { id: 'data', glyph: 'database', label: 'Veri' }
]

export default memo(function ActivityBar({
  activity,
  recording,
  playing,
  approvals,
  settingsOpen,
  onPick,
  onSettings
}: {
  activity: Activity
  recording: boolean
  playing: boolean
  approvals: number
  settingsOpen: boolean
  onPick: (activity: Activity) => void
  onSettings: () => void
}): React.JSX.Element {
  return (
    <nav className="act">
      {ITEMS.map((item) => (
        <button
          key={item.id}
          className={'act-btn' + (item.id === activity ? ' on' : '')}
          title={item.label}
          aria-label={item.label}
          aria-pressed={item.id === activity}
          onClick={() => onPick(item.id)}
          type="button"
        >
          <Glyph name={item.glyph} size={21} />
          {item.id === 'browser' && recording ? <span className="badge rec">●</span> : null}
          {item.id === 'browser' && !recording && playing ? (
            <span className="badge run">▶</span>
          ) : null}
          {item.id === 'identity' && approvals ? <span className="badge">{approvals}</span> : null}
        </button>
      ))}
      <span className="push" />
      <button
        className={'act-btn' + (settingsOpen ? ' on' : '')}
        title="Ayarlar"
        aria-label="Ayarlar"
        onClick={onSettings}
        type="button"
      >
        <Glyph name="settings" size={21} />
      </button>
    </nav>
  )
})
