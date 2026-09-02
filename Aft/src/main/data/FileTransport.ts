import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { OutboxItem } from './types'
import type { OutboxTransport } from './Outbox'

export class FileTransport implements OutboxTransport {
  private ready: Promise<void> | null = null

  constructor(private readonly directory: string) {}

  target(): string {
    return this.directory
  }

  async send(item: OutboxItem): Promise<void> {
    await this.ensure()

    const payload = {
      id: item.id,
      kind: item.kind,
      refId: item.refId,
      createdAt: item.createdAt,
      sentAt: Date.now(),
      attempts: item.attempts,
      body: await this.body(item)
    }

    const name = item.kind + '-' + item.refId + '-' + item.id + '.json'
    await writeFile(join(this.directory, name), JSON.stringify(payload, null, 2), 'utf8')
  }

  private async body(item: OutboxItem): Promise<unknown> {
    if (item.payloadJson) return safeParse(item.payloadJson)
    if (!item.payloadPath) return null

    const raw = await readFile(item.payloadPath, 'utf8').catch(() => '')
    return raw ? safeParse(raw) : { path: item.payloadPath, missing: true }
  }

  private ensure(): Promise<void> {
    if (!this.ready) this.ready = mkdir(this.directory, { recursive: true }).then(() => undefined)
    return this.ready
  }
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return raw
  }
}
