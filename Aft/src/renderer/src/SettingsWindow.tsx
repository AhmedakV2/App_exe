import React, { useCallback, useEffect, useState } from 'react'
import type { AppPrefs } from '../../main/browser/types'
import { THEMES, isThemeId, paintTheme, readTheme, storeTheme, themeOf } from './themes'
import type { ThemeId } from './themes'
import { Glyph } from './icons'

const SHORTCUTS: { name: string; code: string }[] = [
  { name: 'Terminal', code: 'Ctrl + K' },
  { name: 'Adres çubuğu', code: 'Ctrl + L' },
  { name: 'Sayfayı incele', code: 'F12' },
  { name: 'Tam ekran', code: 'F11' },
  { name: 'Kayıtta imleç adımları', code: 'Ctrl + H' },
  { name: 'Komut geçmişi', code: '↑ / ↓' }
]

export default function SettingsWindow(): React.JSX.Element {
  const [theme, setTheme] = useState<ThemeId>(() => readTheme())
  const [autoTerm, setAutoTerm] = useState(true)
  const [autoBack, setAutoBack] = useState(false)
  const [shotOnFail, setShotOnFail] = useState(true)
  const [stopOnFail, setStopOnFail] = useState(true)
  const [verifyState, setVerifyState] = useState(true)

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
      setShotOnFail(value.screenshotOnFailure)
      setStopOnFail(value.stopOnFailure)
      setVerifyState(value.verifyState)
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

  const toggleShot = useCallback((next: boolean): void => {
    setShotOnFail(next)
    window.aft.patchPrefs({ screenshotOnFailure: next })
  }, [])

  const toggleStop = useCallback((next: boolean): void => {
    setStopOnFail(next)
    window.aft.patchPrefs({ stopOnFailure: next })
  }, [])

  const toggleVerify = useCallback((next: boolean): void => {
    setVerifyState(next)
    window.aft.patchPrefs({ verifyState: next })
  }, [])

  return (
    <div className="win">
      <header className="win-head">
        <span className="win-title">
          <Glyph name="settings" size={13} />
          Ayarlar
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
              <span className="opt-name">Koşumda terminali aç</span>
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
              <span className="opt-name">Koşum bitince kapat</span>
            </span>
          </label>
        </section>

        <section className="sheet-block">
          <h3 className="sheet-label">Oynatma</h3>
          <label className="opt-row">
            <input
              type="checkbox"
              checked={shotOnFail}
              onChange={(event) => toggleShot(event.target.checked)}
            />
            <span className="opt-text">
              <span className="opt-name">Hatada ekran görüntüsü al</span>
            </span>
          </label>
          <label className="opt-row">
            <input
              type="checkbox"
              checked={stopOnFail}
              onChange={(event) => toggleStop(event.target.checked)}
            />
            <span className="opt-text">
              <span className="opt-name">İlk hatada dur</span>
            </span>
          </label>
          <label className="opt-row">
            <input
              type="checkbox"
              checked={verifyState}
              onChange={(event) => toggleVerify(event.target.checked)}
            />
            <span className="opt-text">
              <span className="opt-name">Sayfa durumunu doğrula</span>
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
