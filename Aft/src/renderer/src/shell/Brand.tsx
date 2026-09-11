import React, { memo } from 'react'

const Brand = memo(function Brand(): React.JSX.Element {
  return (
    <span className="brand" title="AFT">
      <svg width="18" height="18" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
        <path d="M212 60 L300 60 L458 428 L352 428 L258 188 L182 348 L250 348 L296 398 L258 398 L222 428 L54 428 Z" />
      </svg>
    </span>
  )
})

export default Brand
