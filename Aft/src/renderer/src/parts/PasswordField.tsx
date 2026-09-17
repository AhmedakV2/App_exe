import React, { useCallback, useId, useState } from 'react'
import { Glyph } from '../icons'

export default function PasswordField({
  label,
  value,
  autoComplete,
  minLength,
  required,
  disabled,
  onChange
}: {
  label: string
  value: string
  autoComplete: string
  minLength?: number
  required?: boolean
  disabled?: boolean
  onChange: (next: string) => void
}): React.JSX.Element {
  const [shown, setShown] = useState(false)
  const fieldId = useId()

  const toggle = useCallback((): void => setShown((current) => !current), [])

  return (
    <div className="gate-field">
      <label htmlFor={fieldId}>{label}</label>
      <div className="pass-wrap">
        <input
          id={fieldId}
          type={shown ? 'text' : 'password'}
          value={value}
          autoComplete={autoComplete}
          minLength={minLength}
          required={required}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          className="pass-eye"
          type="button"
          tabIndex={-1}
          title={shown ? 'Parolayı gizle' : 'Parolayı göster'}
          aria-label={shown ? 'Parolayı gizle' : 'Parolayı göster'}
          aria-pressed={shown}
          onClick={toggle}
        >
          <Glyph name={shown ? 'eyeOff' : 'eye'} size={16} />
        </button>
      </div>
    </div>
  )
}
