import { contextBridge, ipcRenderer } from 'electron'

const api = {
  execute: (action: unknown) => ipcRenderer.invoke('aft:execute', action),
  setVision: (on: boolean) => ipcRenderer.invoke('aft:vision', on),
  home: () => ipcRenderer.invoke('aft:home'),
  back: () => ipcRenderer.invoke('aft:back'),
  forward: () => ipcRenderer.invoke('aft:forward'),
  reload: () => ipcRenderer.invoke('aft:reload'),
  versions: process.versions
}

contextBridge.exposeInMainWorld('aft', api)
console.log('[PRELOAD] yuklendi')
