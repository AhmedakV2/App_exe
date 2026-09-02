import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Console as ConsoleApi, Line, LineKind } from '../useConsole'
import { PALETTE, PALETTE_KEYS, type Entry } from '../commands'
import { Glyph } from '../icons'
import { formatMs } from '../format'

const PIN_SLACK = 48
const MAX_SUGGESTIONS = 6

const ROLES: Record<LineKind, { label: string; glyph: string }> = {
  in: { label: 'Komut', glyph: 'prompt' },
  ok: { label: 'Tamamlandı', glyph: 'check' },
  err: { label: 'Yapılamadı', glyph: 'alert' },
  note: { label: 'Bilgi', glyph: 'info' }
}

const LogRow = memo(function LogRow({ line }: { line: Line }): React.JSX.Element {
  const role = ROLES[line.kind]
  return (
    <div className={'line ' + line.kind}>
      <span className="line-mark">
        <Glyph name={role.glyph} size={12} />
      </span>
      <div className="line-body">
        <div className="line-meta">
          <span className="line-role">{role.label}</span>
          <span className="line-time">{line.time}</span>
          {line.ms === undefined ? null : <span className="line-ms">{formatMs(line.ms)}</span>}
        </div>
        <div className="line-text">{line.text}</div>
        {line.facts ? (
          <div className="facts">
            {line.facts.map((fact) => (
              <span key={fact.label} className={fact.ok ? 'fact yes' : 'fact no'}>
                <span className="fact-mark">{fact.ok ? '✓' : '✕'}</span>
                {fact.label}
              </span>
            ))}
          </div>
        ) : null}
        {line.detail ? (
          <div className="detail">
            {line.detail.map((row, index) => (
              <div key={index} className="detail-row">
                {row}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
})

export default memo(function Console({
  api,
  focusSeed
}: {
  api: ConsoleApi
  focusSeed: number
}): React.JSX.Element {
  const [cmd, setCmd] = useState('')
  const [sel, setSel] = useState(0)
  const [muted, setMuted] = useState(false)

  const logRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const pinnedRef = useRef(true)
  const cursorRef = useRef(-1)

  const { lines, pending, submit, getHistory } = api

  useEffect(() => {
    if (!pinnedRef.current) return
    const log = logRef.current
    if (!log) return
    log.scrollTop = log.scrollHeight
  }, [lines])

  useEffect(() => {
    const input = inputRef.current
    if (!input || input.disabled) return
    input.focus()
  }, [focusSeed, pending])

  const onScroll = useCallback((): void => {
    const log = logRef.current
    if (!log) return
    pinnedRef.current = log.scrollHeight - log.scrollTop - log.clientHeight <= PIN_SLACK
  }, [])

  const suggestions = useMemo(() => {
    if (pending || muted) return []
    const text = cmd.trim().toLowerCase()
    if (!text || /\s/.test(cmd.trim())) return []
    return PALETTE.filter((entry) => entry.key.startsWith(text)).slice(0, MAX_SUGGESTIONS)
  }, [cmd, pending, muted])

  const active = suggestions.length ? Math.min(sel, suggestions.length - 1) : -1

  const complete = useCallback((entry: Entry): void => {
    setCmd(entry.key + (/[<[]/.test(entry.usage) ? ' ' : ''))
    setSel(0)
    inputRef.current?.focus()
  }, [])

  const fire = useCallback((): void => {
    const text = cmd
    setCmd('')
    setMuted(false)
    setSel(0)
    cursorRef.current = -1
    pinnedRef.current = true
    void submit(text).then(() => inputRef.current?.focus())
  }, [cmd, submit])

  const stepHistory = useCallback(
    (direction: number): void => {
      const history = getHistory()
      if (!history.length) return
      setMuted(true)

      if (direction < 0) {
        const index =
          cursorRef.current < 0 ? history.length - 1 : Math.max(0, cursorRef.current - 1)
        cursorRef.current = index
        setCmd(history[index])
        return
      }

      if (cursorRef.current < 0) return
      const index = cursorRef.current + 1
      if (index >= history.length) {
        cursorRef.current = -1
        setCmd('')
        return
      }
      cursorRef.current = index
      setCmd(history[index])
    },
    [getHistory]
  )

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>): void => {
      if (event.key === 'Escape') {
        setMuted(true)
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        if (suggestions.length)
          setSel((prev) => (prev - 1 + suggestions.length) % suggestions.length)
        else stepHistory(-1)
        return
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        if (suggestions.length) setSel((prev) => (prev + 1) % suggestions.length)
        else stepHistory(1)
        return
      }

      if (event.key === 'Tab') {
        if (!suggestions.length || active < 0) return
        event.preventDefault()
        complete(suggestions[active])
        return
      }

      if (event.key !== 'Enter') return
      event.preventDefault()

      const typed = cmd.trim().toLowerCase()
      if (suggestions.length && active >= 0 && !PALETTE_KEYS.has(typed)) {
        complete(suggestions[active])
        return
      }
      fire()
    },
    [active, cmd, complete, fire, stepHistory, suggestions]
  )

  return (
    <div className="rec">
      <div className="term-body">
        <div
          className="log"
          ref={logRef}
          onScroll={onScroll}
          role="log"
          aria-live="polite"
          aria-label="Terminal çıktısı"
        >
          {lines.map((line) => (
            <LogRow key={line.id} line={line} />
          ))}
        </div>

        {suggestions.length ? (
          <div className="palette" role="listbox" aria-label="Komut önerileri">
            {suggestions.map((entry, index) => (
              <button
                key={entry.key}
                className={'palette-row' + (index === active ? ' sel' : '')}
                role="option"
                aria-selected={index === active}
                onMouseEnter={() => setSel(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => complete(entry)}
                type="button"
              >
                <span className="palette-key">{entry.usage}</span>
                <span className="palette-hint">{entry.hint}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="composer">
        <span className="composer-caret">›</span>
        <input
          ref={inputRef}
          value={cmd}
          onChange={(event) => {
            setCmd(event.target.value)
            setMuted(false)
            setSel(0)
            cursorRef.current = -1
          }}
          onKeyDown={onKeyDown}
          placeholder={pending ? '' : 'komut'}
          spellCheck={false}
          disabled={pending}
          aria-label="Komut girişi"
        />
        <button
          className="send"
          onMouseDown={(event) => event.preventDefault()}
          onClick={fire}
          disabled={pending || !cmd.trim()}
          title="Çalıştır"
          aria-label="Çalıştır"
          type="button"
        >
          <Glyph name="send" size={15} />
        </button>
      </div>
    </div>
  )
})
