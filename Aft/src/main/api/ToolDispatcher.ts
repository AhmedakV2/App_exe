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
    const serialized = JSON.stringify(payload ?? null)
    if (Buffer.byteLength(serialized, 'utf8') <= MAX_RESULT_BYTES) {
      return ok(callId, payload, false)
    }
    const cut = Buffer.from(serialized, 'utf8').subarray(0, MAX_RESULT_BYTES).toString('utf8')
    return { callId, ok: true, contentJson: cut, error: null, truncated: true }
  }
}
