import React from 'react'

export default function Splash(): React.JSX.Element {
  return (
    <div className="splash" role="status" aria-label="Yükleniyor">
      <svg
        className="splash-logo"
        width="116"
        height="116"
        viewBox="0 0 512 512"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M212 60 L300 60 L458 428 L352 428 L258 188 L182 348 L250 348 L296 398 L258 398 L222 428 L54 428 Z" />
      </svg>

      <span className="splash-track">
        <span className="splash-fill" />
      </span>
    </div>
  )
}
