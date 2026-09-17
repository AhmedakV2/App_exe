import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentChatState, AgentState, ApprovalRequest } from '../../../main/bridge/api-types'
import { Glyph } from '../icons'

const WRITE_TOOLS: Record<string, string> = {
  browser_command: 'Tarayıcıda bir eylem çalıştırılacak',
  scenario_draft_write: 'Senaryo taslağı kaydedilecek'
}

const SUGGESTIONS: string[] = [
  'Açık sayfadaki formu tarayıp adımları çıkar',
  'Son koşumda başarısız olan adımı analiz et',
  'Giriş akışı için yeni bir senaryo taslağı öner',
  'Kırılgan seçicileri listele ve iyileştirme öner'
]

const EMPTY_CHAT: AgentChatState = {
  sessionId: '',
  title: '',
  model: '',
  turns: [],
  busy: false,
  error: ''
}

export function AgentPanel(): React.JSX.Element {
  const [state, setState] = useState<AgentState | null>(null)
  const [chat, setChat] = useState<AgentChatState>(EMPTY_CHAT)
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState<ApprovalRequest | null>(null)
  const bottom = useRef<HTMLDivElement | null>(null)
  const input = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    void window.aftApi.state().then((result) => {
      if (result.ok && result.data) setState(result.data)
    })
    void window.aftApi.chat().then((result) => {
      if (result.ok && result.data) setChat(result.data)
    })

    const offState = window.aftApi.onStateChanged(setState)
    const offChat = window.aftApi.onChat(setChat)
    const offApproval = window.aftApi.onApproval(setPending)

    return () => {
      offState()
      offChat()
      offApproval()
    }
  }, [])

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat.turns])

  const decide = useCallback(
    (approved: boolean) => {
      if (!pending) return
      void window.aftApi.approve(pending.callId, approved)
      setPending(null)
    },
    [pending]
  )

  const connected = state?.connected === true
  const signedIn = state?.session.signedIn === true
  const empty = chat.turns.length === 0

  const send = useCallback(
    (text: string) => {
      const content = text.trim()
      if (!content || !connected || chat.busy) return
      setDraft('')
      void window.aftApi.ask(content)
    },
    [chat.busy, connected]
  )

  const submit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault()
      send(draft)
    },
    [draft, send]
  )

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== 'Enter' || event.shiftKey) return
      event.preventDefault()
      send(draft)
    },
    [draft, send]
  )

  const pick = useCallback((text: string) => {
    setDraft(text)
    input.current?.focus()
  }, [])

  const composer = (
    <form className="gem-composer" onSubmit={submit}>
      <div className="gem-field">
        <textarea
          ref={input}
          className="gem-input"
          value={draft}
          rows={1}
          disabled={!connected}
          placeholder={connected ? 'AFT ajanına sorun' : 'Bağlantı bekleniyor'}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
        />
        {chat.busy ? (
          <button
            className="gem-send stop"
            type="button"
            title="Durdur"
            aria-label="Durdur"
            onClick={() => void window.aftApi.cancelAsk()}
          >
            <Glyph name="square" size={16} />
          </button>
        ) : (
          <button
            className="gem-send"
            type="submit"
            title="Gönder"
            aria-label="Gönder"
            disabled={!connected || !draft.trim()}
          >
            <Glyph name="send" size={16} />
          </button>
        )}
      </div>
      <p className="gem-note">
        {connected
          ? chat.model
            ? 'Model ' + chat.model + ' · yanıt üretilirken diğer sekmeleri kullanabilirsiniz'
            : 'Yanıt üretilirken diğer sekmeleri kullanabilirsiniz'
          : signedIn
            ? 'Sunucuya bağlanılıyor'
            : 'Önce giriş yapın'}
      </p>
    </form>
  )

  return (
    <div className={'gem' + (empty ? ' is-empty' : '')}>
      <header className="gem-head">
        <span className="gem-title">{chat.title || 'AFT Ajanı'}</span>
        <span className={connected ? 'gem-dot on' : 'gem-dot'} />
        <span className="gem-meta">
          {connected ? (state?.capabilities.length ?? 0) + ' araç hazır' : 'Bağlı değil'}
        </span>
        <span className="gem-push" />
        <button
          className="ghost-btn"
          type="button"
          title="Yeni sohbet"
          aria-label="Yeni sohbet"
          disabled={chat.busy || empty}
          onClick={() => void window.aftApi.newChat()}
        >
          <Glyph name="plus" size={15} />
        </button>
        <button
          className="ghost-btn"
          type="button"
          title="Sohbeti sil"
          aria-label="Sohbeti sil"
          disabled={chat.busy || !chat.sessionId}
          onClick={() => void window.aftApi.removeChat()}
        >
          <Glyph name="trash" size={15} />
        </button>
      </header>

      {empty ? (
        <div className="gem-hero">
          <h1 className="gem-greeting">Merhaba</h1>
          <p className="gem-lead">Bugün hangi testi kurmak istersiniz?</p>
          {composer}
          <div className="gem-chips">
            {SUGGESTIONS.map((item) => (
              <button key={item} className="gem-chip" type="button" onClick={() => pick(item)}>
                {item}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="gem-thread">
            {chat.turns.map((item) => (
              <article key={item.id} className={'gem-turn ' + item.role}>
                <span className="gem-avatar">
                  <Glyph name={item.role === 'user' ? 'shield' : 'spark'} size={14} />
                </span>
                <div className={'gem-bubble' + (item.failed ? ' bad' : '')}>
                  {item.text}
                  {item.pending && !item.text ? <span className="gem-typing" /> : null}
                </div>
              </article>
            ))}
            <div ref={bottom} />
          </div>

          {chat.error ? (
            <p className="gem-error" role="alert">
              {chat.error}
            </p>
          ) : null}

          <div className="gem-foot">{composer}</div>
        </>
      )}

      {pending ? (
        <div className="gem-approval">
          <strong>{WRITE_TOOLS[pending.toolName] ?? 'Onay gerekiyor'}</strong>
          <pre className="gem-approval-body">{pending.summary}</pre>
          <div className="gem-approval-actions">
            <button type="button" className="gem-approve" onClick={() => decide(true)}>
              Onayla
            </button>
            <button type="button" onClick={() => decide(false)}>
              Reddet
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
