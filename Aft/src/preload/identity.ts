import { contextBridge, ipcRenderer } from 'electron'

const identity = {
  capture: (ordinal: number) => ipcRenderer.invoke('aft:identity:capture', ordinal),
  resolve: (descriptorId: string) => ipcRenderer.invoke('aft:identity:resolve', descriptorId),
  project: (kind: string) => ipcRenderer.invoke('aft:identity:project', kind),
  validate: () => ipcRenderer.invoke('aft:identity:validate'),
  list: () => ipcRenderer.invoke('aft:identity:list'),
  remove: (descriptorId: string) => ipcRenderer.invoke('aft:identity:remove', descriptorId),
  approvals: () => ipcRenderer.invoke('aft:identity:approvals'),
  approve: (descriptorId: string) => ipcRenderer.invoke('aft:identity:approve', descriptorId),
  reject: (descriptorId: string) => ipcRenderer.invoke('aft:identity:reject', descriptorId),
  stats: (descriptorId: string) => ipcRenderer.invoke('aft:identity:stats', descriptorId)
}

contextBridge.exposeInMainWorld('aftIdentity', identity)
