import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'

const aftApi = {
  state: () => ipcRenderer.invoke('aft:api:state'),
  config: () => ipcRenderer.invoke('aft:api:config'),
  saveConfig: (patch: unknown) => ipcRenderer.invoke('aft:api:save-config', patch),
  login: (input: unknown) => ipcRenderer.invoke('aft:api:login', input),
  register: (input: unknown) => ipcRenderer.invoke('aft:api:register', input),
  logout: () => ipcRenderer.invoke('aft:api:logout'),
  connect: () => ipcRenderer.invoke('aft:api:connect'),
  disconnect: () => ipcRenderer.invoke('aft:api:disconnect'),
  approve: (callId: string, approved: boolean) =>
    ipcRenderer.invoke('aft:api:approve', { callId, approved }),
  gateDone: (): void => ipcRenderer.send('aft:gate:done'),
  onApproval: (fn: (request: unknown) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, request: unknown): void => fn(request)
    ipcRenderer.on('aft:api:approval', handler)
    return (): void => {
      ipcRenderer.removeListener('aft:api:approval', handler)
    }
  },
  onStateChanged: (fn: (state: unknown) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, state: unknown): void => fn(state)
    ipcRenderer.on('aft:api:state-changed', handler)
    return (): void => {
      ipcRenderer.removeListener('aft:api:state-changed', handler)
    }
  }
}

contextBridge.exposeInMainWorld('aftApi', aftApi)
