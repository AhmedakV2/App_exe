import React, { useCallback, useState } from 'react'
import { Glyph } from '../icons'

interface Block {
  kind: 'text' | 'code'
  language: string
  body: string
}

const FENCE = /```([a-zA-Z0-9+#-]*)\n?([\s\S]*?)```/g

function splitBlocks(source: string): Block[] {
  const blocks: Block[] = []
  let cursor = 0

  for (const match of source.matchAll(FENCE)) {
    const at = match.index ?? 0
    if (at > cursor) {
      blocks.push({ kind: 'text', language: '', body: source.slice(cursor, at) })
    }
    blocks.push({ kind: 'code', language: match[1] || 'metin', body: match[2].replace(/\n$/, '') })
    cursor = at + match[0].length
  }

  if (cursor < source.length) {
    blocks.push({ kind: 'text', language: '', body: source.slice(cursor) })
  }
  return blocks.filter((block) => block.kind === 'code' || block.body.trim().length > 0)
}

export function CopyButton({ value, label }: { value: string; label: string }): React.JSX.Element {
  const [done, setDone] = useState(false)

  const copy = useCallback((): void => {
    void navigator.clipboard
      .writeText(value)
      .then(() => {
        setDone(true)
        setTimeout(() => setDone(false), 1400)
      })
      .catch(() => undefined)
  }, [value])

  return (
    <button
      className="chat-copy"
      type="button"
      title={done ? 'Kopyalandı' : label}
      aria-label={done ? 'Kopyalandı' : label}
      onClick={copy}
    >
      <Glyph name={done ? 'check' : 'copy'} size={13} />
    </button>
  )
}

export default function ChatBlocks({ text }: { text: string }): React.JSX.Element {
  const blocks = splitBlocks(text)

  return (
    <>
      {blocks.map((block, index) =>
        block.kind === 'code' ? (
          <figure key={index} className="chat-code">
            <figcaption>
              <span>{block.language}</span>
              <CopyButton value={block.body} label="Kodu kopyala" />
            </figcaption>
            <pre>{block.body}</pre>
          </figure>
        ) : (
          <p key={index} className="chat-text">
            {block.body.trim()}
          </p>
        )
      )}
    </>
  )
}
