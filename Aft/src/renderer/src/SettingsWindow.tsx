import React, { useCallback, useEffect, useState } from 'react'
import type { AppPrefs } from '../../main/browser/types'
import { THEMES, isThemeId, paintTheme, readTheme, storeTheme, themeOf } from './themes'
import type { ThemeId } from './themes'
import { Glyph } from './icons'

const SHORTCUTS: { name: string; code: string }[] = [
  { name: 'Terminali aç / kapat', code: 'Ctrl + K' },
  { name: 'Adres çubuğuna geç', code: 'Ctrl + L' },
  { name: 'Tam ekran', code: 'F11' },
  { name: 'Komut geçmişi', code: '↑ / ↓' }
]

export default function SettingsWindow(): React.JSX.Element {
  const [theme, setTheme] = useState<ThemeId>(() => readTheme())
  const [autoTerm, setAutoTerm] = useState(true)
  const [autoBack, setAutoBack] = useState(false)

  useEffect(() => {
    paintTheme(theme)
    storeTheme(theme)
    window.aft.setChrome(themeOf(theme).chrome)
  }, [theme])

  useEffect(() => {
    return window.aft.onPrefs((value: AppPrefs) => {
      if (isThemeId(value.theme)) setTheme(value.theme)
      setAutoTerm(value.autoTerminal)
      setAutoBack(value.autoTerminalRestore)
    })
  }, [])

  const close = useCallback((): void => window.aft.setSettings(false), [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      close()
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const pickTheme = useCallback((id: ThemeId): void => {
    setTheme(id)
    window.aft.patchPrefs({ theme: id })
  }, [])

  const toggleAutoTerm = useCallback((next: boolean): void => {
    setAutoTerm(next)
    window.aft.patchPrefs({ autoTerminal: next })
  }, [])

  const toggleAutoBack = useCallback((next: boolean): void => {
    setAutoBack(next)
    window.aft.patchPrefs({ autoTerminalRestore: next })
  }, [])

  return (
    <div className="win">
      <header className="win-head">
        <span className="win-title">
          <Glyph name="settings" size={13} />
          AYARLAR
        </span>
        <span className="win-push" />
        <button
          className="ghost-btn win-close"
          title="Kapat"
          aria-label="Kapat"
          onClick={close}
          type="button"
        >
          <Glyph name="close" size={15} />
        </button>
      </header>

      <div className="win-body">
        <section className="sheet-block">
          <h3 className="sheet-label">Tema</h3>
          <div className="theme-grid">
            {THEMES.map((item) => (
              <button
                key={item.id}
                className={'theme-card' + (item.id === theme ? ' sel' : '')}
                onClick={() => pickTheme(item.id)}
                aria-pressed={item.id === theme}
                type="button"
              >
                <span className="theme-swatch">
                  {item.swatch.map((color) => (
                    <span key={color} style={{ background: color }} />
                  ))}
                </span>
                <span className="theme-name">{item.label}</span>
                <span className="theme-note">{item.note}</span>
                {item.id === theme ? (
                  <span className="theme-mark">
                    <Glyph name="check" size={12} />
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </section>

        <section className="sheet-block">
          <h3 className="sheet-label">Terminal</h3>
          <label className="opt-row">
            <input
              type="checkbox"
              checked={autoTerm}
              onChange={(event) => toggleAutoTerm(event.target.checked)}
            />
            <span className="opt-text">
              <span className="opt-name">Senaryo çalışınca terminali aç</span>
              <span className="opt-note">
                Oynatma başladığında terminal kendiliğinden açılır, koşum kayıtları anında görünür.
              </span>
            </span>
          </label>
          <label className={'opt-row' + (autoTerm ? '' : ' off')}>
            <input
              type="checkbox"
              checked={autoBack}
              disabled={!autoTerm}
              onChange={(event) => toggleAutoBack(event.target.checked)}
            />
            <span className="opt-text">
              <span className="opt-name">Koşum bitince terminali kapat</span>
              <span className="opt-note">
                Yalnızca terminali koşum açtıysa kapatılır, elle açılan terminal açık kalır.
              </span>
            </span>
          </label>
        </section>

        <section className="sheet-block">
          <h3 className="sheet-label">Kısayollar</h3>
          <div className="key-rows">
            {SHORTCUTS.map((item) => (
              <div key={item.code} className="key-row">
                <span className="key-name">{item.name}</span>
                <span className="key-code">{item.code}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
