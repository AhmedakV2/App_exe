import React, { memo, useEffect, useRef, useState } from 'react'
import { Glyph } from '../icons'
import { Field, TextButton } from '../ui'

export default memo(function PromptSheet({
  title,
  label,
  value,
  message,
  confirmLabel,
  danger,
  onSubmit,
  onClose
}: {
  title: string
  label?: string
  value?: string | null
  message?: string
  confirmLabel: string
  danger?: boolean
  onSubmit: (value: string) => void
  onClose: () => void
}): React.JSX.Element {
  const [text, setText] = useState(value ?? '')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    } else {
      frameRef.current?.focus()
    }

    window.aft.setModal(true)

    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.aft.setModal(false)
    }
  }, [onClose])

  const submit = (): void => {
    const next = text.trim()
    if (value !== null && value !== undefined && !next) return
    onSubmit(next)
  }

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div
        ref={frameRef}
        className="sheet-frame narrow"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="sheet-head">
          <span className="sheet-title">{title}</span>
          <span className="sheet-push" />
          <button className="shot-btn" title="Kapat" onClick={onClose} type="button">
            <Glyph name="close" size={14} />
          </button>
        </header>

        <div className="sheet-body">
          {message ? <div className="hint">{message}</div> : null}

          {value === null || value === undefined ? null : (
            <Field label={label ?? 'Ad'}>
              <input
                ref={inputRef}
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  submit()
                }}
                spellCheck={false}
              />
            </Field>
          )}

          <div className="sheet-foot">
            <TextButton glyph="close" label="Vazgeç" onClick={onClose} />
            <TextButton
              glyph={danger ? 'trash' : 'check'}
              label={confirmLabel}
              onClick={submit}
              tone={danger ? 'danger' : 'primary'}
            />
          </div>
        </div>
      </div>
    </div>
  )
})
