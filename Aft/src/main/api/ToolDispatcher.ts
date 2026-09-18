import type { AgentActivity } from './agent-types'
import { fail, ok, MAX_RESULT_BYTES } from './types'
import type { ApprovalGate, ToolHandler, ToolInvocation, ToolResult } from './types'

export interface ToolDispatcherOptions {
  handlers: Record<string, ToolHandler>
  approve: ApprovalGate
  onActivity?: (activity: AgentActivity) => void
}

export class ToolDispatcher {
  constructor(private readonly options: ToolDispatcherOptions) {}

  supported(): string[] {
    return Object.keys(this.options.handlers).sort()
  }

  async handle(invocation: ToolInvocation): Promise<ToolResult> {
    this.report('invocation', invocation, true, invocation.argumentsJson)

    const handler = this.options.handlers[invocation.toolName]
    if (!handler) return this.reject(invocation, 'Bilinmeyen arac: ' + invocation.toolName)

    if (invocation.approvalRequired) {
      const approved = await this.options.approve(invocation)
      this.report('approval', invocation, approved, approved ? 'onaylandi' : 'reddedildi')
      if (!approved) return fail(invocation.callId, 'Kullanici bu islemi reddetti')
    }

    try {
      const payload = await this.race(handler, invocation)
      const result = this.clip(invocation.callId, payload)
      this.report('result', invocation, true, result.truncated ? 'kirpilmis sonuc' : 'tamamlandi')
      return result
    } catch (error) {
      return this.reject(invocation, error instanceof Error ? error.message : String(error))
    }
  }

  private reject(invocation: ToolInvocation, message: string): ToolResult {
    this.report('result', invocation, false, message)
    return fail(invocation.callId, message)
  }

  private report(
    kind: AgentActivity['kind'],
    invocation: ToolInvocation,
    ok: boolean,
    detail: string
  ): void {
    this.options.onActivity?.({
      kind,
      toolName: invocation.toolName,
      callId: invocation.callId,
      ok,
      detail
    })
  }

  private race(handler: ToolHandler, invocation: ToolInvocation): Promise<unknown> {
    const args = this.parse(invocation.argumentsJson)
    if (invocation.timeoutMs <= 0) return Promise.resolve(handler(args))

    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Arac suresinde tamamlanmadi')),
        invocation.timeoutMs
      )
      Promise.resolve(handler(args))
        .then(resolve, reject)
        .finally(() => clearTimeout(timer))
    })
  }

  private parse(raw: string): Record<string, unknown> {
    if (!raw) return {}
    try {
      const parsed: unknown = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  }

  private clip(callId: string, payload: unknown): ToolResult {
    const size = Buffer.byteLength(JSON.stringify(payload ?? null), 'utf8')
    if (size <= MAX_RESULT_BYTES) return ok(callId, payload, false)

    const trimmed = this.shrink(payload)
    if (trimmed && Buffer.byteLength(JSON.stringify(trimmed), 'utf8') <= MAX_RESULT_BYTES) {
      return ok(callId, trimmed, true)
    }
    return ok(
      callId,
      {
        truncated: true,
        bytes: size,
        limit: MAX_RESULT_BYTES,
        error:
          'Sonuc boyut sinirini asti ve gonderilemedi. Daraltici parametrelerle tekrar cagir: ' +
          'limit dusur, filter ver veya daha dar bir kimlik kullan.'
      },
      true
    )
  }

  private shrink(payload: unknown): Record<string, unknown> | null {
    if (!payload || typeof payload !== 'object') return null
    const source = payload as Record<string, unknown>
    const out: Record<string, unknown> = { truncated: true }

    for (const [key, value] of Object.entries(source)) {
      if (!Array.isArray(value)) {
        out[key] = value
        continue
      }
      const budget = Math.max(1, Math.floor(MAX_RESULT_BYTES / 4 / this.weight(value)))
      out[key] = value.slice(0, budget)
      out[key + 'Total'] = value.length
    }
    return out
  }

  private weight(items: unknown[]): number {
    const sample = items.slice(0, 20)
    const bytes = Buffer.byteLength(JSON.stringify(sample), 'utf8')
    return Math.max(1, Math.ceil(bytes / Math.max(1, sample.length)))
  }
}
