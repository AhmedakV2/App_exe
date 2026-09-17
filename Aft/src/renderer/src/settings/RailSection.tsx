import React from 'react'
import { Glyph } from '../icons'
import { assignShortcut, moveRail, railEntries, SHORTCUTS, toggleRail } from '../shell/rail'
import type { RailItem } from '../shell/rail'
import type { PageId } from '../shell/prefs'

export default function RailSection({
  rail,
  onChange
}: {
  rail: RailItem[]
  onChange: (next: RailItem[]) => void
}): React.JSX.Element {
  const entries = railEntries(rail)
  const visible = entries.filter((entry) => !entry.hidden).length

  const move = (id: PageId, offset: number): void => onChange(moveRail(rail, id, offset))
  const toggle = (id: PageId): void => onChange(toggleRail(rail, id))
  const shortcut = (id: PageId, value: string): void => onChange(assignShortcut(rail, id, value))

  return (
    <section className="sheet-block">
      <h3 className="sheet-label">Sekmeler</h3>
      <p className="set-muted">Sıralamayı değiştirin, kısayol atayın veya sekmeyi gizleyin.</p>

      <div className="rail-rows">
        {entries.map((entry, index) => (
          <div key={entry.id} className={'rail-row' + (entry.hidden ? ' off' : '')}>
            <span className="rail-row-icon">
              <Glyph name={entry.nav.glyph} size={16} />
            </span>
            <span className="rail-row-name">{entry.nav.label}</span>

            <select
              className="rail-row-key"
              value={entry.shortcut}
              aria-label={entry.nav.label + ' kısayolu'}
              onChange={(event) => shortcut(entry.id, event.target.value)}
            >
              {SHORTCUTS.map((code) => (
                <option key={code || 'none'} value={code}>
                  {code || 'Kısayol yok'}
                </option>
              ))}
            </select>

            <button
              className="ghost-btn"
              type="button"
              title="Yukarı taşı"
              aria-label="Yukarı taşı"
              disabled={index === 0}
              onClick={() => move(entry.id, -1)}
            >
              <Glyph name="up" size={14} />
            </button>
            <button
              className="ghost-btn"
              type="button"
              title="Aşağı taşı"
              aria-label="Aşağı taşı"
              disabled={index === entries.length - 1}
              onClick={() => move(entry.id, 1)}
            >
              <Glyph name="down" size={14} />
            </button>
            <button
              className="ghost-btn"
              type="button"
              title={entry.hidden ? 'Sekmeyi göster' : 'Sekmeyi gizle'}
              aria-label={entry.hidden ? 'Sekmeyi göster' : 'Sekmeyi gizle'}
              disabled={!entry.hidden && visible <= 1}
              onClick={() => toggle(entry.id)}
            >
              <Glyph name={entry.hidden ? 'eyeOff' : 'eye'} size={14} />
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
