import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'

const playback = {
  list: () => ipcRenderer.invoke('aft:playback:list'),
  get: (id: string) => ipcRenderer.invoke('aft:playback:get', id),
  save: (scenario: unknown, folder?: string | null) =>
    ipcRenderer.invoke('aft:playback:save', scenario, folder ?? null),
  remove: (id: string) => ipcRenderer.invoke('aft:playback:remove', id),
  validate: (scenario: unknown) => ipcRenderer.invoke('aft:playback:validate', scenario),
  run: (request: unknown) => ipcRenderer.invoke('aft:playback:run', request),
  cancel: () => ipcRenderer.invoke('aft:playback:cancel'),
  last: () => ipcRenderer.invoke('aft:playback:last'),
  contexts: () => ipcRenderer.invoke('aft:playback:contexts'),
  context: (id: string) => ipcRenderer.invoke('aft:playback:context', id),
  move: (request: unknown) => ipcRenderer.invoke('aft:playback:move', request),
  folderAdd: (request: unknown) => ipcRenderer.invoke('aft:playback:folder-add', request),
  folderRename: (request: unknown) => ipcRenderer.invoke('aft:playback:folder-rename', request),
  folderRemove: (id: string) => ipcRenderer.invoke('aft:playback:folder-remove', id),
  onProgress: (fn: (payload: unknown) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, payload: unknown): void => fn(payload)
    ipcRenderer.on('aft:playback:progress', handler)
    return (): void => {
      ipcRenderer.removeListener('aft:playback:progress', handler)
    }
  }
}

contextBridge.exposeInMainWorld('aftPlayback', playback)
