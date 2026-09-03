import React, { memo, useEffect, useRef } from 'react'
import type { ScanLevel } from '../../../main/discovery'
import type { ScenarioDefaults } from '../../../main/scenario/types'
import { Glyph } from '../icons'
import { Field, TextButton, Toggle } from '../ui'

const LEVELS: ScanLevel[] = [0, 1, 2, 3]

export default memo(function DefaultsSheet({
  title,
  defaults,
  disabled,
  onPatch,
  onClose
}: {
  title: string
  defaults: ScenarioDefaults
  disabled: boolean
  onPatch: (change: Partial<ScenarioDefaults>) => void
  onClose: () => void
}): React.JSX.Element {
  const frameRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    frameRef.current?.focus()
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
      className="sheet"
      role="dialog"
      aria-modal="true"
      aria-label="Senaryo varsayılanları"
      onClick={onClose}
    >
      <div
        ref={frameRef}
        className="sheet-frame narrow"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="sheet-head">
          <span className="sheet-title">
            <Glyph name="sliders" size={15} />
            {title}
          </span>
          <span className="sheet-push" />
          <button className="shot-btn" title="Kapat" onClick={onClose} type="button">
            <Glyph name="close" size={14} />
          </button>
        </header>

        <div className="sheet-body">
          <div className="grid-2">
            <Field label="Tarama seviyesi">
              <select
                value={defaults.scanLevel}
                disabled={disabled}
                onChange={(event) =>
                  onPatch({ scanLevel: Number(event.target.value) as ScanLevel })
                }
              >
                {LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Adım zaman aşımı">
              <input
                type="number"
                value={defaults.stepTimeoutMs}
                disabled={disabled}
                onChange={(event) => onPatch({ stepTimeoutMs: Number(event.target.value) || 0 })}
              />
            </Field>
          </div>

          <Field label="Deneme sayısı">
            <input
              type="number"
              value={defaults.retries}
              disabled={disabled}
              onChange={(event) => onPatch({ retries: Number(event.target.value) || 0 })}
            />
          </Field>

          <Toggle
            label="İlk hatada dur"
            checked={defaults.stopOnFailure}
            disabled={disabled}
            onChange={(next) => onPatch({ stopOnFailure: next })}
          />
          <Toggle
            label="Sayfa durumunu doğrula"
            checked={defaults.verifyState}
            disabled={disabled}
            onChange={(next) => onPatch({ verifyState: next })}
          />
          <Toggle
            label="Düşük güvene izin ver"
            checked={defaults.allowLowConfidence}
            disabled={disabled}
            onChange={(next) => onPatch({ allowLowConfidence: next })}
          />

          <div className="sheet-foot">
            <TextButton glyph="check" label="Kapat" onClick={onClose} tone="primary" />
          </div>
        </div>
      </div>
    </div>
  )
})
