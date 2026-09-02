import React, { memo, useEffect, useRef, useState } from 'react'
import type { WindowAction } from '../../../main/browser/types'
import { Glyph } from '../icons'

export type MenuItem =
  { label: string; kbd?: string; disabled?: boolean; onPick: () => void } | 'sep'

export interface MenuDef {
  label: string
  items: MenuItem[]
}

const Menu = memo(function Menu({
  menu,
  open,
  onOpen
}: {
  menu: MenuDef
  open: boolean
  onOpen: (label: string) => void
}): React.JSX.Element {
  return (
    <div className="menu">
      <button
        className={'menu-btn' + (open ? ' open' : '')}
        onClick={() => onOpen(open ? '' : menu.label)}
        onMouseEnter={() => onOpen(menu.label)}
        type="button"
      >
        {menu.label}
      </button>
      {open ? (
        <div className="menu-list" role="menu">
          {menu.items.map((item, index) =>
            item === 'sep' ? (
              <div key={'s' + index} className="menu-sep" />
            ) : (
              <button
                key={item.label}
                className="menu-item"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  onOpen('')
                  item.onPick()
                }}
                type="button"
              >
                {item.label}
                {item.kbd ? <kbd>{item.kbd}</kbd> : null}
              </button>
            )
          )}
        </div>
      ) : null}
    </div>
  )
})

export default memo(function TitleBar({
  menus,
  title,
  maximized,
  sideOpen,
  bottomOpen,
  rightOpen,
  onPalette,
  onSide,
  onBottom,
  onRight,
  onWindow,
  onMenuState
}: {
  menus: MenuDef[]
  title: string
  maximized: boolean
  sideOpen: boolean
  bottomOpen: boolean
  rightOpen: boolean
  onPalette: () => void
  onSide: () => void
  onBottom: () => void
  onRight: () => void
  onWindow: (action: WindowAction) => void
  onMenuState: (open: boolean) => void
}): React.JSX.Element {
  const [open, setOpen] = useState('')
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    onMenuState(Boolean(open))
  }, [onMenuState, open])

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent): void => {
      if (rootRef.current?.contains(event.target as Node)) return
      setOpen('')
    }
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen('')
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', key)
    }
  }, [open])

  return (
    <header className="title" ref={rootRef}>
      <span className="logo">
        <svg width="14" height="14" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
          <path d="M212 60 L300 60 L458 428 L352 428 L258 188 L182 348 L250 348 L296 398 L258 398 L222 428 L54 428 Z" />
        </svg>
      </span>
      {menus.map((menu) => (
        <Menu
          key={menu.label}
          menu={menu}
          open={open === menu.label}
          onOpen={(label) => setOpen((prev) => (prev || label === '' ? label : prev))}
        />
      ))}
      <div className="drag" onDoubleClick={() => onWindow('maximize')} />
      <button className="cc" onClick={onPalette} type="button" title="Komut paleti">
        <Glyph name="search" size={13} />
        <span className="cc-text">{title}</span>
        <kbd>Ctrl P</kbd>
      </button>
      <div className="drag" onDoubleClick={() => onWindow('maximize')} />
      <div className="lay">
        <button
          className={'ib' + (sideOpen ? ' on' : '')}
          onClick={onSide}
          title="Yan panel"
          type="button"
        >
          <Glyph name="layoutLeft" size={15} />
        </button>
        <button
          className={'ib' + (bottomOpen ? ' on' : '')}
          onClick={onBottom}
          title="Alt panel Ctrl+K"
          type="button"
        >
          <Glyph name="layoutBottom" size={15} />
        </button>
        <button
          className={'ib' + (rightOpen ? ' on' : '')}
          onClick={onRight}
          title="Denetçi"
          type="button"
        >
          <Glyph name="layoutRight" size={15} />
        </button>
      </div>
      <div className="wc">
        <button onClick={() => onWindow('minimize')} title="Küçült" type="button">
          <Glyph name="minimize" size={13} />
        </button>
        <button
          onClick={() => onWindow('maximize')}
          title={maximized ? 'Önceki boyut' : 'Ekranı kapla'}
          type="button"
        >
          <Glyph name={maximized ? 'restore' : 'maximize'} size={12} />
        </button>
        <button className="x" onClick={() => onWindow('close')} title="Kapat" type="button">
          <Glyph name="close" size={13} />
        </button>
      </div>
    </header>
  )
})
