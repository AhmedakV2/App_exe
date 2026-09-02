import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Glyph } from '../icons'

export interface PaletteItem {
  id: string
  group: string
  label: string
  detail?: string
  glyph: string
  kbd?: string[]
  run: () => void
}

const MAX = 24

export default memo(function CommandPalette({
  items,
  onClose,
  onConsole
}: {
  items: PaletteItem[]
  onClose: () => void
  onConsole: (command: string) => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const consoleMode = query.startsWith('>')

  const rows = useMemo(() => {
    if (consoleMode) return []
    const text = query.trim().toLowerCase()
    const parts = text.split(/\s+/).filter(Boolean)
    const scored = items
      .map((item) => {
        const hay = (item.group + ' ' + item.label + ' ' + (item.detail ?? '')).toLowerCase()
        if (!parts.length) return { item, score: 1 }
        let score = 0
        for (const part of parts) {
          if (!hay.includes(part)) return { item, score: 0 }
          score += item.label.toLowerCase().startsWith(part) ? 3 : 1
        }
        return { item, score }
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX)
    return scored.map((entry) => entry.item)
  }, [consoleMode, items, query])

  const active = rows.length ? Math.min(sel, rows.length - 1) : -1

  const fire = useCallback((): void => {
    if (consoleMode) {
      const command = query.slice(1).trim()
      if (command) onConsole(command)
      onClose()
      return
    }
    if (active < 0) return
    const item = rows[active]
    onClose()
    item.run()
  }, [active, consoleMode, onClose, onConsole, query, rows])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        if (rows.length) setSel((prev) => (prev + 1) % rows.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        if (rows.length) setSel((prev) => (prev - 1 + rows.length) % rows.length)
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        fire()
      }
    },
    [fire, onClose, rows.length]
  )

  const groups = useMemo(() => {
    const out: { group: string; items: { item: PaletteItem; index: number }[] }[] = []
    rows.forEach((item, index) => {
      const last = out[out.length - 1]
      if (last && last.group === item.group) last.items.push({ item, index })
      else out.push({ group: item.group, items: [{ item, index }] })
    })
    return out
  }, [rows])

  return (
    <>
      <div className="veil" onMouseDown={onClose} />
      <div className="qp" role="dialog" aria-label="Komut paleti">
        <div className="qp-input">
          <Glyph name="search" size={14} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setSel(0)
            }}
            onKeyDown={onKeyDown}
            placeholder="Komut, senaryo veya koşum ara"
            spellCheck={false}
            aria-label="Komut paleti"
          />
          <kbd>Esc</kbd>
        </div>
        <div className="qp-list">
          {consoleMode ? (
            <>
              <div className="qp-sec">Konsol komutu</div>
              <button className="qp-item sel" onClick={fire} type="button">
                <Glyph name="terminal" size={13} />
                <span className="lb mono">{query.slice(1).trim() || 'komut yazın'}</span>
                <span>
                  <kbd>Enter</kbd>
                </span>
              </button>
            </>
          ) : groups.length ? (
            groups.map((group) => (
              <React.Fragment key={group.group}>
                <div className="qp-sec">{group.group}</div>
                {group.items.map(({ item, index }) => (
                  <button
                    key={item.id}
                    className={'qp-item' + (index === active ? ' sel' : '')}
                    onMouseEnter={() => setSel(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      onClose()
                      item.run()
                    }}
                    type="button"
                  >
                    <Glyph name={item.glyph} size={13} />
                    <span className="lb">
                      {item.label}
                      {item.detail ? <span className="d">{item.detail}</span> : null}
                    </span>
                    <span>
                      {item.kbd ? item.kbd.map((key) => <kbd key={key}>{key}</kbd>) : null}
                    </span>
                  </button>
                ))}
              </React.Fragment>
            ))
          ) : (
            <div className="qp-sec">Eşleşme yok</div>
          )}
        </div>
        <div className="qp-foot">
          <span>
            <kbd>↑↓</kbd> gezin
          </span>
          <span>
            <kbd>Enter</kbd> çalıştır
          </span>
          <span className="push" />
          <span>
            <kbd>&gt;</kbd> konsol komutu
          </span>
        </div>
      </div>
    </>
  )
})
