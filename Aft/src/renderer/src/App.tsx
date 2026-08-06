import React, { useState } from 'react'
import type { ExecuteResult, PageElement, AgentAction } from '../../main/browser/types'

type ParsedCommand = { kind: 'help' } | { kind: 'action'; action: AgentAction } | null
type Line = { kind: 'in' | 'ok' | 'err' | 'el'; text: string }

const COMMANDS: Record<string, { usage: string; build: (a: string[]) => AgentAction }> = {
  go: { usage: 'go <url>', build: (a) => ({ action: 'go_to_url', url: a[0] }) },
  click: { usage: 'click <index>', build: (a) => ({ action: 'click', index: Number(a[0]) }) },
  dbclick: {
    usage: 'dbclick <index>',
    build: (a) => ({ action: 'double_click', index: Number(a[0]) })
  },
  rclick: {
    usage: 'rclick <index>',
    build: (a) => ({ action: 'right_click', index: Number(a[0]) })
  },
  type: {
    usage: 'type <index> <metin>',
    build: (a) => ({ action: 'type', index: Number(a[0]), text: a.slice(1).join(' ') })
  },
  clear: { usage: 'clear <index>', build: (a) => ({ action: 'clear_type', index: Number(a[0]) }) },
  move: { usage: 'move <index>', build: (a) => ({ action: 'mouse_move', index: Number(a[0]) }) },
  scroll: { usage: 'scroll <deltaY>', build: (a) => ({ action: 'scroll', deltaY: Number(a[0]) }) },
  enter: { usage: 'enter <index>', build: () => ({ action: 'press_enter' }) },
  snap: { usage: 'snap', build: () => ({ action: 'snapshot' }) }
}

export default function App(): React.JSX.Element {
  const [cmd, setCmd] = useState('')
  const [vision, setVision] = useState(true)
  const [lines, setLines] = useState<Line[]>([])

  const push = (kind: Line['kind'], text: string): void => setLines((p) => [...p, { kind, text }])

  function parse(input: string): ParsedCommand {
    const [head = '', ...rest] = input.trim().split(/\s+/)
    const key = head.toLowerCase()
    if (key === 'action') return { kind: 'help' }

    const entry = COMMANDS[key]
    return entry ? { kind: 'action', action: entry.build(rest) } : null
  }

  function report(res: ExecuteResult): void {
    push(res.ok ? 'ok' : 'err', res.result)
    if (!res.ok || !res.page || !res.vision) return
    res.page.elements
      .slice(0, 60)
      .forEach((e: PageElement) =>
        push('el', `[${e.i}] <${e.tag}${e.type ? ' ' + e.type : ''}> ${e.text}`)
      )
  }

  async function run(): Promise<void> {
    const parsed = parse(cmd)
    if (!parsed) return push('err', 'Bilinmeyen komut. Liste icin: action')

    push('in', '> ' + cmd)
    setCmd('')

    if (parsed.kind === 'help') {
      push('ok', 'Kullanilabilir aksiyonlar:')
      Object.values(COMMANDS).forEach((c) => push('el', '  ' + c.usage))
      return
    }

    try {
      report(await window.aft.execute(parsed.action))
    } catch (err) {
      push('err', 'KOPRU HATASI: ' + (err as Error).message)
    }
  }

  async function toggleVision(): Promise<void> {
    const next = !vision
    setVision(next)
    try {
      report(await window.aft.setVision(next))
    } catch (err) {
      push('err', 'KOPRU HATASI: ' + (err as Error).message)
    }
  }

  async function goHome(): Promise<void> {
    push('in', '> home')
    report(await window.aft.home())
  }

  const color = (k: Line['kind']): string =>
    k === 'err' ? '#ff6b6b' : k === 'in' ? '#ef6c1a' : k === 'el' ? '#8a8a8a' : '#cfcfcf'

  return (
    <div className="shell">
      <div className="bar">
        <span className="brand">AFT AGENT</span>
        <button className="icon" onClick={goHome} title="Google'a don">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M3 11l9-8 9 8" />
            <path d="M5 10v10h14V10" />
          </svg>
        </button>
        <button
          className={vision ? 'icon on' : 'icon'}
          onClick={toggleVision}
          title={vision ? 'Gorusu kapat' : 'Gorusu ac'}
        >
          {vision ? (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          ) : (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
              <path d="M1 1l22 22" />
            </svg>
          )}
        </button>
      </div>

      <div className="log">
        {lines.map((l, i) => (
          <div key={i} style={{ color: color(l.kind) }}>
            {l.text}
          </div>
        ))}
      </div>

      <div className="input">
        <input
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
          placeholder="( action ) komutları verir."
        />
        <button onClick={run}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 3v18" />
            <path d="M16.5 12l-9-9" />
          </svg>
        </button>
      </div>
    </div>
  )
}
