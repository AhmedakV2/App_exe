import { useCallback, useEffect, useState } from 'react'
import type { AgentConfig, AgentState } from '../../../main/bridge/api-types'

const EMPTY_STATE: AgentState = {
  session: { signedIn: false, email: '', displayName: '', expiresAt: 0 },
  connected: false,
  device: null,
  capabilities: []
}

export function AccountPage(): React.JSX.Element {
  const [state, setState] = useState<AgentState>(EMPTY_STATE)
  const [config, setConfig] = useState<AgentConfig | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async () => {
    const result = await window.aftApi.state()
    if (result.ok && result.data) setState(result.data)
  }, [])

  useEffect(() => {
    let active = true

    const load = async (): Promise<void> => {
      const [current, settings] = await Promise.all([window.aftApi.state(), window.aftApi.config()])
      if (!active) return
      if (current.ok && current.data) setState(current.data)
      if (settings.ok && settings.data) setConfig(settings.data.config)
    }

    void load()
    const off = window.aftApi.onStateChanged((next) => {
      if (active) setState(next)
    })

    return () => {
      active = false
      off()
    }
  }, [])

  const run = useCallback(
    async (action: () => Promise<{ ok: boolean; message: string }>) => {
      setBusy(true)
      setNotice('')
      const result = await action()
      setNotice(result.message)
      setBusy(false)
      await refresh()
    },
    [refresh]
  )

  const onLogin = (): void => {
    void run(async () => {
      const result = await window.aftApi.login({ email, password })
      setPassword('')
      return { ok: result.ok, message: result.ok ? 'Giris yapildi' : result.message }
    })
  }

  const onPatch = (patch: Partial<AgentConfig>): void => {
    setConfig((current) => (current ? { ...current, ...patch } : current))
  }

  const onSaveConfig = (): void => {
    if (!config) return
    void run(async () => {
      const result = await window.aftApi.saveConfig(config)
      return { ok: result.ok, message: result.ok ? 'Ayarlar kaydedildi' : result.message }
    })
  }

  return (
    <div className="account-page">
      <section className="account-block">
        <h2>Hesap</h2>
        {state.session.signedIn ? (
          <div className="account-summary">
            <p>
              <strong>{state.session.displayName || state.session.email}</strong>
            </p>
            <p className="muted">{state.session.email}</p>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = await window.aftApi.logout()
                  return { ok: result.ok, message: result.ok ? 'Cikis yapildi' : result.message }
                })
              }
            >
              Cikis yap
            </button>
          </div>
        ) : (
          <form
            className="account-form"
            onSubmit={(event) => {
              event.preventDefault()
              onLogin()
            }}
          >
            <label>
              E-posta
              <input
                type="email"
                value={email}
                autoComplete="username"
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label>
              Parola
              <input
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <button type="submit" disabled={busy || !email || !password}>
              Giris yap
            </button>
          </form>
        )}
      </section>

      <section className="account-block">
        <h2>Sunucu</h2>
        {config ? (
          <div className="account-form">
            <label>
              Sunucu adresi
              <input
                type="url"
                value={config.baseUrl}
                onChange={(event) => onPatch({ baseUrl: event.target.value })}
              />
            </label>
            <label>
              Cihaz anahtari
              <input
                type="password"
                value={config.deviceKey}
                placeholder="aft_..."
                onChange={(event) => onPatch({ deviceKey: event.target.value })}
              />
            </label>
            <label className="account-check">
              <input
                type="checkbox"
                checked={config.autoConnect}
                onChange={(event) => onPatch({ autoConnect: event.target.checked })}
              />
              Acilista otomatik baglan
            </label>
            <button type="button" disabled={busy} onClick={onSaveConfig}>
              Kaydet
            </button>
          </div>
        ) : (
          <p className="muted">Ayarlar yukleniyor</p>
        )}
      </section>

      <section className="account-block">
        <h2>Cihaz</h2>
        <p className={state.connected ? 'status-on' : 'status-off'}>
          {state.connected ? 'Bagli' : 'Bagli degil'}
        </p>
        {state.device ? (
          <ul className="muted">
            <li>{state.device.hostname}</li>
            <li>{state.device.os}</li>
            <li>Surum {state.device.appVersion}</li>
            <li>{state.capabilities.length} arac bildirildi</li>
          </ul>
        ) : (
          <p className="muted">Cihaz kaydi yok</p>
        )}
        <div className="account-actions">
          <button
            type="button"
            disabled={busy || !state.session.signedIn || state.connected}
            onClick={() =>
              void run(async () => {
                const result = await window.aftApi.connect()
                return { ok: result.ok, message: result.ok ? 'Baglanildi' : result.message }
              })
            }
          >
            Baglan
          </button>
          <button
            type="button"
            disabled={busy || !state.connected}
            onClick={() =>
              void run(async () => {
                const result = await window.aftApi.disconnect()
                return { ok: result.ok, message: result.ok ? 'Baglanti kesildi' : result.message }
              })
            }
          >
            Kopar
          </button>
        </div>
      </section>

      {notice ? <p className="account-notice">{notice}</p> : null}
    </div>
  )
}
