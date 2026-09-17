import React, { useCallback, useEffect, useState } from 'react'
import type { AgentConfig, AgentState } from '../../../main/bridge/api-types'

const EMPTY_STATE: AgentState = {
  session: { signedIn: false, email: '', displayName: '', expiresAt: 0 },
  connected: false,
  device: null,
  capabilities: []
}

export default function ConnectionSection(): React.JSX.Element {
  const [state, setState] = useState<AgentState>(EMPTY_STATE)
  const [config, setConfig] = useState<AgentConfig | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState(false)

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

  const run = useCallback((action: () => Promise<{ ok: boolean; message: string }>): void => {
    setBusy(true)
    setNotice('')
    void action()
      .then((result) => {
        setFailed(!result.ok)
        setNotice(result.message)
      })
      .finally(() => setBusy(false))
  }, [])

  const onPatch = (patch: Partial<AgentConfig>): void => {
    setConfig((current) => (current ? { ...current, ...patch } : current))
  }

  return (
    <>
      <section className="sheet-block">
        <h3 className="sheet-label">Sunucu</h3>
        {config ? (
          <div className="set-form">
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
            <label className="set-check">
              <input
                type="checkbox"
                checked={config.autoConnect}
                onChange={(event) => onPatch({ autoConnect: event.target.checked })}
              />
              Acilista otomatik baglan
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const result = await window.aftApi.saveConfig(config)
                  return { ok: result.ok, message: result.ok ? 'Kaydedildi' : result.message }
                })
              }
            >
              Kaydet
            </button>
          </div>
        ) : (
          <p className="set-muted">Ayarlar yukleniyor</p>
        )}
      </section>

      <section className="sheet-block">
        <h3 className="sheet-label">Cihaz</h3>
        <p className={state.connected ? 'set-on' : 'set-muted'}>
          {state.connected ? 'Bagli' : 'Bagli degil'}
        </p>
        {state.device ? (
          <dl className="set-facts">
            <div>
              <dt>Makine</dt>
              <dd>{state.device.hostname}</dd>
            </div>
            <div>
              <dt>Isletim sistemi</dt>
              <dd>{state.device.os}</dd>
            </div>
            <div>
              <dt>Surum</dt>
              <dd>{state.device.appVersion}</dd>
            </div>
            <div>
              <dt>Bildirilen arac</dt>
              <dd>{state.capabilities.length}</dd>
            </div>
          </dl>
        ) : (
          <p className="set-muted">Cihaz kaydi yok</p>
        )}
        <div className="set-actions">
          <button
            type="button"
            disabled={busy || !state.session.signedIn || state.connected}
            onClick={() =>
              run(async () => {
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
              run(async () => {
                const result = await window.aftApi.disconnect()
                return { ok: result.ok, message: result.ok ? 'Baglanti kesildi' : result.message }
              })
            }
          >
            Kopar
          </button>
        </div>
      </section>

      {notice ? (
        <p className={failed ? 'set-notice bad' : 'set-notice'} role="status">
          {notice}
        </p>
      ) : null}
    </>
  )
}
