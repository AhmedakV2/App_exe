import React, { memo } from 'react'

const GLYPHS: Record<string, React.JSX.Element> = {
  chat: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  back: <path d="M15 18l-6-6 6-6" />,
  forward: <path d="M9 18l6-6-6-6" />,
  reload: (
    <>
      <path d="M3 12a9 9 0 0 1 15.3-6.4" />
      <path d="M18 4v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.3 6.4" />
      <path d="M6 20v-5h5" />
    </>
  ),
  stop: (
    <>
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </>
  ),
  home: (
    <>
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10h14V10" />
    </>
  ),
  eye: (
    <>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <path d="M1 1l22 22" />
    </>
  ),
  send: (
    <>
      <path d="M12 19V5" />
      <path d="M6 11l6-6 6 6" />
    </>
  ),
  collapse: <path d="M15 18l-6-6 6-6" />,
  minimize: <path d="M5 12h14" />,
  maximize: <rect x="5" y="5" width="14" height="14" />,
  restore: (
    <>
      <path d="M8 8V4h12v12h-4" />
      <rect x="4" y="8" width="12" height="12" />
    </>
  ),
  close: (
    <>
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </>
  ),
  terminal: (
    <>
      <path d="M4 17l6-5-6-5" />
      <path d="M12 19h8" />
    </>
  ),
  prompt: (
    <>
      <path d="M4 17l6-5-6-5" />
      <path d="M12 19h8" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M9 7V4h6v3" />
    </>
  ),
  check: <path d="M20 6L9 17l-5-5" />,
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6" />
      <path d="M12 16.5v.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6" />
      <path d="M12 7.5v.01" />
    </>
  ),
  settings: (
    <>
      {' '}
      <circle cx="12" cy="12" r="3" />{' '}
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09c.7 0 1.2-.76 1.51-1a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06c.51.51 1.2.64 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09c0 .7.76 1.2 1 1.51.62.31 1.31.18 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06c-.51.51-.64 1.2-.33 1.82V9c.28.28.64.5 1 .51H21a2 2 0 0 1 0 4h-.09c-.7 0-1.2.76-1.51 1-.31.62-.18 1.31.33 1.82z" />{' '}
    </>
  ),
  record: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
    </>
  ),
  square: <rect x="6" y="6" width="12" height="12" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <path d="M9 5v14" />
      <path d="M15 5v14" />
    </>
  ),
  play: <path d="M8 5l11 7-11 7z" />,
  up: <path d="M12 19V5l-6 6" />,
  down: <path d="M12 5v14l6-6" />,
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l8 3v6c0 5-3.4 8.2-8 9-4.6-.8-8-4-8-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  save: (
    <>
      <path d="M5 4h11l3 3v13H5z" />
      <path d="M8 4v6h7V4" />
      <rect x="8" y="13" width="8" height="7" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4L20 8l-4-4L4 16z" />
      <path d="M14 6l4 4" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  file: (
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v5h4" />
    </>
  ),
  camera: (
    <>
      <path d="M3 8h4l2-3h6l2 3h4v12H3z" />
      <circle cx="12" cy="13" r="4" />
    </>
  ),
  flag: (
    <>
      <path d="M6 21V4" />
      <path d="M6 5h12l-3 4 3 4H6" />
    </>
  ),
  suite: (
    <>
      <circle cx="7" cy="12" r="4.5" fill="currentColor" stroke="none" />
      <path d="M14 7l7 5-7 5z" fill="currentColor" stroke="none" />
    </>
  ),
  zoom: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </>
  ),
  library: (
    <>
      <path d="M4 4h5v16H4z" />
      <path d="M11 4h4v16h-4z" />
      <path d="M17 5l3 15" />
    </>
  ),
  pulse: (
    <>
      <path d="M3 12h4l2-6 3 12 2-6h7" />
    </>
  ),
  radar: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 12l6-4" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
      <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </>
  ),
  history: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3 4v5h5" />
      <path d="M12 8v4.5l3 1.8" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.5-4.5" />
    </>
  ),
  filter: <path d="M3 5h18l-7 8v6l-4 2v-8z" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" />
      <path d="M5 15V4h11" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 6 .5l2-2a4 4 0 0 0-6-6l-1 1" />
      <path d="M14 10a4 4 0 0 0-6-.5l-2 2a4 4 0 0 0 6 6l1-1" />
    </>
  ),
  warn: (
    <>
      <path d="M12 3l9 17H3z" />
      <path d="M12 10v4" />
      <path d="M12 17v.01" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3l9 5-9 5-9-5z" />
      <path d="M3 13l9 5 9-5" />
    </>
  ),
  cloud: (
    <>
      <path d="M7 19a4 4 0 0 1 0-8 5.5 5.5 0 0 1 10.5 1.5A3.5 3.5 0 0 1 17 19z" />
      <path d="M12 16v-5" />
      <path d="M9.5 13.5L12 11l2.5 2.5" />
    </>
  ),
  broom: (
    <>
      <path d="M14 3l7 7" />
      <path d="M16.5 8.5L9 16" />
      <path d="M9 16l-4 5h11l2-5z" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" />
      <rect x="13" y="4" width="7" height="7" />
      <rect x="4" y="13" width="7" height="7" />
      <rect x="13" y="13" width="7" height="7" />
    </>
  ),
  right: <path d="M9 18l6-6-6-6" />,
  expand: <path d="M9 6l6 6-6 6" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 8h10" />
      <path d="M18 8h2" />
      <path d="M4 16h4" />
      <path d="M12 16h8" />
      <circle cx="16" cy="8" r="2" />
      <circle cx="10" cy="16" r="2" />
    </>
  ),
  spark: (
    <>
      <path d="M13 2L5 14h6l-1 8 8-12h-6z" />
    </>
  )
}

export const Glyph = memo(function Glyph({
  name,
  size = 18
}: {
  name: string
  size?: number
}): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
    >
      {GLYPHS[name]}
    </svg>
  )
})

export const IconButton = memo(function IconButton({
  name,
  title,
  onClick,
  active,
  disabled,
  danger,
  small,
  badge
}: {
  name: string
  title: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
  danger?: boolean
  small?: boolean
  badge?: number
}): React.JSX.Element {
  const cls =
    'icon-btn' +
    (active ? ' on' : '') +
    (danger ? ' danger' : '') +
    (small ? ' small' : '') +
    (badge ? ' badged' : '')

  return (
    <button
      className={cls}
      title={title}
      aria-label={title}
      aria-pressed={active === undefined ? undefined : active}
      onClick={onClick}
      disabled={disabled}
      type="button"
    >
      <Glyph name={name} size={small ? 15 : 18} />
      {badge ? <span className="icon-badge">{badge > 99 ? '99+' : badge}</span> : null}
    </button>
  )
})
