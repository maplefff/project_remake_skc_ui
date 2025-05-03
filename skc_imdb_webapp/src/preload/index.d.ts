import { ElectronAPI } from '@electron-toolkit/preload'
import type { InitialDataResponse, MovieSession, SKCMovie, IpcApi } from '../shared/ipc-interfaces'

declare global {
  interface Window {
    electron: ElectronAPI
    ipc: IpcApi
  }
}
