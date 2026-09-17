import React, { useCallback, useEffect, useState } from 'react'

type Phase = 'checking' | 'auth' | 'loading'
type Mode = 'login' | 'register'

const MIN_PASSWORD = 12

export default function Gate(): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('checking')
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [serverOpen, setServerOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const enter = useCallback((): void => {
    setPhase('loading')
    window.aftApi.gateDone()
  }, [])

  useEffect(() => {
    let active = true

    const check = async (): Promise<void> => {
      const [current, settings] = await Promise.all([window.aftApi.state(), window.aftApi.config()])
      if (!active) return
      if (settings.ok && settings.data) setBaseUrl(settings.data.config.baseUrl)
      if (current.ok && current.data?.session.signedIn) enter()
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

      if (mode === 'register' && password.length < MIN_PASSWORD) {
        setError('Parola en az ' + MIN_PASSWORD + ' karakter olmali')
        return
      }

      setBusy(true)
      const target = baseUrl.trim().replace(/\/+$/, '')
      if (target.length === 0) {
        setBusy(false)
        setError('Sunucu adresi bos olamaz')
        return
      }
      await window.aftApi.saveConfig({ baseUrl: target })

      const result =
        mode === 'login'
          ? await window.aftApi.login({ email: email.trim(), password })
          : await window.aftApi.register({
              email: email.trim(),
              password,
              displayName: displayName.trim()
            })
      setBusy(false)
      setPassword('')

      if (result.ok) enter()
      else setError(result.message)
    },
    [mode, email, password, displayName, baseUrl, enter]
  )

  const swap = (next: Mode) => (): void => {
    setMode(next)
    setError('')
  }

  return (
    <div className="gate">
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
            <span>E-posta</span>
            <input
              type="email"
              value={email}
              autoComplete="username"
              required
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className="gate-field">
            <span>Parola</span>
            <input
              type="password"
              value={password}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={mode === 'register' ? MIN_PASSWORD : undefined}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error ? (
            <p className="gate-error" role="alert">
              {error}
            </p>
          ) : null}

          <button className="gate-submit" type="submit" disabled={busy}>
            {busy ? 'Lutfen bekleyin' : mode === 'login' ? 'Giris yap' : 'Hesap olustur'}
          </button>

          <button
            className="gate-link"
            type="button"
            onClick={() => setServerOpen((open) => !open)}
          >
            {serverOpen ? 'Sunucu adresini gizle' : 'Sunucu adresi'}
          </button>

          {serverOpen ? (
            <label className="gate-field">
              <span>Sunucu adresi</span>
              <input
                type="text"
                value={baseUrl}
                spellCheck={false}
                placeholder="http://10.6.100.134:8092"
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </label>
          ) : null}
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
