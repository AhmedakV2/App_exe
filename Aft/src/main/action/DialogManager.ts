import type { Transport } from '../discovery'
import type { DialogPolicy, DialogRecord, DownloadRecord } from './types'

const HISTORY_CAP = 50

export interface FileChooserRequest {
  backendNodeId: number
  sessionId: string
  mode: string
  at: number
}

export class DialogManager {
  private readonly dialogs: DialogRecord[] = []
  private readonly downloads = new Map<string, DownloadRecord>()
  private readonly detach: (() => void)[] = []
  private pendingFiles: string[] = []
  private lastChooser: FileChooserRequest | null = null
  private policy: DialogPolicy = 'accept'
  private promptText = ''

  constructor(private readonly tp: Transport) {}

  async install(policy: DialogPolicy, promptText: string, downloadPath: string): Promise<void> {
    this.policy = policy
    this.promptText = promptText

    for (const sessionId of this.tp.sessions) {
      await this.tp.trySend('Page.enable', {}, sessionId)
      await this.tp.trySend('Page.setInterceptFileChooserDialog', { enabled: true }, sessionId)
    }

    if (downloadPath) {
      await this.tp.trySend('Browser.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath,
        eventsEnabled: true
      })
    }

    if (this.detach.length) return

    this.detach.push(
      this.tp.on('Page.javascriptDialogOpening', (params, sessionId) => {
        void this.handleDialog(params, sessionId)
      })
    )
    this.detach.push(
      this.tp.on('Page.fileChooserOpened', (params, sessionId) => {
        void this.handleChooser(params, sessionId)
      })
    )
    this.detach.push(this.tp.on('Browser.downloadWillBegin', (params) => this.trackStart(params)))
    this.detach.push(this.tp.on('Browser.downloadProgress', (params) => this.trackProgress(params)))
  }

  setPolicy(policy: DialogPolicy, promptText: string): void {
    this.policy = policy
    this.promptText = promptText
  }

  expectFiles(files: string[]): void {
    this.pendingFiles = files.slice()
  }

  consumeDialogs(): DialogRecord[] {
    const out = this.dialogs.slice()
    this.dialogs.length = 0
    return out
  }

  consumeDownloads(): DownloadRecord[] {
    const out = Array.from(this.downloads.values())
    this.downloads.clear()
    return out
  }

  chooserRequest(): FileChooserRequest | null {
    return this.lastChooser
  }

  dispose(): void {
    for (const off of this.detach) off()
    this.detach.length = 0
    this.dialogs.length = 0
    this.downloads.clear()
    this.pendingFiles = []
    this.lastChooser = null
  }

  private async handleDialog(params: Record<string, unknown>, sessionId: string): Promise<void> {
    const accept = this.policy === 'accept'
    const type = String(params.type ?? 'alert')

    await this.tp.trySend(
      'Page.handleJavaScriptDialog',
      accept && type === 'prompt' ? { accept, promptText: this.promptText } : { accept },
      sessionId
    )

    this.push({
      type,
      message: String(params.message ?? ''),
      policy: this.policy,
      promptText: this.promptText,
      handledAt: Date.now()
    })
  }

  private async handleChooser(params: Record<string, unknown>, sessionId: string): Promise<void> {
    const backendNodeId = Number(params.backendNodeId ?? 0)
    this.lastChooser = {
      backendNodeId,
      sessionId,
      mode: String(params.mode ?? 'selectSingle'),
      at: Date.now()
    }

    if (!this.pendingFiles.length || !backendNodeId) return

    const files = this.pendingFiles
    this.pendingFiles = []
    await this.tp.trySend('DOM.setFileInputFiles', { files, backendNodeId }, sessionId)
  }

  private trackStart(params: Record<string, unknown>): void {
    const guid = String(params.guid ?? '')
    if (!guid) return

    this.downloads.set(guid, {
      guid,
      url: String(params.url ?? ''),
      fileName: String(params.suggestedFilename ?? ''),
      state: 'inProgress',
      updatedAt: Date.now()
    })
  }

  private trackProgress(params: Record<string, unknown>): void {
    const guid = String(params.guid ?? '')
    const record = this.downloads.get(guid)
    if (!record) return

    record.state = String(params.state ?? record.state)
    record.updatedAt = Date.now()
  }

  private push(record: DialogRecord): void {
    this.dialogs.push(record)
    if (this.dialogs.length > HISTORY_CAP) this.dialogs.shift()
  }
}
