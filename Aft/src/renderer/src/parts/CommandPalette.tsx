import React, { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Glyph } from '../icons'

export type Command = {
  id: string
  group: string
  label: string
  glyph: string
  hint?: string
  keywords?: string
}

const LIMIT = 40

function fold(value: string): string {
  return value.toLocaleLowerCase('tr')
}

export default memo(function CommandPalette({
  commands,
  onRun,
  onClose
}: {
  commands: Command[]
  onRun: (id: string) => void
  onClose: () => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  const rows = useMemo(() => {
    const needle = fold(query.trim())
    if (!needle) return commands.slice(0, LIMIT)
    return commands
      .filter((item) =>
        fold(item.label + ' ' + item.group + ' ' + (item.keywords ?? '')).includes(needle)
      )
      .slice(0, LIMIT)
  }, [commands, query])

  const active = rows.length ? Math.min(sel, rows.length - 1) : -1

  useEffect(() => {
    inputRef.current?.focus()
    window.aft.setModal(true)
    return () => window.aft.setModal(false)
  }, [])

  useEffect(() => {
    const node = listRef.current?.querySelector('[data-active="1"]')
    if (node instanceof HTMLElement) node.scrollIntoView({ block: 'nearest' })
  }, [active])

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSel((prev) => (rows.length ? (prev + 1) % rows.length : 0))
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSel((prev) => (rows.length ? (prev - 1 + rows.length) % rows.length : 0))
      return
    }

    if (event.key !== 'Enter' || active < 0) return
    event.preventDefault()
    onRun(rows[active].id)
  }

  let lastGroup = ''

  return (
    <div
      className="cmdk"
      role="dialog"
      aria-modal="true"
      aria-label="Komut paleti"
      onClick={onClose}
    >
      <div className="cmdk-frame" onClick={(event) => event.stopPropagation()}>
        <div className="cmdk-search">
          <Glyph name="search" size={15} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setSel(0)
            }}
            onKeyDown={onKeyDown}
            placeholder="İşlem ara: senaryo, koşum, kimlik, tema"
            spellCheck={false}
            aria-label="Komut ara"
          />
          <span className="cmd-key">Esc</span>
        </div>

        <div className="cmdk-list" ref={listRef} role="listbox">
          {rows.map((item, index) => {
            const head = item.group !== lastGroup ? item.group : ''
            lastGroup = item.group
            return (
              <React.Fragment key={item.id}>
                {head ? <span className="cmdk-group">{head}</span> : null}
                <button
                  className={'cmdk-item' + (index === active ? ' sel' : '')}
                  data-active={index === active ? '1' : '0'}
                  role="option"
                  aria-selected={index === active}
                  onMouseEnter={() => setSel(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onRun(item.id)}
                  type="button"
                >
                  <Glyph name={item.glyph} size={15} />
                  <span className="cmdk-label">{item.label}</span>
                  {item.hint ? <span className="cmdk-hint">{item.hint}</span> : null}
                </button>
              </React.Fragment>
            )
          })}

          {rows.length ? null : <div className="cmdk-empty">Eşleşen işlem yok</div>}
        </div>

        <footer className="cmdk-foot">
          <span className="cmd-key">↑↓</span>
          Gez
          <span className="cmd-key">↵</span>
          Çalıştır
          <span className="cmdk-push" />
          {rows.length} işlem
        </footer>
      </div>
    </div>
  )
})
