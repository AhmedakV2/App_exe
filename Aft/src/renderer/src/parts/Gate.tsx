import React, { useCallback, useEffect, useState } from 'react'
import PasswordField from './PasswordField'

type Phase = 'checking' | 'auth' | 'loading'
type Mode = 'login' | 'register'

const MIN_PASSWORD = 12
const MIN_USERNAME = 3
const USERNAME_PATTERN = /^[A-Za-z0-9._-]+$/

export default function Gate(): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('checking')
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const enter = useCallback((): void => {
    setPhase('loading')
    window.aftApi.gateDone()
  }, [])

  useEffect(() => {
    let active = true

    const check = async (): Promise<void> => {
      const result = await window.aftApi.state()
      if (!active) return
      if (result.ok && result.data?.session.signedIn) enter()
      else setPhase('auth')
    }

    void check()

    return () => {
      active = false
    }
  }, [enter])

  const submit = useCallback(
    async (event: React.FormEvent): Promise<void> => {
      event.preventDefault()
      setError('')

      const account = username.trim()
      if (account.length < MIN_USERNAME || !USERNAME_PATTERN.test(account)) {
        setError('Kullanici adi en az 3 karakter olmali ve yalnizca harf, rakam, nokta, alt tire')
        return
      }
      if (mode === 'register' && password.length < MIN_PASSWORD) {
        setError('Parola en az ' + MIN_PASSWORD + ' karakter olmali')
        return
      }

      setBusy(true)
      const result =
        mode === 'login'
          ? await window.aftApi.login({ username: account, password })
          : await window.aftApi.register({
              username: account,
              email: email.trim(),
              password,
              displayName: displayName.trim()
            })
      setBusy(false)
      setPassword('')

      if (result.ok) enter()
      else setError(result.message)
    },
    [mode, username, email, password, displayName, enter]
  )

  const swap = (next: Mode) => (): void => {
    setMode(next)
    setError('')
  }

  return (
    <div className="gate">
      <button
        className="gate-close"
        type="button"
        title="Kapat"
        aria-label="Kapat"
        onClick={() => window.aftApi.quit()}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M6 6 L18 18 M18 6 L6 18"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>

      <div className="gate-head">
        <svg
          className="gate-logo"
          width="72"
          height="72"
          viewBox="0 0 512 512"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M212 60 L300 60 L458 428 L352 428 L258 188 L182 348 L250 348 L296 398 L258 398 L222 428 L54 428 Z" />
        </svg>
        <span className="gate-title">AFT</span>
      </div>

      {phase === 'auth' ? (
        <form className="gate-body" onSubmit={submit}>
          <div className="gate-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className={mode === 'login' ? 'gate-tab is-on' : 'gate-tab'}
              onClick={swap('login')}
            >
              Giris yap
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              className={mode === 'register' ? 'gate-tab is-on' : 'gate-tab'}
              onClick={swap('register')}
            >
              Kaydol
            </button>
          </div>

          {mode === 'register' ? (
            <label className="gate-field">
              <span>Ad soyad</span>
              <input
                type="text"
                value={displayName}
                autoComplete="name"
                required
                maxLength={120}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </label>
          ) : null}

          <label className="gate-field">
            <span>Kullanici adi</span>
            <input
              type="text"
              value={username}
              autoComplete="username"
              spellCheck={false}
              required
              minLength={MIN_USERNAME}
              maxLength={64}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>

          {mode === 'register' ? (
            <label className="gate-field">
              <span>E-posta</span>
              <input
                type="email"
                value={email}
                autoComplete="email"
                required
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          ) : null}

          <PasswordField
            label="Parola"
            value={password}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={mode === 'register' ? MIN_PASSWORD : undefined}
            required
            onChange={setPassword}
          />

          {error ? (
            <p className="gate-error" role="alert">
              {error}
            </p>
          ) : null}

          <button className="gate-submit" type="submit" disabled={busy}>
            {busy ? 'Lutfen bekleyin' : mode === 'login' ? 'Giris yap' : 'Hesap olustur'}
          </button>
        </form>
      ) : (
        <div className="gate-body gate-wait" role="status" aria-label="Yukleniyor">
          <span className="splash-track">
            <span className="splash-fill" />
          </span>
        </div>
      )}
    </div>
  )
}
