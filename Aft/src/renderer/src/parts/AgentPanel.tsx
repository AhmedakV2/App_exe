import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentState, ApprovalRequest } from '../../../main/bridge/api-types'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
}

const WRITE_TOOLS: Record<string, string> = {
  browser_command: 'Tarayicida bir eylem calistirilacak',
  scenario_draft_write: 'Senaryo taslagi kaydedilecek'
}

export function AgentPanel(): React.JSX.Element {
  const [state, setState] = useState<AgentState | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState<ApprovalRequest | null>(null)
  const bottom = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    void window.aftApi.state().then((result) => {
      if (result.ok && result.data) setState(result.data)
    })
    const offState = window.aftApi.onStateChanged(setState)
    const offApproval = window.aftApi.onApproval(setPending)
    return () => {
      offState()
      offApproval()
    }
  }, [])

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const decide = useCallback(
    (approved: boolean) => {
      if (!pending) return
      void window.aftApi.approve(pending.callId, approved)
      setPending(null)
    },
    [pending]
  )

  const send = useCallback(() => {
    const text = draft.trim()
    if (!text) return
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', text }])
    setDraft('')
  }, [draft])

  const connected = state?.connected === true
  const signedIn = state?.session.signedIn === true

  return (
    <div className="agent-panel">
      <header className="agent-head">
        <span className={connected ? 'status-on' : 'status-off'}>
          {connected ? 'Bagli' : signedIn ? 'Bagli degil' : 'Giris yapilmadi'}
        </span>
        {connected ? (
          <span className="muted">{state?.capabilities.length ?? 0} arac hazir</span>
        ) : null}
      </header>

      <div className="agent-log">
        {messages.length === 0 ? (
          <p className="muted">
            {connected
              ? 'Ne yapmak istediginizi yazin.'
              : 'AI paneli icin once giris yapin ve baglanin.'}
          </p>
        ) : (
          messages.map((message) => (
            <div key={message.id} className={'agent-line agent-' + message.role}>
              {message.text}
            </div>
          ))
        )}
        <div ref={bottom} />
      </div>

      {pending ? (
        <div className="agent-approval">
          <p>
            <strong>{WRITE_TOOLS[pending.toolName] ?? 'Onay gerekiyor'}</strong>
          </p>
          <pre className="agent-approval-body">{pending.summary}</pre>
          <div className="agent-approval-actions">
            <button type="button" onClick={() => decide(true)}>
              Onayla
            </button>
            <button type="button" onClick={() => decide(false)}>
              Reddet
            </button>
          </div>
        </div>
      ) : null}

      <form
        className="agent-input"
        onSubmit={(event) => {
          event.preventDefault()
          send()
        }}
      >
        <textarea
          value={draft}
          rows={2}
          disabled={!connected}
          placeholder={connected ? 'Mesajiniz' : 'Baglanti yok'}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              send()
            }
          }}
        />
        <button type="submit" disabled={!connected || !draft.trim()}>
          Gonder
        </button>
      </form>
    </div>
  )
}
