# 階段二備忘錄：SK Cinema 時刻表爬蟲

**日期:** 2024-07-28

**主要目標:** 實現從 SK Cinema 青埔影城網站抓取電影基本資訊和時刻表。

**關鍵成果與步驟:**

1.  **Playwright 安裝與配置:**
    *   在 `skc_imdb_webapp` 目錄安裝了 `playwright` 依賴。
    *   僅下載了 `chromium` 瀏覽器。

2.  **爬蟲實現 (`src/main/scraper/skcScraper.ts`):**
    *   創建了 `fetchRawSkcData` 函數：
        *   使用 Playwright 啟動瀏覽器 (headless)。
        *   導航至 SK Cinema 青埔影城頁面 (`sessions?c=1004`)。
        *   設置監聽器攔截 `/api/VistaDataV2/GetHomePageListForApps` 和 `/GetSessionByCinemasIDForApp` 兩個 API 的回應。
        *   返回這兩個 API 的 **原始 JSON** 資料 (`SkcRawDataPayload`)。
        *   包含超時和錯誤處理。
    *   創建了 `processSkcData` 函數：
        *   接收 `SkcRawDataPayload` 作為輸入。
        *   解析 `homePageData` 提取電影基本資訊 (`FilmName`, `TitleAlt`, `Rating`, `RunTime` 等) 和海報圖片 URL (`FilmUrl` 陣列, `FU_Type: 0`)。
            *   實現了構建完整海報 URL 的邏輯。
        *   解析 `sessionData` 提取場次資訊 (`Session` 陣列)。
        *   創建了輔助函數 `formatSessionDate` (格式化為 MM-DD (週N)) 和 `formatSessionTime` (格式化為 HH:mm)。
        *   為每部電影篩選並格式化其對應的所有場次，並按日期和時間排序。
        *   將處理後的 SKC 資料組合為 `CombinedMovieData[]` 陣列，此時 IMDb 相關欄位均為 `null`。
    *   (原 `fetchSkcMovieData` 函數已被拆分為 `fetchRawSkcData` 和 `processSkcData`)

3.  **IPC 通道定義 (`src/shared/ipc-interfaces.ts`):**
    *   定義了 `SkcRawDataPayload` 介面。
    *   定義了 `GET_SKC_RAW_DATA` 通道名稱、處理函數類型 (`GetSkcRawDataHandler`) 和渲染器調用類型 (`GetSkcRawDataRenderer`)。

4.  **主行程整合 (`src/main/index.ts`):**
    *   導入 `fetchRawSkcData`。
    *   實現並註冊了 `handleGetSkcRawData` 來處理 `GET_SKC_RAW_DATA` 通道請求。

5.  **前端整合與測試 (`src/renderer/src/components/MovieList.vue`):**
    *   添加了調試按鈕 "Fetch SKC Raw"，用於觸發 `GET_SKC_RAW_DATA` 並在控制台打印結果，驗證原始資料獲取。

**遇到的主要問題與解決:**

*   **API 結構誤解:** 最初對 SKC API 返回的 JSON 結構（特別是海報和場次位置）有誤解，通過打印原始 JSON 並分析後修正了 `processSkcData` 的邏輯。
*   **IPC 結構調整:** 根據需要，將原先直接返回處理後數據的單一通道，拆分為獲取原始數據和獲取組合數據的多個通道，以便於調試。

**狀態:** SK Cinema 爬蟲的核心功能（獲取原始數據、處理數據）已完成並驗證。為階段三的 IMDb 整合打下了基礎。 