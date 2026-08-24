import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'

const record = {
  start: (request: unknown) => ipcRenderer.invoke('aft:record:start', request),
  stop: () => ipcRenderer.invoke('aft:record:stop'),
  pause: () => ipcRenderer.invoke('aft:record:pause'),
  resume: () => ipcRenderer.invoke('aft:record:resume'),
  state: () => ipcRenderer.invoke('aft:record:state'),
  edit: (request: unknown) => ipcRenderer.invoke('aft:record:edit', request),
  describe: (meta: unknown) => ipcRenderer.invoke('aft:record:describe', meta),
  options: (options: unknown) => ipcRenderer.invoke('aft:record:options', options),
  save: (request: unknown) => ipcRenderer.invoke('aft:record:save', request),
  discard: () => ipcRenderer.invoke('aft:record:discard'),
  onUpdate: (fn: (payload: unknown) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, payload: unknown): void => fn(payload)
    ipcRenderer.on('aft:record:update', handler)
    return (): void => {
      ipcRenderer.removeListener('aft:record:update', handler)
    }
  },
  onNotice: (fn: (payload: unknown) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, payload: unknown): void => fn(payload)
    ipcRenderer.on('aft:record:notice', handler)
    return (): void => {
      ipcRenderer.removeListener('aft:record:notice', handler)
    }
  }
}

contextBridge.exposeInMainWorld('aftRecord', record)
