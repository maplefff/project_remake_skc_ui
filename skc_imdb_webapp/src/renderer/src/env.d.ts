/// <reference types="vite/client" />

// Import the interface defining the API shape
import type { IpcApi } from '../shared/ipc-interfaces';

// Extend the global Window interface
declare global {
  interface Window {
    ipc?: IpcApi; // Changed from electronAPI to ipc
  }
}
