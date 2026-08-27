import React, { memo, useMemo, useState } from 'react'
import type { AgentAction, PageElement } from '../../../main/browser/types'
import { Glyph } from '../icons'
import { Empty } from '../ui'

export default memo(function ElementList({
  elements,
  vision,
  onAction,
  onClose,
  onGrip,
  width
}: {
  elements: PageElement[]
  vision: boolean
  onAction: (action: AgentAction) => void
  onClose: () => void
  onGrip: (event: React.PointerEvent<HTMLDivElement>) => void
  width: number
}): React.JSX.Element {
  const [filter, setFilter] = useState('')

  const rows = useMemo(() => {
    const text = filter.trim().toLowerCase()
    if (!text) return elements
    return elements.filter(
      (item) =>
        item.name.toLowerCase().includes(text) ||
        item.text.toLowerCase().includes(text) ||
        item.tag.toLowerCase().includes(text) ||
        item.type.toLowerCase().includes(text) ||
        String(item.i) === text
    )
  }, [elements, filter])

  return (
    <section className="panel" style={{ width }}>
      <header className="panel-head">
        <span className="panel-title">ÖĞELER</span>
        <span className="panel-count">{rows.length}</span>
        <span className="panel-push" />
        <button
          className="ghost-btn"
          title="Kapat"
          aria-label="Kapat"
          onClick={onClose}
          type="button"
        >
          <Glyph name="collapse" size={15} />
        </button>
      </header>

      <div className="panel-body">
        <div className="search">
          <Glyph name="search" size={13} />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filtre"
            spellCheck={false}
            aria-label="Öğe filtresi"
          />
        </div>

        <div className="el-list">
          {rows.length ? (
            rows.map((item) => (
              <div key={item.i} className="el-row">
                <span className="el-no">{item.i}</span>
                <button
                  className="el-main"
                  onClick={() => onAction({ action: 'mouse_move', index: item.i })}
                  title={item.name || item.text || item.tag}
                  type="button"
                >
                  <span className="el-name">{item.name || item.text || item.tag}</span>
                  <span className="el-tag">{item.type || item.tag}</span>
                </button>
                <button
                  className="el-go"
                  onClick={() => onAction({ action: 'click', index: item.i })}
                  title="Tıkla"
                  aria-label="Tıkla"
                  type="button"
                >
                  <Glyph name="target" size={12} />
                </button>
              </div>
            ))
          ) : (
            <Empty glyph="grid" text={vision ? 'Öğe yok' : 'Görüş kapalı'} />
          )}
        </div>
      </div>

      <div
        className="panel-grip"
        onPointerDown={onGrip}
        role="separator"
        aria-orientation="vertical"
        aria-label="Panel genişliği"
      />
    </section>
  )
})
