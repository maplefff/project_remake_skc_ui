# 開發階段一：環境設定與基礎架構

**對應主計畫階段:** [階段一：環境設定與基礎架構](Development_plan.md#階段一環境設定與基礎架構-setup--foundation)

**目標:** 確保開發環境正常運作，Element Plus 可用並應用了與截圖一致的精確深色主題，前後端可以通過 IPC 進行基本通訊。

## 詳細任務分解

### 1. 初始化專案結構

*   **任務:** 使用 `electron-vite` 腳手架初始化一個包含 Vue 和 TypeScript 的 Electron 專案。
*   **步驟:**
    1.  開啟終端機，`cd` 到父目錄 `/Users/wu_cheng_yan/cursor/project_remake_skc_ui/`。
    2.  執行 `npm create @quick-start/electron` 或 `yarn create @quick-start/electron` (根據偏好選擇包管理器)。
    3.  當提示輸入專案名稱時，輸入 `skc_imdb_webapp`。
    4.  當提示選擇框架時，選擇 `Vue`。
    5.  當提示選擇變體時，選擇 `TypeScript`。
    6.  根據提示，進入新創建的專案目錄: `cd /Users/wu_cheng_yan/cursor/project_remake_skc_ui/skc_imdb_webapp`。
    7.  安裝依賴: `npm install` 或 `yarn install`。
*   **驗證:**
    *   執行 `npm run dev` 或 `yarn dev`。
    *   應能成功啟動 Electron 應用程式，並顯示預設的 Vue 頁面。
*   **可能挑戰:** 確保 Node.js 和對應的包管理器 (npm/yarn) 已正確安裝並配置好環境變數。

### 2. 整合 Element Plus 及配置主題

*   **任務:** 將 Element Plus UI 元件庫整合到 Vue 專案中，並配置全局樣式以匹配參考截圖 (`UI_example.png`) 的深色主題。
*   **步驟:**
    1.  在專案根目錄 `/Users/wu_cheng_yan/cursor/project_remake_skc_ui/skc_imdb_webapp` 下，執行 `npm install element-plus` 或 `yarn add element-plus`。
    2.  **全局引入:** 修改 `src/main.ts` 文件，引入 Element Plus 的 CSS 和插件：
        ```typescript
        import { createApp } from 'vue'
        import App from './App.vue'
        import ElementPlus from 'element-plus'
        import 'element-plus/dist/index.css'
        // 引入深色主題 CSS (如果 Element Plus 提供單獨的深色主題文件，否則需要自訂)
        // import 'element-plus/theme-chalk/dark/css-vars.css' // 示例，實際路徑可能不同
        import './styles/index.css' // 引入我們的全局樣式

        const app = createApp(App)
        app.use(ElementPlus)
        app.mount('#app')
        ```
    3.  **配置精確主題:**
        *   創建 `src/styles/theme.css` (或類似文件)。
        *   分析 `UI_example.png` 截圖中的主要顏色：背景色、卡片背景色、文字顏色、按鈕藍色、邊框顏色等。
        *   在 `theme.css` 中定義 CSS 自訂屬性 (CSS Variables) 來覆蓋 Element Plus 的預設樣式或定義我們自己的主題顏色。例如：
            ```css
            /* src/styles/theme.css */
            :root {
              /* 整體背景色 */
              --app-bg-color: #202124; /* 示例顏色，需根據截圖調整 */
              /* 卡片背景色 */
              --card-bg-color: #2d2e30; /* 示例顏色 */
              /* 主要文字顏色 */
              --text-primary-color: #e8eaed; /* 示例顏色 */
              /* 次要文字顏色 */
              --text-secondary-color: #bdc1c6; /* 示例顏色 */
              /* 按鈕/重點藍色 */
              --el-color-primary: #8ab4f8; /* 嘗試匹配截圖藍色 */
              /* ... 其他需要的顏色變數 ... */

              /* 覆蓋 Element Plus 的一些 CSS 變數 (如果需要) */
              --el-bg-color: var(--app-bg-color);
              --el-text-color-primary: var(--text-primary-color);
              --el-text-color-regular: var(--text-secondary-color);
              /* ... 可能需要覆蓋更多 Element Plus 變數 ... */
            }

            /* 應用全局背景色 */
            body {
              background-color: var(--app-bg-color);
            }
            ```
        *   在 `src/styles/index.css` 中引入 `theme.css` (`@import './theme.css';`)。
        *   **啟用 Element Plus 深色模式:** 在 `index.html` 的 `<html>` 標籤上添加 `class="dark"`，如果 Element Plus 依賴此 class 來應用深色變數。
            ```html
            <html lang="en" class="dark">
              <!-- ... -->
            </html>
            ```
*   **驗證:**
    *   重新運行 `npm run dev` 或 `yarn dev`。
    *   在 `src/App.vue` 中臨時添加幾個 Element Plus 元件 (如 `ElButton`, `ElCard`)。
    *   檢查應用程式的背景色、文字顏色以及添加的元件是否大致符合深色主題，特別是主要藍色調是否與截圖接近。
*   **可能挑戰:** 精確匹配顏色需要反覆調試 CSS 變數。Element Plus 的深色主題實現方式可能需要查閱其官方文檔。

### 3. 配置 Electron 主行程與預載腳本

*   **任務:** 熟悉 `electron/main/index.ts` 和 `electron/preload/index.ts` 的基本結構，確保主行程能創建視窗並加載 Vue 應用。
*   **步驟:**
    1.  查看 `electron/main/index.ts`，理解創建瀏覽器視窗 (`BrowserWindow`) 的基本流程。
    2.  查看 `BrowserWindow` 構造函數中的 `webPreferences` 選項，特別是 `preload` 指向 `electron/preload/index.ts` 的路徑。
    3.  查看 `electron/preload/index.ts` 的內容，理解其作為主行程和渲染行程之間的橋樑的作用（目前可能為空或只有基礎示例）。
*   **驗證:** 項目能成功啟動，表明主行程和預載腳本的基本配置是有效的。
*   **可能挑戰:** 理解 Electron 的主行程與渲染行程分離的概念，以及預載腳本的作用和限制。

### 4. 建立基礎 IPC 通訊

*   **任務:** 創建一個簡單的 IPC 通道，允許渲染行程向主行程發送消息，主行程處理後回應。
*   **步驟:**
    1.  **定義共享接口 (建議):** 在 `src/types/ipc.ts` (如果不存在則創建) 中定義通訊用的通道名稱和可能的資料結構：
        ```typescript
        // src/types/ipc.ts
        export interface IpcChannels {
          PING: 'ipc-ping';
        }
        ```
    2.  **主行程處理 (electron/main/ipcHandlers.ts 或 index.ts):** 使用 `ipcMain.handle` 監聽來自渲染行程的請求。
        ```typescript
        // electron/main/index.ts 或 ipcHandlers.ts
        import { ipcMain } from 'electron';
        // import { IpcChannels } from '../../src/types/ipc'; // 調整路徑

        // 假設通道名稱直接用字符串
        ipcMain.handle('ipc-ping', async (event, arg) => {
          console.log('[Main Process] Received ping:', arg);
          await new Promise(resolve => setTimeout(resolve, 500)); // 模擬異步操作
          return 'pong';
        });
        ```
        *   如果創建了 `ipcHandlers.ts`，需要在 `electron/main/index.ts` 中導入並執行它。
    3.  **預載腳本暴露接口 (electron/preload/index.ts):** 安全地將調用主行程的方法暴露給渲染行程。
        ```typescript
        // electron/preload/index.ts
        import { contextBridge, ipcRenderer } from 'electron';
        // import { IpcChannels } from '../../src/types/ipc'; // 調整路徑

        contextBridge.exposeInMainWorld('electronAPI', {
          // 異步調用，對應 ipcMain.handle
          invokePing: (message: string): Promise<string> => ipcRenderer.invoke('ipc-ping', message),
          // 如果需要主行程主動發消息給渲染進程，可以用 ipcRenderer.on
          // onSomeEvent: (callback) => ipcRenderer.on('some-event', callback)
        });

        // 如果使用 TypeScript，可能需要擴展全局 Window 類型
        // declare global {
        //   interface Window {
        //     electronAPI: {
        //       invokePing: (message: string) => Promise<string>;
        //     }
        //   }
        // }
        ```
    4.  **渲染行程調用 (例如 src/App.vue):** 在 Vue 元件中通過 `window.electronAPI` 調用暴露的方法。
        ```vue
        <script setup lang="ts">
        import { ref, onMounted } from 'vue';

        const ipcResponse = ref('');

        async function sendPing() {
          try {
            // 檢查 electronAPI 是否存在
            if (window.electronAPI && typeof window.electronAPI.invokePing === 'function') {
              const result = await window.electronAPI.invokePing('Hello from Renderer!');
              console.log('[Renderer Process] Received pong:', result);
              ipcResponse.value = `Received: ${result}`;
            } else {
              console.error('electronAPI or invokePing is not available.');
              ipcResponse.value = 'IPC not available.';
            }
          } catch (error) {
            console.error('Error invoking ping:', error);
            ipcResponse.value = `Error: ${error}`;
          }
        }

        onMounted(() => {
          // 可以在掛載後自動發送一次 ping
          sendPing();
        });
        </script>

        <template>
          <!-- ... 其他模板內容 ... -->
          <el-button @click="sendPing">Send Ping</el-button>
          <p>IPC Response: {{ ipcResponse }}</p>
        </template>
        ```
*   **驗證:**
    *   運行 `npm run dev` 或 `yarn dev`。
    *   應用程式啟動後，控制台應輸出主行程收到的 ping 消息。
    *   稍等片刻後，渲染行程控制台應輸出收到的 pong 回應，並且頁面上顯示 "Received: pong"。
    *   點擊 "Send Ping" 按鈕應能重複此過程。
*   **可能挑戰:** 理解 `contextBridge` 的安全性限制，正確處理異步的 `ipcMain.handle` 和 `ipcRenderer.invoke`，以及在 TypeScript 環境下正確聲明 `window` 對象上的擴展 API。

### 5. 檢查 TypeScript 配置

*   **任務:** 快速瀏覽項目中的 `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json` 文件，確保基本配置合理。
*   **步驟:**
    1.  查看根 `tsconfig.json` 是否包含對 `tsconfig.node.json` 和 `tsconfig.web.json` 的引用。
    2.  查看 `tsconfig.node.json`，確認 `module` 通常設置為 `CommonJS`，`target` 設置為合適的 Node.js 版本。
    3.  查看 `tsconfig.web.json`，確認 `module` 通常設置為 `ESNext`，`target` 設置為瀏覽器兼容的版本（如 `ESNext`），並包含 Vue 相關的編譯器選項。
*   **驗證:** 之前的步驟中 TypeScript 程式碼能夠正常編譯和運行。
*   **可能挑戰:** 如果遇到 TypeScript 編譯錯誤，可能需要根據錯誤信息調整配置。

## 階段產出物

*   一個基礎的 Vue + TypeScript + Electron 項目骨架。
*   整合了 Element Plus 並配置了初步的深色主題。
*   建立了一個可工作的基礎 IPC 通訊通道。
*   確認了 TypeScript 配置基本可用。 