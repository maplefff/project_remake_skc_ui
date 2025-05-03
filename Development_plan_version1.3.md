# Development Plan for Version 1.3 - 場次連結到官網選位

**目標:** 讓應用程式中的電影場次時間可點擊，點擊後在外部瀏覽器開啟對應到新光影城官網的選位頁面。

**核心挑戰:** 確定如何為每個獨立場次生成正確的選位網址，需要找到原始 Session 資料中的唯一識別碼，並分析官網選位 URL 的結構。

---

## 階段 3.1：網頁結構探查與資料發現 (新)

1.  **建立研究環境：** 在專案根目錄 (`/Users/wu_cheng_yan/cursor/project_remake_skc_ui/`) 下建立新的子目錄 `skc_session_study`。
2.  **開發探查腳本：** 在 `skc_session_study` 目錄中，建立一個簡單的 Node.js 腳本 (例如 `skc_navigator.js`)，使用 Playwright：
    *   以**非無頭模式 (`headless: false`)** 啟動瀏覽器。
    *   導航到 `https://www.skcinemas.com/sessions?c=1004`。
    *   (可選) 加入代碼以打印頁面 URL、標題、監聽網路請求或瀏覽器控制台訊息到 Node.js 終端。
    *   保持瀏覽器開啟，允許手動操作和檢查 (例如使用 `await page.pause();` 或長時間等待)。
3.  **手動分析：** 運行此腳本，在開啟的瀏覽器中：
    *   使用瀏覽器的開發者工具 (按右鍵 -> Inspect 或 F12)。
    *   找到代表**可點擊場次時間**的 HTML 元素。
    *   點擊某個場次，同時觀察開發者工具的 **Network** 標籤，查看觸發的請求和目標 URL。
    *   分析該目標 URL 的結構，找出其中的**唯一場次識別碼**。
4.  **關聯資料：** 將在 URL 中找到的場次識別碼與之前從 SK Cinema API (`GetSessionByCinemasIDForApp`) 獲取的原始 `sessionData` 中的欄位進行比對，確認哪個欄位包含這個識別碼 (`SessionID`)。

## 階段 3.2：更新資料處理與介面 (原步驟 3.2)

1.  根據階段 3.1 的發現，更新 `skc_imdb_webapp/src/shared/ipc-interfaces.ts` 中的 `SKCSession` 介面，加入儲存場次識別碼的欄位 (`sessionId: string;`)。
2.  修改 `skc_imdb_webapp/src/main/scraper/skcScraper.ts` 中的 `processSkcData` 函數：
    *   從原始 `rawSession` 提取 `SessionID` 並存儲到 `formattedSessions`。
    *   **新增：** 在組合 `CombinedMovieData` 時，**僅包含那些 `formattedSessions` 陣列不為空的電影**，即直接過濾掉沒有任何有效場次的電影。
3.  確保主行程 (`main/index.ts`) 接收並使用這個**已過濾**的電影列表 (`moviesWithSessions`)。

## 階段 3.3：前端實現連結功能 (原步驟 3.3)

1.  修改 `skc_imdb_webapp/src/renderer/src/App.vue`：
    *   將場次時間顯示元素改為可點擊。
    *   在點擊事件中獲取場次識別碼 (`sessionId`)。
    *   根據階段 3.1 發現的 URL 結構 (`https://www.skcinemas.com/booking/seats?c=1004&s={sessionId}`)，動態生成完整的選位網址。
    *   調用新的 IPC 函數 (`window.ipc.openExternalUrl`) 請求開啟連結。

## 階段 3.4：後端實現連結開啟 (原步驟 3.4)

1.  在 `skc_imdb_webapp/src/shared/ipc-interfaces.ts` 中定義新的 IPC Channel (`OPEN_EXTERNAL_URL`) 和對應的 API 接口。
2.  在 `skc_imdb_webapp/src/main/index.ts` 中：
    *   實現對應的 `ipcMain.handle`，使用 `shell.openExternal` 開啟經過驗證的 URL。
    *   **調整：** 更新 `handleGetCombinedMovieData` 中設置資料狀態的邏輯，將欄位 `dataStatus` 更名為 `imdbStatus`。
3.  在 `skc_imdb_webapp/src/preload/index.ts` 中暴露此 IPC API (`openExternalUrl`)。

## 階段 3.5：整合測試 (原步驟 3.5)

1.  在應用程式中測試點擊不同場次，驗證是否能正確開啟對應的選位頁面。
2.  確認應用程式啟動時，不會顯示沒有場次的電影。
3.  驗證前端顯示的 IMDb 狀態（來自 `imdbStatus`）是否正確反映資料來源。 