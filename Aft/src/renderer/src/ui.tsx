import React, { memo } from 'react'
import { Glyph } from './icons'

export type Tone = 'ok' | 'warn' | 'bad' | 'flat' | 'accent'

export const PageHead = memo(function PageHead({
  title,
  meta,
  actions
}: {
  title: string
  meta?: React.ReactNode
  actions?: React.ReactNode
}): React.JSX.Element {
  return (
    <header className="page-head">
      <h1 className="page-title">{title}</h1>
      {meta ? <div className="page-meta">{meta}</div> : null}
      <span className="page-push" />
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  )
})

export const Skeleton = memo(function Skeleton({ rows = 3 }: { rows?: number }): React.JSX.Element {
  return (
    <div className="skeleton-stack">
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} className={'skeleton ' + (index % 2 ? 'line-2' : 'line-1')} />
      ))}
    </div>
  )
})

export const Pill = memo(function Pill({
  tone = 'flat',
  children
}: {
  tone?: Tone
  children: React.ReactNode
}): React.JSX.Element {
  return <span className={'pill ' + tone}>{children}</span>
})

export const Metric = memo(function Metric({
  label,
  value,
  tone = 'flat',
  hint
}: {
  label: string
  value: React.ReactNode
  tone?: Tone
  hint?: string
}): React.JSX.Element {
  return (
    <div className={'metric ' + tone}>
      <span className="metric-value">{value}</span>
      <span className="metric-label">{label}</span>
      {hint ? <span className="metric-hint">{hint}</span> : null}
    </div>
  )
})

export const Card = memo(function Card({
  label,
  actions,
  scroll,
  grow,
  flush,
  children
}: {
  label: string
  actions?: React.ReactNode
  scroll?: boolean
  grow?: boolean
  flush?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className={'card' + (grow ? ' grow' : '')}>
      <header className="card-head">
        <span className="card-label">{label}</span>
        <span className="card-push" />
        {actions}
      </header>
      <div className={'card-body' + (scroll ? ' scroll' : '') + (flush ? ' flush' : '')}>
        {children}
      </div>
    </section>
  )
})

export const Empty = memo(function Empty({
  glyph,
  text,
  hint,
  action
}: {
  glyph: string
  text: string
  hint?: string
  action?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="empty">
      <Glyph name={glyph} size={22} />
      <span>{text}</span>
      {hint ? <span className="empty-hint">{hint}</span> : null}
      {action}
    </div>
  )
})

export const Bar = memo(function Bar({
  value,
  tone = 'accent'
}: {
  value: number
  tone?: Tone
}): React.JSX.Element {
  return (
    <span className="bar">
      <span
        className={'bar-fill ' + tone}
        style={{ width: Math.round(Math.min(1, Math.max(0, value)) * 100) + '%' }}
      />
    </span>
  )
})

export const Field = memo(function Field({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  )
})

export const FieldRow = memo(function FieldRow({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <label className="form-row">
      <span className="field-label">{label}</span>
      <span className="form-control">
        {children}
        {hint ? <span className="field-hint">{hint}</span> : null}
      </span>
    </label>
  )
})

export const Toggle = memo(function Toggle({
  label,
  checked,
  disabled,
  onChange
}: {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
}): React.JSX.Element {
  return (
    <label className={'toggle' + (disabled ? ' off' : '')}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="toggle-box">
        <Glyph name="check" size={11} />
      </span>
      <span className="toggle-label">{label}</span>
    </label>
  )
})

export const TextButton = memo(function TextButton({
  glyph,
  label,
  onClick,
  disabled,
  busy,
  tone
}: {
  glyph?: string
  label: string
  onClick: () => void
  disabled?: boolean
  busy?: boolean
  tone?: 'primary' | 'danger'
}): React.JSX.Element {
  return (
    <button
      className={'txt-btn' + (tone ? ' ' + tone : '') + (busy ? ' busy' : '')}
      onClick={onClick}
      disabled={disabled || busy}
      type="button"
    >
      {busy ? <span className="spinner tiny" /> : glyph ? <Glyph name={glyph} size={13} /> : null}
      {label}
    </button>
  )
})

export const Segmented = memo(function Segmented({
  items,
  value,
  disabled,
  onPick
}: {
  items: { id: string; label: string }[]
  value: string
  disabled?: boolean
  onPick: (id: string) => void
}): React.JSX.Element {
  return (
    <div className="segmented" role="tablist">
      {items.map((item) => (
        <button
          key={item.id}
          className={'segment' + (item.id === value ? ' sel' : '')}
          role="tab"
          aria-selected={item.id === value}
          disabled={disabled}
          onClick={() => onPick(item.id)}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  )
})
