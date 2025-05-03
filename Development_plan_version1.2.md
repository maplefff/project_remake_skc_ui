# Development Plan for Version 1.2 - 快取機制 (Revised)

**目標:** 實作 IMDb 資料和電影海報的快取機制，分階段進行，先完成海報快取並測試，再完成 IMDb 快取並進行最終測試。

**儲存策略:**
*   使用 `electron-store` 儲存 IMDb 資料、海報檔案路徑和時間戳。
*   使用本地檔案系統的專用目錄 (`userData/imageCache`) 儲存海報圖片檔案。
*   SKC 場次資料每次啟動重新獲取，不快取。

**快取有效時間:**
*   IMDb 資料: 24 小時
*   海報圖片: 168 小時 (7 天)

**IMDb 抓取失敗處理:**
*   `dataStatus` 標記為 `failed`。
*   不使用過期快取。

---

## 階段一：實作海報快取

### 步驟 1.1：環境設置 (部分)

1.  **安裝 `electron-store`:**
    *   在終端機中，進入 `skc_imdb_webapp` 目錄。
    *   執行 `npm install electron-store` 或 `yarn add electron-store`。
2.  **初始化 `electron-store`:**
    *   在 Electron 的主行程檔案（例如 `src/main/index.ts`）中，導入並初始化 `electron-store`。
    *   (建議) 定義 Schema，至少包含 `posterCache` 結構：
      ```typescript
      // Example for posterCache
      posterCache: {\n          type: \'object\',\n          additionalProperties: {\n              type: \'object\',\n              properties: {\n                  timestamp: { type: \'number\' },\n                  filePath: { type: \'string\' } \n              }\n          }\n      }\n      ```
3.  **建立圖片快取目錄:**
    *   在主行程中，導入 `path` 和 `fs` 模組。
    *   獲取 `app.getPath(\'userData\')`。
    *   組合出圖片快取目錄路徑 (例如 `path.join(app.getPath(\'userData\'), \'imageCache\')`)。
    *   使用 `fs.mkdirSync(cachePath, { recursive: true })` 確保目錄存在。

### 步驟 1.2：實作海報圖片快取

1.  **修改海報處理邏輯** (例如在處理 SKC 資料後，組合 `CombinedMovieData` 的流程中):
    *   對於每個需要處理海報的電影 (已知 `posterUrl` 和 `filmNameID`):
        *   讀取 `store.get(\`posterCache.${filmNameID}\`)`。
        *   檢查快取是否存在及時間戳是否在 168 小時內。
        *   **快取命中 (有效):**
            *   獲取快取的 `filePath`。
            *   使用 `fs.existsSync(filePath)` 檢查檔案是否存在。
            *   若檔案存在，將 `filePath` 賦給後續步驟使用的變數 (例如 `cachedPosterPath`)。
            *   跳過下載步驟。
        *   **快取未命中、過期或檔案遺失:**
            *   執行圖片下載邏輯 (需要 `axios` 或內建的 `net` 模組來下載圖片 Buffer)。
            *   **下載成功:**
                *   產生檔名 (例如 `filmNameID + path.extname(posterUrl)` 或使用 hash)。
                *   組合完整儲存路徑 `newFilePath` (在 `imageCache` 目錄下)。
                *   將下載的圖片 Buffer 寫入檔案 `fs.writeFileSync(newFilePath, imageDataBuffer)`。
                *   更新 `store.set(\`posterCache.${filmNameID}\`, { timestamp: Date.now(), filePath: newFilePath });`。
                *   將 `newFilePath` 賦給後續步驟使用的變數 (例如 `cachedPosterPath`)。
            *   **下載失敗:**
                *   記錄錯誤。
                *   確保後續步驟使用的 `cachedPosterPath` 為 `null` 或空。

### 步驟 1.3：更新介面與 IPC (海報部分)

1.  **修改 `CombinedMovieData` 介面** (`src/shared/ipc-interfaces.ts`):
    *   新增 `posterPath: string | null;` (用來傳遞本地檔案路徑)。
    *   考慮是否保留 `posterUrl` 作為備用或僅用於下載。
2.  **調整主行程組合邏輯:** 在組合最終的 `CombinedMovieData` 時，將步驟 1.2 得到的 `cachedPosterPath` 賦值給 `posterPath` 欄位。
3.  **調整主行程 IPC 回應:** 確保 `getCombinedMovieData` 的事件處理函數返回的 `CombinedMovieData[]` 包含 `posterPath`。
4.  **調整渲染行程 (`App.vue`)**: 
    *   修改 `<el-image>` 的 `:src` 綁定。需要將檔案路徑轉換為 Electron 可以識別的格式。可以使用 `electron-is-dev` 搭配 `path.join` 或直接傳遞 `file://` URL。 **(注意：直接綁定本地絕對路徑可能因安全策略而失效，轉換為 `file://` URL 或使用自訂協議通常是必要的)**。

### 步驟 1.4：測試與打包 (海報快取)

1.  **測試:**
    *   **首次啟動:** 驗證海報是否下載，`imageCache` 目錄是否生成圖片，`electron-store` 是否有 `posterCache` 記錄。
    *   **短期內重啟:** 驗證海報是否從本地檔案加載 (檢查開發者工具網絡請求)，應用啟動是否變快。
    *   **過期後重啟 (手動修改時間戳或等待):** 驗證海報是否重新下載並更新快取。
    *   **下載失敗:** 驗證是否能正常顯示佔位符或錯誤提示，且快取未被錯誤更新。
    *   **手動刪除 `imageCache` 中的檔案:** 驗證下次啟動時是否能檢測到檔案遺失並重新下載。
2.  **(可選) 打包:** 執行打包命令，生成只包含海報快取功能的測試版本。

---

## 階段二：實作 IMDb 快取

### 步驟 2.1：實作 IMDb 資料快取

1.  **修改 IMDb 資料獲取邏輯** (例如 `src/main/scraper/imdbScraper.ts` 或相關處理函數):
    *   在嘗試為某電影抓取 IMDb 資料**之前**：
        *   讀取 `store.get(\`imdbCache.${filmNameID}\`)`。
        *   檢查快取是否存在及其 `timestamp` 是否在 24 小時內。
    *   **快取命中 (有效):**
        *   直接使用 `cache.data` 作為 IMDb 結果。
        *   設定 `dataStatus = \'cache\'`。
        *   跳過網路抓取。
    *   **快取未命中或過期:**
        *   執行現有的 IMDb 網路抓取邏輯。
        *   **抓取成功:**
            *   將獲取的 IMDb 資料和 `Date.now()` 存入 `store.set(\`imdbCache.${filmNameID}\`, { timestamp: Date.now(), data: fetchedData });`。
            *   設定 `dataStatus = \'live\'`。
        *   **抓取失敗:**
            *   記錄錯誤。
            *   設定 `dataStatus = \'failed\'`。
            *   IMDb 相關欄位應為預設值或錯誤標識。

### 步驟 2.2：更新介面與 IPC (IMDb 部分)

1.  **修改 `CombinedMovieData` 介面** (`src/shared/ipc-interfaces.ts`):
    *   新增 `dataStatus: \'live\' | \'cache\' | \'failed\';`
2.  **調整主行程組合邏輯:** 在組合最終的 `CombinedMovieData` 時，將步驟 2.1 得到的 `dataStatus` 賦值給 `dataStatus` 欄位。
3.  **調整主行程 IPC 回應:** 確保 `getCombinedMovieData` 返回的 `CombinedMovieData[]` 包含 `dataStatus`。
4.  **(可選) 調整渲染行程 (`App.vue`)**: 
    *   根據 `dataStatus` 在 UI 上添加視覺提示 (例如評分旁邊的小圖示)。

### 步驟 2.3：最終測試與打包

1.  **測試:**
    *   測試所有快取場景的組合：
        *   IMDb 快取有效，海報快取有效。
        *   IMDb 快取過期，海報快取有效。
        *   IMDb 快取有效，海報快取過期。
        *   兩者都過期。
    *   模擬 IMDb 抓取失敗的情況，驗證 `dataStatus` 是否為 `failed`，以及相關欄位是否正確處理。
    *   驗證應用程式的整體啟動速度和響應。
2.  **打包:** 執行打包命令，生成包含完整快取功能的 Version 1.2.0。

---

## 階段三：實作 SKC 原始資料快取 (新)

**目標:** 快取 SKC 的 `homePageData` 和 `sessionData`，有效期至當天結束。

### 步驟 3.1：更新 Store Schema

1.  **修改 `src/main/index.ts`:**
    *   更新 `CacheSchema` 介面，加入 `skcRawDataCache` 結構：
      ```typescript
      skcRawDataCache: { fetchDate: string; data: SkcRawDataPayload };
      ```
    *   更新 `electron-store` 的 `schema` 常數，加入 `skcRawDataCache` 的定義。

### 步驟 3.2：實作 SKC 快取讀寫邏輯

1.  **修改 `src/main/index.ts` 中的 `handleGetCombinedMovieData` 函數:**
    *   在函數開頭，獲取當前日期字串 (YYYY-MM-DD)。
    *   讀取 `store.get('skcRawDataCache')`。
    *   **快取檢查:**
        *   如果快取存在，比較快取中的 `fetchDate` 與當前日期。
        *   **快取命中 (日期相同):**
            *   記錄 `[SKC Cache] HIT`。
            *   將快取的 `data` (包含 `homePageData` 和 `sessionData`) 賦值給局部變數。
            *   跳過 `fetchRawSkcData` 的網路請求調用。
        *   **快取未命中/過期 (日期不同或無快取):**
            *   記錄 `[SKC Cache] MISS` 或 `[SKC Cache] EXPIRED`。
            *   **調用 `fetchRawSkcData` 進行網路請求。**
            *   **請求成功後:**
                *   獲取當前日期字串。
                *   將返回的 `skcRawData` 和當前日期存入 `store.set('skcRawDataCache', { fetchDate: currentDate, data: skcRawData });`。
            *   如果 `fetchRawSkcData` 失敗，確保後續邏輯能處理 `skcRawData` 為 `null` 或包含錯誤標識的情況。

### 步驟 3.3：測試 SKC 快取

1.  **測試:**
    *   **首次啟動:** 驗證是否執行網路請求，`skcRawDataCache` 是否寫入 store。
    *   **當天重啟:** 驗證是否命中快取 (`[SKC Cache] HIT`)，是否跳過網路請求。
    *   **隔天啟動:** 驗證是否識別為過期 (`[SKC Cache] EXPIRED`)，是否執行網路請求並更新快取。

---

## 階段四：最終整合測試與打包 (原階段三)

### 步驟 4.1：最終測試與打包 (原步驟 2.3)

1.  **測試:**
    *   測試所有快取場景的組合 (SKC、IMDb、海報)。
    *   驗證應用程式的整體啟動速度和響應。
2.  **打包:** 執行打包命令，生成包含完整快取功能的 Version 1.2.0。 