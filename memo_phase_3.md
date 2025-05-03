# 階段三備忘錄：IMDb 資訊爬蟲與整合

**日期:** 2024-07-28

**主要目標:** 抓取與 SK Cinema 電影對應的 IMDb 詳細資訊（評分、劇情、類型、演職員等），並將其與 SKC 資料合併。

**關鍵成果與步驟:**

1.  **共享介面更新 (`src/shared/ipc-interfaces.ts`):**
    *   將 `SKCMovie` 重命名並擴展為 `CombinedMovieData`，加入 IMDb 相關的可選欄位 (`imdbRating`, `imdbUrl`, `plot`, `genres`, `directors`, `cast`)。
    *   重新設計 IPC 結構，定義了三個主要通道：
        *   `GET_SKC_RAW_DATA`: 獲取 SKC 原始 JSON。
        *   `GET_IMDB_RAW_DATA`: 獲取單部電影的原始/半處理 IMDb 資料，接收 `GetImdbRawDataInput` (包含電影標題)，返回 `ImdbRawDataPayload`。
        *   `GET_COMBINED_MOVIE_DATA`: 觸發完整流程，返回最終的 `CombinedMovieData[]`。
    *   相應更新了 Payload、Handler 和 Renderer 類型定義，以及 `IpcApi` 介面。

2.  **IMDb 爬蟲實現 (`src/main/scraper/imdbScraper.ts`):**
    *   創建了 `fetchRawImdbData` 函數：
        *   接收 `GetImdbRawDataInput` 和可選的 Playwright `BrowserContext`。
        *   添加標題預處理邏輯，移除 "電影日" 字樣後再搜索。
        *   實現了 `searchMovieOnImdb` 輔助函數，使用 `FilmName` 搜索 IMDb，並使用驗證過的選擇器 (`ul[class^="ipc-metadata-list"] li a[href^="/title/tt"]`) 查找第一個結果連結。
        *   實現了 `extractJsonLd` 輔助函數，優先嘗試從電影詳情頁提取 `@type: Movie` 的 JSON-LD 資料。
        *   實現了 `fallbackScraping` 輔助函數，在 JSON-LD 失敗時，使用 CSS 選擇器嘗試抓取評分、劇情、類型、導演、演員等資訊。
        *   如果接收了 `existingContext`，則重用它創建頁面；否則自行啟動/關閉瀏覽器 (用於獨立調試)。
    *   創建了 `processImdbData` 函數，用於將 `ImdbRawDataPayload` 格式化為 `Partial<CombinedMovieData>`。

3.  **主行程整合 (`src/main/index.ts`):**
    *   實現並註冊了 `handleGetImdbRawData` 來處理 `GET_IMDB_RAW_DATA` 請求。
    *   實現並註冊了 `handleGetCombinedMovieData` 來處理 `GET_COMBINED_MOVIE_DATA` 請求：
        *   調用 `fetchRawSkcData` 和 `processSkcData` 獲取基礎電影列表。
        *   **啟動單一共享的 Playwright 瀏覽器和上下文 (`BrowserContext`)。**
        *   使用 `Promise.all` **並行地**為所有電影調用 `fetchRawImdbData`，並傳入共享的上下文。
        *   等待所有 IMDb 抓取完成後，**關閉共享的瀏覽器**。
        *   將獲取的 IMDb 資料合併回 `CombinedMovieData` 陣列。
        *   按 IMDb 評分對最終陣列進行**降序排序**。
        *   添加了詳細的控制台日誌記錄，包括步驟信息和樣本數據。
        *   處理了過程中可能出現的錯誤。

4.  **前端整合與測試 (`src/renderer/src/components/MovieList.vue`):**
    *   修改 `onMounted` 鉤子，調用 `window.ipc.getCombinedMovieData` 來獲取完整數據。
    *   更新 `movies` ref 的類型為 `CombinedMovieData[]`。
    *   在卡片上顯示 `movie.imdbRating`。
    *   添加了調試按鈕 "Fetch IMDb Raw (First Movie)"，用於觸發 `GET_IMDB_RAW_DATA`。
    *   添加了控制台日誌，打印從主行程接收到的完整數據。

5.  **IMDb 選擇器調試:**
    *   創建了獨立的測試環境 `playwright_study` 和測試腳本 `imdb_test.js`。
    *   在 `playwright_study` 目錄安裝了 `playwright` 及 Chromium。
    *   通過測試腳本驗證了來自舊專案的選擇器 (`ul[class^="ipc-metadata-list"] li a[href^="/title/tt"]`) 的有效性，並將其應用到 `imdbScraper.ts` 中。

6.  **深色主題:**
    *   修改了 `index.html`，在 `<html>` 標籤添加 `class="dark"`。
    *   在 `App.vue` 中添加了 CSS 規則強制 `html.dark body` 的背景色，確保主題生效。

**遇到的主要問題與解決:**

*   **IMDb 抓取效能:** 最初串行抓取 IMDb 非常慢，通過引入共享 `BrowserContext` 和 `Promise.all` 實現了並行抓取，顯著提高了效率。
*   **IMDb 選擇器失效:** 原選擇器失效，通過獨立測試環境驗證並採用了舊專案中更可靠的選擇器。
*   **類型錯誤:** 在合併數據時出現 TypeScript 類型不匹配，通過確保將 `undefined` 轉換為 `null` 解決。
*   **缺少依賴:** 獨立測試腳本無法找到 Playwright 模組，通過在測試腳本所在目錄單獨安裝解決。
*   **標題干擾:** "電影日" 等字樣影響 IMDb 搜索，添加了標題預處理邏輯。
*   **深色主題未立即生效:** 通過在 `index.html` 和 `App.vue` 中同時處理來確保。

**狀態:** IMDb 資料抓取、與 SKC 資料的合併、並行處理優化、排序及相關 IPC 通道均已完成。前端列表現在能顯示包含 IMDb 評分的合併數據。階段三目標達成。 