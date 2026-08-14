import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import './identity'
import './playback'
import './record'

const api = {
  execute: (action: unknown) => ipcRenderer.invoke('aft:execute', action),
  setVision: (on: boolean) => ipcRenderer.invoke('aft:vision', on),
  scan: (level: number) => ipcRenderer.invoke('aft:scan', level),
  coverage: () => ipcRenderer.invoke('aft:coverage'),
  nav: (kind: string): void => ipcRenderer.send('aft:nav', kind),
  window: (action: string): void => ipcRenderer.send('aft:window', action),
  setChat: (open: boolean): void => ipcRenderer.send('aft:chat', open),
  setTerminal: (open: boolean): void => ipcRenderer.send('aft:terminal', open),
  startDrag: (axis: string): void => ipcRenderer.send('aft:drag', axis),
  endDrag: (): void => ipcRenderer.send('aft:drag', null),
  setStage: (box: unknown): void => ipcRenderer.send('aft:stage', box),
  setModal: (open: boolean): void => ipcRenderer.send('aft:modal', open),
  setChrome: (color: string): void => ipcRenderer.send('aft:chrome', color),
  requestState: (): void => ipcRenderer.send('aft:state'),
  onState: (fn: (state: unknown) => void): (() => void) => {
    const handler = (_e: IpcRendererEvent, state: unknown): void => fn(state)
    ipcRenderer.on('aft:state', handler)
    return (): void => {
      ipcRenderer.removeListener('aft:state', handler)
    }
  },
  onFocusUrl: (fn: () => void): (() => void) => {
    const handler = (): void => fn()
    ipcRenderer.on('aft:focus-url', handler)
    return (): void => {
      ipcRenderer.removeListener('aft:focus-url', handler)
    }
  },
  onFocusTerminal: (fn: () => void): (() => void) => {
    const handler = (): void => fn()
    ipcRenderer.on('aft:focus-terminal', handler)
    return (): void => {
      ipcRenderer.removeListener('aft:focus-terminal', handler)
    }
  },
  onPointer: (fn: (spot: unknown) => void): (() => void) => {
    const handler = (_e: IpcRendererEvent, spot: unknown): void => fn(spot)
    ipcRenderer.on('aft:pointer', handler)
    return (): void => {
      ipcRenderer.removeListener('aft:pointer', handler)
    }
  },
  onDragEnd: (fn: () => void): (() => void) => {
    const handler = (): void => fn()
    ipcRenderer.on('aft:drag-end', handler)
    return (): void => {
      ipcRenderer.removeListener('aft:drag-end', handler)
    }
  },
  versions: process.versions
}

contextBridge.exposeInMainWorld('aft', api)
