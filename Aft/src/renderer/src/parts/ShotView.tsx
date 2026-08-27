import React, { memo, useEffect, useRef } from 'react'
import { Glyph } from '../icons'

export default memo(function ShotView({
  data,
  onClose
}: {
  data: string
  onClose: () => void
}): React.JSX.Element {
  const closeRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    closeRef.current?.focus()
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

  return (
    <div
      className="shot-view"
      role="dialog"
      aria-modal="true"
      aria-label="Ekran görüntüsü"
      onClick={onClose}
    >
      <div className="shot-frame" onClick={(event) => event.stopPropagation()}>
        <button
          ref={closeRef}
          className="shot-close"
          title="Kapat"
          aria-label="Kapat"
          onClick={onClose}
          type="button"
        >
          <Glyph name="close" size={16} />
        </button>
        <img className="shot-img" src={'data:image/png;base64,' + data} alt="Ekran görüntüsü" />
      </div>
    </div>
  )
})
