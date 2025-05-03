import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import {
  IpcChannels,
  type GetInitialDataRenderer,
  type ButtonClickedRenderer,
  type GetSkcRawDataRenderer,
  type GetImdbRawDataRenderer,
  type GetCombinedMovieDataRenderer,
  type GetImdbRawDataInput,
  type LoadingProgressPayload,
  type OpenExternalUrlRenderer
} from '../shared/ipc-interfaces'

// Custom APIs for renderer
const api = {
  electron: electronAPI
}

// 定義要暴露的 IPC API
const ipcApi = {
  getInitialData: (): ReturnType<GetInitialDataRenderer> =>
    ipcRenderer.invoke(IpcChannels.GET_INITIAL_DATA),
  sendButtonClickMessage: (message: string): ReturnType<ButtonClickedRenderer> =>
    ipcRenderer.invoke(IpcChannels.BUTTON_CLICKED, message),
  getSkcRawData: (): ReturnType<GetSkcRawDataRenderer> =>
    ipcRenderer.invoke(IpcChannels.GET_SKC_RAW_DATA),
  getImdbRawData: (input: GetImdbRawDataInput): ReturnType<GetImdbRawDataRenderer> =>
    ipcRenderer.invoke(IpcChannels.GET_IMDB_RAW_DATA, input),
  getCombinedMovieData: (): ReturnType<GetCombinedMovieDataRenderer> =>
    ipcRenderer.invoke(IpcChannels.GET_COMBINED_MOVIE_DATA),
  onUpdateLoadingProgress: (callback: (payload: LoadingProgressPayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: LoadingProgressPayload) => callback(payload);
    ipcRenderer.on('update-loading-progress', listener);
    return () => {
      ipcRenderer.removeListener('update-loading-progress', listener);
      console.log('[Preload] Removed loading progress listener.');
    };
  },
  openExternalUrl: (url: string): ReturnType<OpenExternalUrlRenderer> => 
    ipcRenderer.invoke(IpcChannels.OPEN_EXTERNAL_URL, url)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', api.electron)
    contextBridge.exposeInMainWorld('ipc', ipcApi)
    console.log('[Preload] Successfully exposed electron and ipc APIs.');
  } catch (error) {
    console.error('[Preload] Failed to expose APIs:', error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = api.electron
  // @ts-ignore (define in dts)
  window.ipc = ipcApi
   console.warn('[Preload] Context Isolation is disabled. APIs exposed directly to window object.');
}
