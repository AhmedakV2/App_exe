import { contextBridge, ipcRenderer } from 'electron'

const data = {
  runs: (query: unknown) => ipcRenderer.invoke('aft:data:runs', query),
  run: (id: string) => ipcRenderer.invoke('aft:data:run', id),
  report: (id: string) => ipcRenderer.invoke('aft:data:report', id),
  scenarios: () => ipcRenderer.invoke('aft:data:scenarios'),
  health: () => ipcRenderer.invoke('aft:data:health'),
  fragile: (limit: number) => ipcRenderer.invoke('aft:data:fragile', limit),
  outbox: () => ipcRenderer.invoke('aft:data:outbox'),
  flush: (limit: number) => ipcRenderer.invoke('aft:data:flush', limit),
  reconcile: () => ipcRenderer.invoke('aft:data:reconcile'),
  sweep: () => ipcRenderer.invoke('aft:data:sweep'),
  stats: () => ipcRenderer.invoke('aft:data:stats')
}
contextBridge.exposeInMainWorld('aftData', data)
