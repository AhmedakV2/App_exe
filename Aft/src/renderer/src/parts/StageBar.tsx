import React, { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { AgentAction, BrowserState, NavKind } from '../../../main/browser/types'
import { IconButton } from '../icons'
import { shortUrl, toUrl } from '../format'
import { isHomeUrl } from '../../../main/home/search'

export default memo(function StageBar({
  state,
  visionCount,
  urlSeed,
  onNav,
  onAction,
  onVision
}: {
  state: BrowserState
  visionCount: number
  urlSeed: number
  onNav: (kind: NavKind) => void
  onAction: (action: AgentAction) => void
  onVision: () => void
}): React.JSX.Element {
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!urlSeed) return
    inputRef.current?.focus()
  }, [urlSeed])

  const onFocus = useCallback((): void => {
    setFocused(true)
    setDraft(isHomeUrl(state.url) ? '' : state.url)
    requestAnimationFrame(() => inputRef.current?.select())
  }, [state.url])

  const onBlur = useCallback((): void => {
    setFocused(false)
    setDraft('')
  }, [])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        inputRef.current?.blur()
        return
      }

      if (event.key !== 'Enter') return
      event.preventDefault()

      const url = toUrl(draft)
      if (!url) return

      inputRef.current?.blur()
      onAction({ action: 'go_to_url', url })
    },
    [draft, onAction]
  )

  return (
    <div className="stage-bar">
      <div className="stage-nav">
        <IconButton
          name="back"
          title="Geri"
          onClick={() => onNav('back')}
          disabled={!state.canGoBack}
          small
        />
        <IconButton
          name="forward"
          title="İleri"
          onClick={() => onNav('forward')}
          disabled={!state.canGoForward}
          small
        />
        <IconButton
          name={state.loading ? 'stop' : 'reload'}
          title={state.loading ? 'Durdur' : 'Yenile'}
          onClick={() => onNav(state.loading ? 'stop' : 'reload')}
          small
        />
        <IconButton name="home" title="Ana sayfa" onClick={() => onNav('home')} small />
      </div>

      <span className="stage-sep" />

      <div className={'omnibox' + (focused ? ' focused' : '')}>
        <input
          ref={inputRef}
          className="omni-input"
          value={focused ? draft : shortUrl(state.url)}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          placeholder="Adres"
          spellCheck={false}
          aria-label="Adres çubuğu"
        />
        {state.loading ? <span className="omni-load" /> : null}
      </div>

      <span className="stage-sep" />

      <div className="stage-nav">
        <IconButton
          name={state.vision ? 'eye' : 'eyeOff'}
          title="Görüş"
          onClick={onVision}
          active={state.vision}
          badge={state.vision ? visionCount : 0}
          small
        />
      </div>
    </div>
  )
})
