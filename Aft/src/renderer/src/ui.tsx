import React, { memo } from 'react'
import { Glyph } from './icons'

export type Tone = 'ok' | 'warn' | 'bad' | 'flat' | 'accent' | 'info'

const SYM_TEXT: Record<Tone, string> = {
  ok: '✓',
  bad: '✗',
  warn: '!',
  flat: '–',
  accent: '●',
  info: 'i'
}

export const Sym = memo(function Sym({
  tone,
  text
}: {
  tone: Tone
  text?: string
}): React.JSX.Element {
  return <span className={'sym ' + tone}>{text ?? SYM_TEXT[tone]}</span>
})

export const PageHead = memo(function PageHead({
  title,
  meta,
  actions
}: {
  title: React.ReactNode
  meta?: React.ReactNode
  actions?: React.ReactNode
}): React.JSX.Element {
  return (
    <header className="hdr">
      <span className="t">{title}</span>
      {meta}
      <span className="push" />
      {actions}
    </header>
  )
})

export const Pill = memo(function Pill({
  tone = 'flat',
  children
}: {
  tone?: Tone
  children: React.ReactNode
}): React.JSX.Element {
  return <span className={'chip ' + tone}>{children}</span>
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
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
      {hint ? <span className="metric-hint">{hint}</span> : null}
    </div>
  )
})

export const Card = memo(function Card({
  label,
  actions,
  scroll,
  grow,
  children
}: {
  label: string
  actions?: React.ReactNode
  scroll?: boolean
  grow?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className={'col' + (grow ? ' grow' : '')} style={grow ? { flex: 1 } : undefined}>
      <header className="ph">
        <span>{label}</span>
        <span className="push" />
        {actions}
      </header>
      <div className={scroll ? 'col scroll' : 'col'} style={{ flex: 1, borderRight: 0 }}>
        {children}
      </div>
    </section>
  )
})

export const Empty = memo(function Empty({
  glyph,
  text
}: {
  glyph: string
  text: string
}): React.JSX.Element {
  return (
    <div className="empty">
      <Glyph name={glyph} size={20} />
      <span>{text}</span>
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
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
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
      <span className="toggle-box" />
      <span className="toggle-label">{label}</span>
    </label>
  )
})

export const TextButton = memo(function TextButton({
  glyph,
  label,
  onClick,
  disabled,
  tone,
  small
}: {
  glyph?: string
  label: string
  onClick: () => void
  disabled?: boolean
  tone?: 'primary' | 'danger' | 'ghost'
  small?: boolean
}): React.JSX.Element {
  const cls =
    'btn' +
    (tone === 'primary'
      ? ' pri'
      : tone === 'danger'
        ? ' danger'
        : tone === 'ghost'
          ? ' ghost'
          : '') +
    (small ? ' sm' : '')
  return (
    <button className={cls} onClick={onClick} disabled={disabled} type="button">
      {glyph ? <Glyph name={glyph} size={12} /> : null}
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

export const Switch = memo(function Switch({
  on,
  disabled,
  onChange,
  label
}: {
  on: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
  label: string
}): React.JSX.Element {
  return (
    <button
      className={'sw' + (on ? ' on' : '')}
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      type="button"
    />
  )
})
