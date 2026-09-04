import React, { memo, useCallback, useMemo, useState } from 'react'
import type { ScenarioEntry, ScenarioFolder } from '../../../main/scenario/ScenarioStore'
import { Glyph } from '../icons'
import { Empty } from '../ui'
import { formatShortDate } from '../format'

export type TreeTarget = { kind: 'root' | 'folder' | 'scenario'; id: string }

type Row =
  | { key: string; kind: 'folder'; depth: number; folder: ScenarioFolder }
  | { key: string; kind: 'scenario'; depth: number; entry: ScenarioEntry }

const ROOT_ID = ''

const CLOSED_KEY = 'aft.scenarios.closed'

function readClosed(): string[] {
  try {
    const raw = window.localStorage.getItem(CLOSED_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : null
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}

function storeClosed(ids: string[]): void {
  try {
    window.localStorage.setItem(CLOSED_KEY, JSON.stringify(ids))
  } catch {
    return
  }
}

function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, 'tr')
}

function byTitle(a: ScenarioEntry, b: ScenarioEntry): number {
  return a.title.localeCompare(b.title, 'tr')
}

export default memo(function ScenarioTree({
  entries,
  folders,
  filter,
  selected,
  activeFolder,
  disabled,
  onOpen,
  onPickFolder,
  onMove,
  onMenu
}: {
  entries: ScenarioEntry[]
  folders: ScenarioFolder[]
  filter: string
  selected: string
  activeFolder: string
  disabled: boolean
  onOpen: (id: string) => void
  onPickFolder: (id: string) => void
  onMove: (scenarioId: string, folder: string) => void
  onMenu: (target: TreeTarget, x: number, y: number) => void
}): React.JSX.Element {
  const [closed, setClosed] = useState<string[]>(readClosed)
  const [dragId, setDragId] = useState('')
  const [overId, setOverId] = useState<string | null>(null)

  const needle = filter.trim().toLowerCase()

  const matched = useMemo(() => {
    if (!needle) return entries
    return entries.filter((entry) => entry.title.toLowerCase().includes(needle))
  }, [entries, needle])

  const rows = useMemo(() => {
    const out: Row[] = []
    const kids = new Map<string, ScenarioFolder[]>()
    const files = new Map<string, ScenarioEntry[]>()

    for (const folder of folders) {
      const list = kids.get(folder.parentId) ?? []
      list.push(folder)
      kids.set(folder.parentId, list)
    }
    for (const entry of matched) {
      const list = files.get(entry.folder) ?? []
      list.push(entry)
      files.set(entry.folder, list)
    }

    const holds = (id: string): boolean => {
      if ((files.get(id) ?? []).length) return true
      return (kids.get(id) ?? []).some((child) => holds(child.id))
    }

    const walk = (parent: string, depth: number): void => {
      for (const folder of (kids.get(parent) ?? []).slice().sort(byName)) {
        if (needle && !holds(folder.id) && !folder.name.toLowerCase().includes(needle)) continue

        out.push({ key: 'f:' + folder.id, kind: 'folder', depth, folder })
        if (!needle && closed.includes(folder.id)) continue
        walk(folder.id, depth + 1)
      }

      for (const entry of (files.get(parent) ?? []).slice().sort(byTitle)) {
        out.push({ key: 's:' + entry.id, kind: 'scenario', depth, entry })
      }
    }

    walk(ROOT_ID, 0)
    return out
  }, [closed, folders, matched, needle])

  const toggle = useCallback((id: string): void => {
    setClosed((prev) => {
      const next = prev.includes(id) ? prev.filter((item) => item !== id) : prev.concat(id)
      storeClosed(next)
      return next
    })
  }, [])

  const drop = useCallback(
    (folder: string): void => {
      setOverId(null)
      const id = dragId
      setDragId('')
      if (!id) return
      onMove(id, folder)
    },
    [dragId, onMove]
  )

  const allow = useCallback(
    (id: string) =>
      (event: React.DragEvent): void => {
        if (!dragId) return
        event.preventDefault()
        event.stopPropagation()
        event.dataTransfer.dropEffect = 'move'
        setOverId(id)
      },
    [dragId]
  )

  return (
    <div
      className={'tree' + (overId === ROOT_ID ? ' over' : '')}
      onDragOver={allow(ROOT_ID)}
      onDragLeave={() => setOverId(null)}
      onDrop={(event) => {
        event.preventDefault()
        drop(ROOT_ID)
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        onMenu({ kind: 'root', id: ROOT_ID }, event.clientX, event.clientY)
      }}
    >
      <div
        className={
          'tree-row root' +
          (activeFolder === ROOT_ID ? ' active' : '') +
          (overId === ROOT_ID ? ' over' : '')
        }
        role="button"
        tabIndex={0}
        onClick={() => onPickFolder(ROOT_ID)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          onPickFolder(ROOT_ID)
        }}
      >
        <Glyph name="library" size={13} />
        <span className="tree-title">Tüm projeler</span>
        <span className="tree-meta">{entries.length}</span>
      </div>

      {rows.length ? (
        rows.map((row) =>
          row.kind === 'folder' ? (
            <div
              key={row.key}
              className={
                'tree-row folder' +
                (activeFolder === row.folder.id ? ' active' : '') +
                (overId === row.folder.id ? ' over' : '')
              }
              style={{ paddingLeft: 10 + row.depth * 14 }}
              role="button"
              tabIndex={0}
              onClick={() => onPickFolder(row.folder.id)}
              onDoubleClick={() => toggle(row.folder.id)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                onPickFolder(row.folder.id)
              }}
              onContextMenu={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onPickFolder(row.folder.id)
                onMenu({ kind: 'folder', id: row.folder.id }, event.clientX, event.clientY)
              }}
              onDragOver={allow(row.folder.id)}
              onDragLeave={(event) => {
                event.stopPropagation()
                setOverId(null)
              }}
              onDrop={(event) => {
                event.preventDefault()
                event.stopPropagation()
                drop(row.folder.id)
              }}
            >
              <button
                className="tree-twist"
                title={closed.includes(row.folder.id) ? 'Aç' : 'Kapat'}
                aria-label="Klasör"
                onClick={(event) => {
                  event.stopPropagation()
                  toggle(row.folder.id)
                }}
                type="button"
              >
                <Glyph name={closed.includes(row.folder.id) ? 'right' : 'down'} size={12} />
              </button>
              <Glyph name={row.folder.kind === 'module' ? 'module' : 'folder'} size={13} />
              <span className="tree-title">{row.folder.name}</span>
              <span className="tree-kind">{row.folder.kind === 'module' ? 'modül' : 'proje'}</span>
              <span className="tree-meta">{row.folder.scenarios}</span>
            </div>
          ) : (
            <div
              key={row.key}
              className={
                'tree-row file' +
                (row.entry.id === selected ? ' sel' : '') +
                (overId === 's:' + row.entry.id ? ' over' : '') +
                (dragId === row.entry.id ? ' dragging' : '') +
                (disabled ? ' off' : '')
              }
              style={{ paddingLeft: 24 + row.depth * 14 }}
              role="button"
              tabIndex={0}
              draggable={!disabled}
              onClick={() => onOpen(row.entry.id)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                onOpen(row.entry.id)
              }}
              onContextMenu={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onMenu({ kind: 'scenario', id: row.entry.id }, event.clientX, event.clientY)
              }}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('text/plain', row.entry.id)
                setDragId(row.entry.id)
              }}
              onDragEnd={() => {
                setDragId('')
                setOverId(null)
              }}
              onDragOver={(event) => {
                if (!dragId || dragId === row.entry.id) return
                event.preventDefault()
                event.stopPropagation()
                event.dataTransfer.dropEffect = 'move'
                setOverId('s:' + row.entry.id)
              }}
              onDragLeave={(event) => {
                event.stopPropagation()
                setOverId(null)
              }}
              onDrop={(event) => {
                event.preventDefault()
                event.stopPropagation()
                drop(row.entry.folder)
              }}
            >
              <Glyph name="file" size={13} />
              <span className="tree-title">{row.entry.title}</span>
              <span className="tree-meta">{row.entry.steps}</span>
              <span className="tree-meta">{formatShortDate(row.entry.updatedAt)}</span>
            </div>
          )
        )
      ) : (
        <Empty glyph="library" text={needle ? 'Eşleşme yok' : 'Senaryo yok'} />
      )}
    </div>
  )
})
