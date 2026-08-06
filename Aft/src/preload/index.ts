import { contextBridge, ipcRenderer } from 'electron'

const api = {
  execute: (action: unknown) => ipcRenderer.invoke('aft:execute', action),
  setVision: (on: boolean) => ipcRenderer.invoke('aft:vision', on),
  home: () => ipcRenderer.invoke('aft:home'),
  versions: process.versions
}

contextBridge.exposeInMainWorld('aft', api)
console.log('[PRELOAD] yuklendi')
