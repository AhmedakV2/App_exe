import React, { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { AgentAction, BrowserState, NavKind } from '../../../main/browser/types'
import { isHomeUrl } from '../../../main/home/search'
import { Glyph } from '../icons'
import { shortUrl, toUrl } from '../format'

export default memo(function BrowserPage({
  state,
  elementCount,
  focusSeed,
  stageRef,
  onNav,
  onAction,
  onVision,
  onScan
}: {
  state: BrowserState
  elementCount: number
  focusSeed: number
  stageRef: (node: HTMLDivElement | null) => void
  onNav: (kind: NavKind) => void
  onAction: (action: AgentAction) => void
  onVision: () => void
  onScan: () => void
}): React.JSX.Element {
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState('')
  const urlRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (focusSeed) urlRef.current?.focus()
  }, [focusSeed])

  const onFocus = useCallback((): void => {
    setFocused(true)
    setDraft(isHomeUrl(state.url) ? '' : state.url)
    requestAnimationFrame(() => urlRef.current?.select())
  }, [state.url])

  const onBlur = useCallback((): void => {
    setFocused(false)
    setDraft('')
  }, [])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        urlRef.current?.blur()
        return
      }
      if (event.key !== 'Enter') return
      event.preventDefault()
      const url = toUrl(draft)
      if (!url) return
      urlRef.current?.blur()
      onAction({ action: 'go_to_url', url })
    },
    [draft, onAction]
  )

  return (
    <>
      <div className="tb">
        <button
          className="ib"
          title="Geri"
          onClick={() => onNav('back')}
          disabled={!state.canGoBack}
          type="button"
        >
          <Glyph name="back" size={15} />
        </button>
        <button
          className="ib"
          title="İleri"
          onClick={() => onNav('forward')}
          disabled={!state.canGoForward}
          type="button"
        >
          <Glyph name="forward" size={15} />
        </button>
        <button
          className="ib"
          title={state.loading ? 'Durdur' : 'Yenile'}
          onClick={() => onNav(state.loading ? 'stop' : 'reload')}
          type="button"
        >
          <Glyph name={state.loading ? 'stop' : 'reload'} size={14} />
        </button>
        <button className="ib" title="Ana sayfa" onClick={() => onNav('home')} type="button">
          <Glyph name="home" size={14} />
        </button>
        <div className={'omni' + (focused ? ' focused' : '')}>
          <Glyph name="link" size={12} />
          <input
            ref={urlRef}
            value={focused ? draft : shortUrl(state.url)}
            onChange={(event) => setDraft(event.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
            placeholder="Adres veya arama"
            spellCheck={false}
            aria-label="Adres çubuğu"
          />
          {state.loading ? <span className="omni-load" /> : null}
        </div>
        <span className="sp" />
        <button
          className={'ib' + (state.vision ? ' on' : '')}
          title="Görüş"
          onClick={onVision}
          type="button"
        >
          <Glyph name={state.vision ? 'eye' : 'eyeOff'} size={15} />
          {state.vision && elementCount ? <span className="badge">{elementCount}</span> : null}
        </button>
        <button className="ib" title="Sayfayı tara" onClick={onScan} type="button">
          <Glyph name="radar" size={15} />
        </button>
        <button
          className="ib"
          title="Yeniden tara"
          onClick={() => onAction({ action: 'snapshot' })}
          type="button"
        >
          <Glyph name="camera" size={15} />
        </button>
      </div>
      <div className="stage-wrap">
        <div className="stage" ref={stageRef} />
      </div>
    </>
  )
})
