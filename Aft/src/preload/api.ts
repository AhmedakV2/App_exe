import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'

const aftApi = {
  state: () => ipcRenderer.invoke('aft:api:state'),
  login: (input: unknown) => ipcRenderer.invoke('aft:api:login', input),
  register: (input: unknown) => ipcRenderer.invoke('aft:api:register', input),
  logout: () => ipcRenderer.invoke('aft:api:logout'),
  profile: () => ipcRenderer.invoke('aft:api:profile'),
  changePassword: (input: unknown) => ipcRenderer.invoke('aft:api:change-password', input),
  connect: () => ipcRenderer.invoke('aft:api:connect'),
  disconnect: () => ipcRenderer.invoke('aft:api:disconnect'),
  approve: (callId: string, approved: boolean) =>
    ipcRenderer.invoke('aft:api:approve', { callId, approved }),
  chat: () => ipcRenderer.invoke('aft:agent:chat'),
  ask: (content: string) => ipcRenderer.invoke('aft:agent:send', { content }),
  cancelAsk: () => ipcRenderer.invoke('aft:agent:cancel'),
  newChat: () => ipcRenderer.invoke('aft:agent:reset'),
  removeChat: () => ipcRenderer.invoke('aft:agent:remove'),
  chatHistory: () => ipcRenderer.invoke('aft:agent:history'),
  openChat: (id: string) => ipcRenderer.invoke('aft:agent:open', id),
  deleteChat: (id: string) => ipcRenderer.invoke('aft:agent:drop', id),
  onChat: (fn: (state: unknown) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, state: unknown): void => fn(state)
    ipcRenderer.on('aft:agent:chat', handler)
    return (): void => {
      ipcRenderer.removeListener('aft:agent:chat', handler)
    }
  },
  onAgentLog: (fn: (entry: unknown) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, entry: unknown): void => fn(entry)
    ipcRenderer.on('aft:agent:log', handler)
    return (): void => {
      ipcRenderer.removeListener('aft:agent:log', handler)
    }
  },
  gateDone: (): void => ipcRenderer.send('aft:gate:done'),
  quit: (): void => ipcRenderer.send('aft:app:quit'),
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
