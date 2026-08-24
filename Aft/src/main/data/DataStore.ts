import { stat } from 'node:fs/promises'
import type { ContextStore } from '../scenario'
import { openDatabase, type DataDriver } from './driver'
import { Indexer } from './Indexer'
import { migrateData, type DataMigrationResult } from './migrate'
import { Outbox, type OutboxTransport } from './Outbox'
import { Retention } from './Retention'
import type { DataStats } from './types'

export interface DataStoreOptions {
  filePath: string
  contexts: ContextStore
  transport?: OutboxTransport
}

export class DataStore {
  readonly driver: DataDriver
  readonly indexer: Indexer
  readonly outbox: Outbox
  readonly retention: Retention
  private readonly migrationResult: DataMigrationResult
  constructor(options: DataStoreOptions) {
    this.driver = openDatabase(options.filePath)
    this.migrationResult = migrateData(this.driver)
    this.outbox = new Outbox(this.driver, options.transport)
    this.indexer = new Indexer(this.driver, this.outbox)
    this.retention = new Retention(this.driver, this.indexer, options.contexts, this.outbox)
  }
  migration(): DataMigrationResult {
    return this.migrationResult
  }
  async stats(): Promise<DataStats> {
    const counts = this.indexer.counts()
    const bytes = await stat(this.driver.path())
      .then((info) => info.size)
      .catch(() => 0)
    return {
      filePath: this.driver.path(),
      bytes,
      userVersion: this.driver.userVersion(),
      journalMode: this.driver.journalMode(),
      scenarios: counts.scenarios,
      runs: counts.runs,
      steps: counts.steps,
      contexts: counts.contexts,
      outbox: counts.outbox
    }
  }
  close(): void {
    this.driver.close()
  }
}
