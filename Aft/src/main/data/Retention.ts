
import { rm } from 'node:fs/promises'
import type { ContextStore } from '../scenario'
import type { DataDriver } from './driver'
import type { Indexer } from './Indexer'
import type { Outbox } from './Outbox'
import { DEFAULT_RETENTION, type RetentionPolicy, type RetentionReport } from './types'

export class Retention {
  constructor(
    private readonly driver: DataDriver,
    private readonly indexer: Indexer,
    private readonly contexts: ContextStore,
    private readonly outbox: Outbox | null = null
  ) {}
  async sweep(policy: Partial<RetentionPolicy> = {}): Promise<RetentionReport> {
    const merged: RetentionPolicy = { ...DEFAULT_RETENTION, ...policy }
    const report: RetentionReport = {
      runsRemoved: 0,
      reportsRemoved: 0,
      contextsRemoved: 0,
      skippedPending: 0
    }
    report.contextsRemoved = await this.contexts.prune(merged.contextRetentionMs)
    this.indexer.reconcile(await this.contexts.refs())
    const blocked = new Set(this.outbox ? this.outbox.activeRefs('run') : [])
    for (const id of this.expired(merged)) {
      if (blocked.has(id)) {
        report.skippedPending += 1
        continue
      }
      report.reportsRemoved += await this.dropFiles(id)
      if (this.indexer.removeRun(id)) report.runsRemoved += 1
    }
    return report
  }
  private expired(policy: RetentionPolicy): string[] {
    const cutoff = Date.now() - policy.runRetentionMs
    const aged = this.driver.all<{ id: string }>('SELECT id FROM run WHERE started_at < ?', cutoff)
    const overflow = this.driver.all<{ id: string }>(
      'SELECT id FROM run ORDER BY started_at DESC LIMIT -1 OFFSET ?',
      Math.max(0, Math.trunc(policy.keepRuns))
    )
    return Array.from(new Set([...aged, ...overflow].map((row) => row.id)))
  }
  private async dropFiles(runId: string): Promise<number> {
    const row = this.indexer.run(runId)
    let removed = 0
    const reports = [row ? row.reportJsonPath : '', row ? row.reportTextPath : '']
    for (const path of reports) {
      if (!path) continue
      await rm(path, { force: true })
      removed += 1
    }
    for (const context of this.indexer.contexts(runId)) {
      if (!context.filePath) continue
      await rm(context.filePath, { force: true })
    }
    return removed
  }
}
