import { contextBridge, ipcRenderer } from 'electron'

const api = {
  execute: (action: unknown) => ipcRenderer.invoke('agent:execute', action),
  setVision: (on: boolean) => ipcRenderer.invoke('agent:vision', on),
  home: () => ipcRenderer.invoke('agent:home'),
  versions: process.versions
}

contextBridge.exposeInMainWorld('agent', api)
console.log('[PRELOAD] yuklendi')
