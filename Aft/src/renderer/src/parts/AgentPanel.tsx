import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentChatState, AgentState, ApprovalRequest } from '../../../main/bridge/api-types'
import { Glyph } from '../icons'
import { formatClock } from '../format'
import ChatBlocks, { CopyButton } from './ChatBlocks'

const WRITE_TOOLS: Record<string, string> = {
  browser_command: 'Tarayıcıda bir eylem çalıştırılacak',
  scenario_draft_write: 'Senaryo taslağı kaydedilecek'
}

const SUGGESTIONS: { title: string; detail: string; glyph: string }[] = [
  {
    title: 'Sayfayı tara',
    detail: 'Açık sayfadaki formu tarayıp test adımlarını çıkar',
    glyph: 'radar'
  },
  {
    title: 'Hatayı çöz',
    detail: 'Son koşumda başarısız olan adımı analiz et',
    glyph: 'alert'
  },
  {
    title: 'Senaryo öner',
    detail: 'Giriş akışı için yeni bir senaryo taslağı hazırla',
    glyph: 'library'
  },
  {
    title: 'Kırılganları bul',
    detail: 'Zayıf seçicileri listele ve iyileştirme öner',
    glyph: 'pulse'
  }
]

const EMPTY_CHAT: AgentChatState = {
  sessionId: '',
  title: '',
  model: '',
  turns: [],
  busy: false,
  error: ''
}

const NEAR_BOTTOM = 80

export function AgentPanel(): React.JSX.Element {
  const [state, setState] = useState<AgentState | null>(null)
  const [chat, setChat] = useState<AgentChatState>(EMPTY_CHAT)
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState<ApprovalRequest | null>(null)
  const [pinned, setPinned] = useState(true)
  const [linking, setLinking] = useState(false)
  const [linkError, setLinkError] = useState('')

  const threadRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

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
    if (!pinned) return
    const thread = threadRef.current
    if (thread) thread.scrollTop = thread.scrollHeight
  }, [chat.turns, pinned])

  const onThreadScroll = useCallback((): void => {
    const thread = threadRef.current
    if (!thread) return
    setPinned(thread.scrollHeight - thread.scrollTop - thread.clientHeight <= NEAR_BOTTOM)
  }, [])

  const toBottom = useCallback((): void => {
    const thread = threadRef.current
    if (!thread) return
    thread.scrollTo({ top: thread.scrollHeight, behavior: 'smooth' })
    setPinned(true)
  }, [])

  const decide = useCallback(
    (approved: boolean): void => {
      if (!pending) return
      void window.aftApi.approve(pending.callId, approved)
      setPending(null)
    },
    [pending]
  )

  const connected = state?.connected === true
  const signedIn = state?.session.signedIn === true
  const empty = chat.turns.length === 0
  const ready = connected && !chat.busy

  const reconnect = useCallback((): void => {
    setLinking(true)
    setLinkError('')
    void window.aftApi
      .connect()
      .then((result) => setLinkError(result.ok ? '' : result.message))
      .finally(() => setLinking(false))
  }, [])

  const linkNote = linkError || state?.error || ''

  const send = useCallback(
    (text: string): void => {
      const content = text.trim()
      if (!content || !ready) return
      setDraft('')
      setPinned(true)
      void window.aftApi.ask(content)
    },
    [ready]
  )

  const submit = useCallback(
    (event: React.FormEvent): void => {
      event.preventDefault()
      send(draft)
    },
    [draft, send]
  )

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
      if (event.key !== 'Enter' || event.shiftKey) return
      event.preventDefault()
      send(draft)
    },
    [draft, send]
  )

  const pick = useCallback((text: string): void => {
    setDraft(text)
    inputRef.current?.focus()
  }, [])

  const composer = (
    <form className="chat-composer" onSubmit={submit}>
      <div className="chat-field">
        <textarea
          ref={inputRef}
          className="chat-input"
          value={draft}
          rows={1}
          disabled={!connected}
          placeholder={connected ? 'AFT ajanına bir şey sorun' : 'Bağlantı bekleniyor'}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
        />
        {chat.busy ? (
          <button
            className="chat-send stop"
            type="button"
            title="Üretimi durdur"
            aria-label="Üretimi durdur"
            onClick={() => void window.aftApi.cancelAsk()}
          >
            <Glyph name="square" size={15} />
          </button>
        ) : (
          <button
            className="chat-send"
            type="submit"
            title="Gönder"
            aria-label="Gönder"
            disabled={!ready || !draft.trim()}
          >
            <Glyph name="send" size={15} />
          </button>
        )}
      </div>
      <p className="chat-hint">
        <kbd>Enter</kbd> gönderir · <kbd>Shift</kbd>+<kbd>Enter</kbd> satır ekler
        {chat.model ? ' · ' + chat.model : ''}
      </p>
    </form>
  )

  return (
    <div className="chat">
      <header className="chat-head">
        <span className="chat-title">{chat.title || 'AFT Ajanı'}</span>
        <span className={connected ? 'chat-dot on' : 'chat-dot'} />
        <span className="chat-meta">
          {connected ? (state?.capabilities.length ?? 0) + ' araç hazır' : 'Bağlı değil'}
        </span>
        <span className="chat-push" />
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

      {!connected ? (
        <div className="chat-banner" role="status">
          <Glyph name="cloud" size={14} />
          <span className="chat-banner-text">
            <strong>
              {signedIn ? 'Ajan sunucusuna bağlanılamadı.' : 'Ajanı kullanmak için giriş yapın.'}
            </strong>
            {linkNote ? <span className="chat-banner-why">{linkNote}</span> : null}
          </span>
          {signedIn ? (
            <button type="button" onClick={reconnect} disabled={linking}>
              {linking ? 'Bağlanıyor' : 'Tekrar dene'}
            </button>
          ) : null}
        </div>
      ) : null}

      {empty ? (
        <div className="chat-hero">
          <div className="chat-hero-top">
            <h1 className="chat-greeting">Merhaba</h1>
            <p className="chat-lead">Bugün hangi testi kurmak istersiniz?</p>
          </div>

          <div className="chat-hero-mid">{composer}</div>

          <div className="chat-hero-bottom">
            <div className="chat-cards">
              {SUGGESTIONS.map((item) => (
                <button
                  key={item.title}
                  className="chat-card"
                  type="button"
                  onClick={() => pick(item.detail)}
                >
                  <Glyph name={item.glyph} size={16} />
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="chat-thread" ref={threadRef} onScroll={onThreadScroll}>
            {chat.turns.map((item) => (
              <article key={item.id} className={'chat-turn ' + item.role}>
                <span className="chat-avatar">
                  <Glyph name={item.role === 'user' ? 'shield' : 'spark'} size={14} />
                </span>
                <div className="chat-body">
                  <div className="chat-byline">
                    <span>{item.role === 'user' ? 'Siz' : 'Ajan'}</span>
                    <span className="chat-time">{formatClock(item.at)}</span>
                    {item.role === 'assistant' && item.text && !item.pending ? (
                      <CopyButton value={item.text} label="Yanıtı kopyala" />
                    ) : null}
                  </div>
                  <div className={'chat-bubble' + (item.failed ? ' bad' : '')}>
                    {item.text ? <ChatBlocks text={item.text} /> : null}
                    {item.pending && !item.text ? (
                      <span className="chat-typing">
                        <i />
                        <i />
                        <i />
                      </span>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>

          {!pinned ? (
            <button
              className="chat-jump"
              type="button"
              title="En alta git"
              aria-label="En alta git"
              onClick={toBottom}
            >
              <Glyph name="down" size={15} />
            </button>
          ) : null}

          {chat.error ? (
            <p className="chat-error" role="alert">
              <Glyph name="alert" size={13} />
              {chat.error}
            </p>
          ) : null}

          <div className="chat-foot">{composer}</div>
        </>
      )}

      {pending ? (
        <div className="chat-approval">
          <div className="chat-approval-head">
            <Glyph name="shield" size={14} />
            <strong>{WRITE_TOOLS[pending.toolName] ?? 'Onay gerekiyor'}</strong>
          </div>
          <pre className="chat-approval-body">{pending.summary}</pre>
          <div className="chat-approval-actions">
            <button type="button" className="chat-approve" onClick={() => decide(true)}>
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
