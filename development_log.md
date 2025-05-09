# Development Log

## [1.5.0] - 2024-07-24

- **重大更改：IMDb 爬蟲 (`imdbScraper.ts`) 重構**
    - 核心技術棧從 Playwright 遷移至 Axios (用於 HTTP 請求) 和 Cheerio (用於 HTML 解析)，旨在提升性能和降低資源消耗。
    - 重構了以下主要函數以移除 Playwright 依賴：
        - `performSearchAttempt`: 改為使用 `fetchHtml` 和 Cheerio 進行搜索頁解析。
        - `extractJsonLd`: 改為接收 HTML 字符串並使用 Cheerio 提取 JSON-LD。為解決 `TS7030` 編譯錯誤，內部邏輯調整為使用輔助函數 `parseSingleJsonLdScript` 和 `for...of` 循環，以提供更清晰的控制流。
        - `fallbackScraping`: 改為接收 HTML 字符串並使用 Cheerio 進行 DOM 元素備援抓取。
        - `fetchRawImdbData` (核心入口函數): 完全移除了 Playwright 瀏覽器和頁面上下文管理，改為調用新的輔助函數獲取和處理 HTML。
    - 新增輔助函數 `fetchHtml`：使用 Axios 進行 HTTP GET 請求，包含重試機制和超時配置。
    - 保留了關鍵業務邏輯：
        - 標題清理規則 (`TITLE_CLEANUP_REGEXPS`)。
        - 原片名與英文片名的備援搜索策略。
        - 優先從 JSON-LD 提取數據，失敗則進行 DOM 元素備援抓取。
        - 針對英文備援搜索結果的標題相似度驗證 (`calculateTitleSimilarity` 與 `SIMILARITY_THRESHOLD`)。
    - 根據測試和反饋調整了以下參數：
        - `fetchHtml` 的 HTTP 請求重試次數從默認 3 次調整為 2 次。
        - `fetchHtml` 的 HTTP 請求超時時間從 30000ms 調整為 2500ms。
        - 移除了原片名搜索成功時不必要的相似度計算日誌。
    - 修復了在 `npm run build:mac` 過程中出現的多個 TypeScript 編譯錯誤 (TS2554, TS7030, TS6133)，確保了代碼的類型正確性和可編譯性。
- **其他**：
    - 在 `src/main/index.ts` 中更新了對 `fetchRawImdbData` 的調用，移除了已廢棄的 `imdbContext` 參數。

## [1.4.4] - 2025-05-09

- **Refactor(Scraper):** 回退並重做 IMDb 搜尋邏輯：
  - 重新實作英文片名備援搜尋 (階段 1)。
  - 重新實作條件式標題相似度驗證 (階段 2)，僅對英文備援搜尋結果進行嚴格驗證，避免中文原片名因與 IMDb 英文標題比較導致誤判。

## [1.4.3] - 2025-05-08

- **Fix(IPC):** 修復了主行程中開啟外部連結的邏輯，允許開啟 IMDb 電影頁面連結。

## [1.4.1] - 2025-05-08

- **Fix(UI):** 移除了載入畫面中重複的進度資訊。

## [1.4.0] - 2025-05-03

- **Feat(UI):** 根據最新需求調整使用者介面顯示細節。
- **Fix(UI):** 修復先前版本中發現的數個 UI 顯示問題。

## [1.3.2] - 2025-05-03

- **Feat(UI):** 重構放映類型 (`filmType`) 處理與顯示邏輯：
    - 將含 "Dolby", "LUXE" 的類型提取附加描述 (如 "特別場") 顯示於場次旁，非斜體。
    - 將含 "B.O.X.", "Sealy", "OSIM" 的類型統一分組顯示為 "B.O.X."，不顯示附加描述。
    - 調整排序為 Dolby -> LUXE -> 普通廳 -> B.O.X.。
- **Style(UI):** 固定時刻表時間按鈕寬度為 55px，確保視覺一致性。
- **Style(UI):** 移除時刻表影廳名稱 (`screenName`) 外側的括號。
- **Fix(UI):** 確保影廳名稱僅在非 Dolby/LUXE 類型場次旁顯示（如果存在）。
- **Style(UI):** 確認時刻表欄位佈局為最小寬度 120px，間隙 20px。

---

## [1.3.1-beta-1] (2025-05-03) 

- **Refactor:** 重構 `imdbScraper.ts` 中的標題清理邏輯 (`searchMovieOnImdb` 函式)，使用可配置的正則表達式陣列 (`TITLE_CLEANUP_REGEXPS`) 替代原本硬編碼移除 "電影日" 的邏輯，提高擴展性和可維護性。

## [1.3.0] - 2025-05-02
### Added
- 實現場次連結功能：
  - 分析並確定了新光影城官網選位頁面的 URL 結構 (`/booking/seats?c={Cinemas}&s={SessionID}`).
  - 更新了資料處理邏輯，從 SKC API 原始資料中提取並儲存每個場次的 `SessionID`。
  - 在前端將場次時間顯示轉換為可點擊元素。
  - 添加了 IPC 通訊，允許前端請求在外部瀏覽器中開啟指定的選位 URL。
  - 在主行程中實現了開啟外部連結的邏輯，並包含基本的 URL 安全驗證。

### Changed
- **優化資料處理流程：**
  - 將電影過濾邏輯移至 `processSkcData` 函數中，現在該函數只返回實際有場次的電影，簡化了主流程。
- **重構欄位名稱：**
  - 將 `CombinedMovieData` 介面中用於標識 IMDb 資料來源的 `dataStatus` 欄位更名為 `imdbStatus`。
- **移除 SKC 快取：**
  - 由於 SKC 場次變動頻繁，移除了先前版本中為 SKC 原始資料添加的快取功能。現在每次啟動應用程式都會重新從網路爬取最新的 SKC 電影與場次資料。

## [1.2.0] - 2025-05-02
### Added
- 實作多層級快取機制以提升應用程式啟動速度和效能：
  - **SKC 原始資料快取：** 快取當日的電影列表和場次原始資料，避免重複網路請求。
  - **IMDb 資料快取：** 快取 IMDb API 回應資料，有效期 24 小時。
  - **電影海報快取：** 快取電影海報圖片檔案，有效期 7 天，並使用自訂協定 (`app://`) 載入。
- 在電影資料中加入 `dataStatus` 欄位以標識 IMDb 資料來源。

### Changed
- 將「只顯示當日場次」開關預設狀態設為開啟，並更新標籤文字。
- 透過設定視窗背景色和利用 `ready-to-show` 事件，緩解了應用程式啟動時的白色閃爍問題。
- 修復了多個因介面更新導致的 TypeScript 類型錯誤。

## [1.2.0-beta-3.2-rc] - 2025-05-02
### Changed
- 將「只顯示當日場次」開關預設狀態設為開啟。
- 將開關標籤文字修改為「只顯示當日場次」。

## [1.2.0-beta-3.1-rc] - 2025-05-02
### Changed
- 緩解啟動時的白色閃爍問題：
  - 在創建 BrowserWindow 時，將 `backgroundColor` 選項設置為應用的主背景色 (`#141414`)。

## [1.2.0-beta-3.0-rc] - 2025-05-02
### Added
- 實作 SKC 原始資料快取機制 (階段三)：
  - 使用 `electron-store` 儲存 SKC API 回應 (`homePageData`, `sessionData`) 及抓取日期。
  - 快取有效期至當天結束 (日期不同則視為過期)。
  - 在應用啟動時檢查快取，若當日快取有效則跳過 SKC 網路請求。
  - 網路請求成功後，更新當日快取。

## [1.2.0-beta-2.0] - 2025-05-02
### Added
- 實作 IMDb 資料快取機制 (階段二)：
  - 使用 `electron-store` 儲存 IMDb API 回應資料與時間戳 (有效期 24 小時)。
  - 在請求 IMDb 資料前檢查快取，若有效則直接使用快取資料。
  - 網路請求成功後，將結果寫入快取。
  - 在 `CombinedMovieData` 中新增 `dataStatus` 欄位 (`live`, `cache`, `failed`) 以標識 IMDb 資料來源。
  - 調整主行程邏輯以處理快取命中、未命中、過期及網路失敗情況，並正確設定 `dataStatus`。

## [1.2.0-beta-1.3] - 2025-05-02
### Added
- 實作電影海報快取機制 (階段一)：
  - 使用 `electron-store` 儲存海報檔案路徑與時間戳 (有效期 7 天)。
  - 將海報圖片檔案實際儲存在本地 `userData/imageCache` 目錄。
  - 註冊並使用自訂 `app://imageCache` 協定來安全地載入本地快取圖片。
  - 修復了前端 Vue 元件中 `<el-image>` 的 `:src` 綁定，使其正確使用 `app://` 協定路徑。

## [1.1.0] - 2025-05-01 
### Added
- 新增「只顯示當日」開關：
  - 在標頭右側添加切換開關。
  - 開啟時，左側電影列表只顯示當天有場次的電影。
  - 開啟時，右側電影詳情只顯示當天的場次。
  - 移除左側電影列表海報的 lazy loading 屬性，避免過濾時出現佔位符。

## [1.0.1] - 2025-05-01 
### Changed
- 修改載入畫面轉圈動畫顏色為白色 (#FFFFFF)，使其在深色背景上更清晰可見。

## [1.0.0] - 2025-05-01 
### Added
- 初始版本，包含電影列表顯示、詳情查看、IMDb 評分整合及載入進度顯示等核心功能。 