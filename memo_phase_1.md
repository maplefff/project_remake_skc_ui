# 階段一：環境設定與基礎架構 - 開發紀錄

本階段旨在建立 Electron + Vue 3 + TypeScript 專案的基礎結構，配置 UI 框架 (Element Plus)，並設定基本的 IPC 通訊機制。

## 主要步驟與成果：

1.  **專案初始化：**
    *   使用 `npm create @quick-start/electron skc_imdb_webapp --template vue-ts` 命令成功初始化專案。
    *   專案根目錄為 `/Users/wu_cheng_yan/cursor/project_remake_skc_ui/skc_imdb_webapp`。
    *   執行 `npm install` 安裝初始依賴。

2.  **安裝 Element Plus：**
    *   執行 `npm install element-plus`。
    *   修改 `src/renderer/src/main.ts`，全局引入 `ElementPlus` 和其 CSS (`import 'element-plus/dist/index.css'`)。

3.  **配置深色主題與自訂樣式：**
    *   創建自訂樣式檔案 `src/renderer/src/styles/index.css`。
    *   在 `src/renderer/src/main.ts` 中引入自訂樣式 (`import './styles/index.css'`)。
    *   修改 `src/renderer/src/App.vue`，在 `onMounted` 鉤子中為 `document.documentElement` 添加 `dark` class，以啟用 Element Plus 深色模式。

4.  **建立基礎 IPC 通訊架構：**
    *   確定主行程 (`src/main/index.ts`)、預載腳本 (`src/preload/index.ts`) 和渲染行程 (`src/renderer/src/App.vue`) 的位置。
    *   創建共享目錄 `src/shared`。
    *   在 `src/shared/ipc-interfaces.ts` 中定義 IPC 通道名稱 (`IpcChannels.GET_INITIAL_DATA`) 和資料介面 (`InitialDataResponse`)。
    *   修改 `src/main/index.ts`：
        *   引入 `IpcChannels` 和 `InitialDataResponse`。
        *   使用 `ipcMain.handle(IpcChannels.GET_INITIAL_DATA, ...)` 監聽來自渲染行程的請求，返回包含訊息和時間戳的 `InitialDataResponse` 物件。
    *   修改 `tsconfig.node.json`，將 `"src/shared/**/*"` 加入 `include` 陣列，解決主行程的 TypeScript 依賴問題。
    *   修改 `src/preload/index.ts`：
        *   引入 `ipcRenderer`, `IpcChannels`, `InitialDataResponse`。
        *   定義 `ipcApi` 物件，包含 `getInitialData` 函式，該函式使用 `ipcRenderer.invoke(IpcChannels.GET_INITIAL_DATA)` 調用主行程處理器。
        *   使用 `contextBridge.exposeInMainWorld('ipc', ipcApi)` 將 `ipcApi` 暴露給渲染行程。
    *   修改 `src/preload/index.d.ts`：
        *   擴展 `Window` 接口，定義 `window.ipc` 及其 `getInitialData` 方法的類型。
    *   修改 `src/renderer/src/App.vue`：
        *   在 `onMounted` 中調用 `window.ipc.getInitialData()`。
        *   使用 `ref` 儲存並在模板中顯示從主行程獲取的數據。

5.  **開發模式測試 (首次)：**
    *   運行 `npm run dev`。
    *   驗證應用程式以深色主題啟動，並成功顯示從主行程透過 IPC 獲取的初始訊息。

6.  **Element Plus 佈局與互動式 IPC 測試頁面：**
    *   修改 `src/renderer/src/App.vue`：
        *   引入 Element Plus 佈局元件 (`ElContainer`, `ElHeader`, `ElAside`, `ElMain`)、按鈕 (`ElButton`) 和訊息提示 (`ElMessage`)。
        *   使用佈局元件構建包含頁首、側邊欄和主要內容區的基本 UI。
        *   將初始 IPC 數據顯示移至頁首。
        *   在主要內容區添加一個 "Test IPC Button"。
        *   實現按鈕點擊事件 `handleButtonClick`：
            *   調用新的 IPC 方法 `window.ipc.sendButtonClickMessage`，發送訊息到主行程。
            *   接收主行程的回應，並顯示在頁面上。
            *   使用 `ElMessage.success` 或 `ElMessage.error` 提供反饋。
        *   移除或隱藏了原有的預設模板內容和樣式。
    *   修改 `src/main/index.ts`：
        *   添加新的 `ipcMain.handle('button-clicked', ...)`，接收來自渲染行程的訊息，打印到控制台，並回傳確認字串。
    *   修改 `src/preload/index.ts`：
        *   在 `ipcApi` 中添加 `sendButtonClickMessage` 函式，使用 `ipcRenderer.invoke('button-clicked', message)`。
    *   修改 `src/preload/index.d.ts`：
        *   在 `window.ipc` 的類型定義中加入 `sendButtonClickMessage` 方法。

7.  **開發模式測試 (二次)：**
    *   運行 `npm run dev`。
    *   驗證新的 Element Plus 佈局顯示正常。
    *   驗證點擊按鈕能成功觸發雙向 IPC 通訊，並在前端顯示回應及 `ElMessage` 提示，同時主行程控制台打印日誌。

## 結論：

階段一成功完成了專案基礎設定、UI 框架整合和核心 IPC 通訊機制的建立與測試。目前已具備進入下一階段開發爬蟲功能的基礎。 