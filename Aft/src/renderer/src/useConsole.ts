import { useCallback, useMemo, useRef, useState } from 'react'
import type { ExecuteResult, PageElement } from '../../main/browser/types'
import { ACTION_MAP, PALETTE } from './commands'
import { formatClock } from './format'

export type LineKind = 'in' | 'ok' | 'err' | 'note'
export type Fact = { label: string; ok: boolean }
export type Line = {
  id: number
  kind: LineKind
  text: string
  time: string
  ms?: number
  facts?: Fact[]
  detail?: string[]
}
export type Extra = { ms?: number; facts?: Fact[]; detail?: string[] }

export interface Console {
  lines: Line[]
  pending: boolean
  elements: PageElement[]
  lastMs: number
  push: (kind: LineKind, text: string, extra?: Extra) => void
  getHistory: () => string[]
  absorb: (result: ExecuteResult) => void
  submit: (input: string) => Promise<void>
  clear: () => void
}

const MAX_LINES = 400

function readOutcome(result: ExecuteResult): Extra {
  const outcome = result.outcome
  if (!outcome) return {}

  const detail: string[] = []
  let facts: Fact[] | undefined

  if (!result.ok && outcome.code) detail.push('Kod: ' + outcome.code)
  if (result.ok && outcome.mode === 'direct-call') detail.push('Yol: doğrudan çağrı')

  const report = outcome.actionability
  if (!result.ok && report) {
    facts = [
      { label: 'Görünür', ok: report.visible },
      { label: 'Etkin', ok: report.enabled },
      { label: 'Kararlı', ok: report.stable },
      { label: 'Üstü açık', ok: report.unobstructed }
    ]
    if (report.reason) detail.push('Hazırlık: ' + report.reason)
  }

  for (const dialog of outcome.dialogs)
    detail.push('Diyalog: ' + dialog.type + ' · ' + dialog.policy)
  for (const download of outcome.downloads)
    detail.push('İndirme: ' + download.fileName + ' · ' + download.state)

  return { detail: detail.length ? detail : undefined, facts }
}

export function useConsole(): Console {
  const [lines, setLines] = useState<Line[]>([])
  const [pending, setPending] = useState(false)
  const [elements, setElements] = useState<PageElement[]>([])
  const [lastMs, setLastMs] = useState(0)

  const seqRef = useRef(0)
  const pendingRef = useRef(false)
  const historyRef = useRef<string[]>([])

  const push = useCallback((kind: LineKind, text: string, extra?: Extra): void => {
    seqRef.current += 1
    const line: Line = { id: seqRef.current, kind, text, time: formatClock(), ...extra }
    setLines((prev) => {
      const next = prev.length >= MAX_LINES ? prev.slice(prev.length - MAX_LINES + 1) : prev.slice()
      next.push(line)
      return next
    })
  }, [])

  const clear = useCallback((): void => setLines([]), [])

  const getHistory = useCallback((): string[] => historyRef.current, [])

  const absorb = useCallback((result: ExecuteResult): void => {
    if (result.page) setElements(result.page.elements)
  }, [])

  const submit = useCallback(
    async (input: string): Promise<void> => {
      if (pendingRef.current) return
      const text = input.trim()
      if (!text) return

      const [head = '', ...rest] = text.split(/\s+/)
      const key = head.toLowerCase()

      const history = historyRef.current
      if (history[history.length - 1] !== text) history.push(text)
      if (history.length > 100) history.shift()

      if (key === 'c') {
        clear()
        return
      }

      push('in', text)

      if (key === 'a' || key === '?') {
        push('note', 'Komutlar', {
          detail: PALETTE.map((entry) => entry.usage.padEnd(26, ' ') + entry.hint)
        })
        return
      }

      const entry = ACTION_MAP.get(key)
      if (!entry) {
        push('err', 'Bilinmeyen komut: ' + head, { detail: ['a'] })
        return
      }

      const action = entry.build(rest)
      if (!action) {
        push('err', 'Geçersiz kullanım', { detail: [entry.usage] })
        return
      }

      pendingRef.current = true
      setPending(true)
      const started = performance.now()

      try {
        const result = await window.aft.execute(action)
        const ms = Math.round(performance.now() - started)
        push(result.ok ? 'ok' : 'err', result.result, { ...readOutcome(result), ms })
        if (result.page) setElements(result.page.elements)
        setLastMs(ms)
      } catch (error) {
        push('err', 'Köprü hatası: ' + (error as Error).message)
      } finally {
        pendingRef.current = false
        setPending(false)
      }
    },
    [clear, push]
  )

  return useMemo(
    () => ({
      lines,
      pending,
      elements,
      lastMs,
      push,
      absorb,
      submit,
      clear,
      getHistory
    }),
    [absorb, clear, elements, getHistory, lastMs, lines, pending, push, submit]
  )
}
