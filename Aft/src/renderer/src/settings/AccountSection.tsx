import React, { useCallback, useEffect, useState } from 'react'
import type { AgentState } from '../../../main/bridge/api-types'
import type { Profile } from '../../../main/api/types'
import PasswordField from '../parts/PasswordField'

const MIN_PASSWORD = 12

const EMPTY_STATE: AgentState = {
  session: { signedIn: false, username: '', email: '', displayName: '', expiresAt: 0 },
  connected: false,
  orgId: '',
  error: '',
  device: null,
  capabilities: []
}

function formatExpiry(at: number): string {
  if (!at) return '-'
  const stamp = new Date(at)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return (
    pad(stamp.getDate()) +
    '.' +
    pad(stamp.getMonth() + 1) +
    '.' +
    stamp.getFullYear() +
    ' ' +
    pad(stamp.getHours()) +
    ':' +
    pad(stamp.getMinutes())
  )
}

export default function AccountSection(): React.JSX.Element {
  const [state, setState] = useState<AgentState>(EMPTY_STATE)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [repeatPassword, setRepeatPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState(false)

  const loadProfile = useCallback(async (signedIn: boolean): Promise<void> => {
    if (!signedIn) {
      setProfile(null)
      return
    }
    const result = await window.aftApi.profile()
    if (result.ok && result.data) setProfile(result.data.profile)
  }, [])

  useEffect(() => {
    let active = true

    const load = async (): Promise<void> => {
      const current = await window.aftApi.state()
      if (!active || !current.ok || !current.data) return
      setState(current.data)
      await loadProfile(current.data.session.signedIn)
    }

    void load()
    const off = window.aftApi.onStateChanged((next) => {
      if (!active) return
      setState(next)
      void loadProfile(next.session.signedIn)
    })

    return () => {
      active = false
      off()
    }
  }, [loadProfile])

  const onLogout = useCallback((): void => {
    setBusy(true)
    void window.aftApi.logout().then((result) => {
      if (result.ok) {
        window.aftApi.quit()
        return
      }
      setBusy(false)
      setFailed(true)
      setNotice(result.message)
    })
  }, [])

  const onChangePassword = useCallback(
    (event: React.FormEvent): void => {
      event.preventDefault()
      setNotice('')

      if (newPassword.length < MIN_PASSWORD) {
        setFailed(true)
        setNotice('Yeni parola en az ' + MIN_PASSWORD + ' karakter olmali')
        return
      }
      if (newPassword !== repeatPassword) {
        setFailed(true)
        setNotice('Yeni parolalar eslesmiyor')
        return
      }

      setBusy(true)
      void window.aftApi
        .changePassword({ currentPassword, newPassword })
        .then((result) => {
          setFailed(!result.ok)
          setNotice(result.ok ? 'Parola degistirildi' : result.message)
          if (result.ok) {
            setCurrentPassword('')
            setNewPassword('')
            setRepeatPassword('')
          }
        })
        .finally(() => setBusy(false))
    },
    [currentPassword, newPassword, repeatPassword]
  )

  if (!state.session.signedIn) {
    return (
      <section className="sheet-block">
        <h3 className="sheet-label">Hesap</h3>
        <p className="set-muted">Oturum kapali.</p>
      </section>
    )
  }

  return (
    <>
      <section className="sheet-block">
        <h3 className="sheet-label">Hesap</h3>
        <div className="set-identity">
          <span className="set-avatar">
            {(state.session.displayName || state.session.username).slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>{state.session.displayName || state.session.username}</strong>
            <span className="set-muted">{state.session.email}</span>
          </div>
        </div>

        <dl className="set-facts">
          <div>
            <dt>Kullanici adi</dt>
            <dd>{state.session.username || profile?.username || '-'}</dd>
          </div>
          <div>
            <dt>Roller</dt>
            <dd>{profile?.roles.length ? profile.roles.join(', ') : '-'}</dd>
          </div>
          <div>
            <dt>Organizasyonlar</dt>
            <dd>
              {profile?.organizations.length
                ? profile.organizations.map((org) => org.name).join(', ')
                : 'Uyelik yok'}
            </dd>
          </div>
          <div>
            <dt>Dil</dt>
            <dd>{profile?.locale ?? '-'}</dd>
          </div>
          <div>
            <dt>Iki adimli dogrulama</dt>
            <dd>{profile?.mfaEnabled ? 'Acik' : 'Kapali'}</dd>
          </div>
          <div>
            <dt>Oturum bitisi</dt>
            <dd>{formatExpiry(state.session.expiresAt)}</dd>
          </div>
        </dl>
      </section>

      <section className="sheet-block">
        <h3 className="sheet-label">Parola</h3>
        <form className="set-form" onSubmit={onChangePassword}>
          <PasswordField
            label="Mevcut parola"
            value={currentPassword}
            autoComplete="current-password"
            required
            onChange={setCurrentPassword}
          />
          <PasswordField
            label="Yeni parola"
            value={newPassword}
            autoComplete="new-password"
            minLength={MIN_PASSWORD}
            required
            onChange={setNewPassword}
          />
          <PasswordField
            label="Yeni parola tekrar"
            value={repeatPassword}
            autoComplete="new-password"
            minLength={MIN_PASSWORD}
            required
            onChange={setRepeatPassword}
          />
          <button type="submit" disabled={busy}>
            Parolayi degistir
          </button>
        </form>
      </section>

      <section className="sheet-block">
        <h3 className="sheet-label">Oturum</h3>
        <p className="set-muted">Cikis yapildiginda uygulama kapanir.</p>
        <button type="button" className="set-danger" disabled={busy} onClick={onLogout}>
          Cikis yap
        </button>
      </section>

      {notice ? (
        <p className={failed ? 'set-notice bad' : 'set-notice'} role="status">
          {notice}
        </p>
      ) : null}
    </>
  )
}
