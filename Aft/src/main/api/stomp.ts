const NULL = '\u0000'

export interface StompFrame {
  command: string
  headers: Record<string, string>
  body: string
}

export function encode(command: string, headers: Record<string, string>, body = ''): string {
  const lines = [command]
  for (const [key, value] of Object.entries(headers)) lines.push(key + ':' + value)
  return lines.join('\n') + '\n\n' + body + NULL
}

export function decode(raw: string): StompFrame | null {
  const clean = raw.endsWith(NULL) ? raw.slice(0, -1) : raw
  const split = clean.indexOf('\n\n')
  if (split < 0) return null

  const head = clean.slice(0, split).split('\n')
  const command = head.shift() ?? ''
  if (!command) return null

  const headers: Record<string, string> = {}
  for (const line of head) {
    const at = line.indexOf(':')
    if (at > 0) headers[line.slice(0, at)] = line.slice(at + 1)
  }
  return { command, headers, body: clean.slice(split + 2) }
}
