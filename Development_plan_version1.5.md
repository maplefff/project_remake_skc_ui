# IMDb Scraper (imdbScraper.ts) 改善計劃 - 版本 1.5：遷移至 Axios/Cheerio

**日期：** 2024-07-23
**規劃人：** AI 助理

## 1. 背景

根據 `/Users/wu_cheng_yan/cursor/project_remake_skc_ui/public/IMDbStudy/study_report.md` 中的研究結果，相較於 Playwright，使用 Axios 進行 HTTP 請求和 Cheerio 進行 HTML 解析的方案，在並發抓取 IMDb 電影數據時展現出顯著的性能優勢（執行時間更短、成功率更高）。本計劃旨在將主專案 (`skc_imdb_webapp`) 中的 `imdbScraper.ts` 模塊從 Playwright 遷移至 Axios/Cheerio 技術棧，以提升效率和穩定性。

## 2. 目標

*   **核心技術棧遷移**：將 `imdbScraper.ts` 的數據抓取邏輯從 Playwright 完全遷移到 Axios (用於 HTTP 請求) 和 Cheerio (用於 HTML 解析)。
*   **保留現有功能和健壯性邏輯**：
    *   標題清理規則 (`TITLE_CLEANUP_REGEXPS`)。
    *   原片名與英文片名的備援搜索策略。
    *   優先從 JSON-LD 提取數據。
    *   若 JSON-LD 不可用或不完整，則進行後備的 DOM 元素抓取 (`fallbackScraping`)。
    *   對英文備援搜索結果進行標題相似度驗證 (`calculateTitleSimilarity` 與 `SIMILARITY_THRESHOLD`)。
*   **接口兼容性**：確保對外的核心函數簽名 (`fetchRawImdbData`) 和相關的數據結構/類型定義 (如 `GetImdbRawDataInput`, `ImdbRawDataPayload`, `FetchImdbStatus`) 保持不變，以最小化對現有系統其他部分的影響。
*   **移除 Playwright 依賴**：從 `imdbScraper.ts` 中移除所有對 Playwright 庫的依賴和使用。

## 3. 詳細實施步驟

### 階段一：核心工具函數重構與依賴引入

1.  **添加/移除依賴庫**：
    *   **移除**：Playwright (`playwright`)。
    *   **添加**：
        *   `axios`：用於發送 HTTP 請求。
        *   `cheerio`：用於在服務器端解析 HTML。
        *   `@types/cheerio`：為 Cheerio 提供 TypeScript 類型定義。
    *   *附註：開發者需手動執行 `npm uninstall playwright` 及 `npm install axios cheerio @types/cheerio` (或相應的 yarn 指令)。*
2.  **引入新導入語句**：
    *   在 `imdbScraper.ts` 頂部添加 `import axios from 'axios';` 和 `import * as cheerio from 'cheerio';`。
    *   移除 `import { chromium, type Browser, type Page, type BrowserContext } from 'playwright';`。
3.  **創建 HTTP 請求輔助函數 `fetchHtml`**：
    *   實現一個新的異步函數 `async function fetchHtml(url: string, attempt = 1, maxAttempts = 3): Promise<string>`。
    *   使用 `axios.get` 發送請求。
    *   配置必要的 HTTP 請求頭 (如 `User-Agent`, `Accept-Language`，可沿用現有 Playwright 版本中的配置，並考慮加入 `zh-TW, zh`)。
    *   實現基本的重試機制和超時處理。
4.  **重構 `performSearchAttempt` 函數**：
    *   現有邏輯：使用 Playwright `page.goto` 和 `page.waitForSelector`。
    *   新邏輯：
        *   輸入參數：`searchQuery: string`, `selector: string` (原 `page` 參數移除)。
        *   調用 `fetchHtml` 獲取 IMDb 搜索結果頁面的 HTML 內容 (`searchUrl` 構造方式不變)。
        *   使用 `cheerio.load(htmlContent)` 加載 HTML。
        *   使用 Cheerio API (`$`) 查找指定的 `selector`，提取第一個匹配項的 `href` 屬性。
        *   返回電影詳情頁的完整 URL 或 `null`。
5.  **重構 `extractJsonLd` 函數**：
    *   現有邏輯：接收 Playwright `Page` 對象，使用 `page.$$` 和 `scriptElement.textContent()`。
    *   新邏輯：
        *   輸入參數：`htmlContent: string` (原 `page` 參數移除)。
        *   使用 `cheerio.load(htmlContent)` 加載 HTML。
        *   使用 Cheerio API 查找所有 `script[type="application/ld+json"]` 元素。
        *   遍歷找到的腳本元素，獲取其文本內容，解析 JSON，並返回類型為 `'Movie'` 的 JSON-LD 對象。
        *   錯誤處理保持不變。
6.  **重構 `fallbackScraping` 函數**：
    *   現有邏輯：接收 Playwright `Page` 對象，使用 `page.waitForSelector`, `page.textContent`, `page.$$eval` 等。
    *   新邏輯：
        *   輸入參數：`htmlContent: string` (原 `page` 參數移除)。
        *   使用 `cheerio.load(htmlContent)` 加載 HTML。
        *   將所有 Playwright 的選擇器和 DOM 操作邏輯替換為等效的 Cheerio API (例如 `$(selector).text()`, `$(selector).attr('href')`, `$(selector).each((i, el) => { ... })`)。
        *   所有 CSS 選擇器需要被仔細審查，確保在靜態 HTML 環境下依然有效。
        *   返回 `Partial<ImdbRawDataPayload>` 對象。

### 階段二：業務流程整合與接口保持

1.  **重構核心入口函數 `fetchRawImdbData`**：
    *   **移除 Playwright 實例管理**：刪除所有關於 `browser` (啟動、關閉) 和 `context` (創建、重用) 的代碼。`ownBrowser` 變量也將移除。
    *   **頁面操作替換**：
        *   不再創建 `page` 對象。
        *   `searchMovieOnImdb` 函數的調用方式將調整，因為它不再需要 `page` 參數（`performSearchAttempt` 內部處理 HTML 獲取）。
        *   如果 `searchMovieOnImdb` 成功返回電影 URL (`movieUrl`)：
            *   調用 `fetchHtml(movieUrl)` 獲取電影詳情頁的 HTML。
            *   將此 HTML 字符串傳遞給重構後的 `extractJsonLd(htmlContent)`。
            *   如果 JSON-LD 處理後仍需備援抓取，則將相同的 HTML 字符串傳遞給 `fallbackScraping(htmlContent)`。
    *   **參數調整**：從 `fetchRawImdbData` 的函數簽名中移除 `existingContext?: BrowserContext` 參數。
    *   **邏輯保留**：
        *   標題清理 (`TITLE_CLEANUP_REGEXPS`) 邏輯。
        *   原片名、英文片名搜索順序及相關日誌邏輯。
        *   JSON-LD 數據的解析和字段提取邏輯。
        *   `fallbackScraping` 的調用和數據合併邏輯。
        *   標題相似度驗證 (`calculateTitleSimilarity` 和 `SIMILARITY_THRESHOLD`)，特別是針對英文備援搜索結果的嚴格驗證。
        *   最終的 `status` 判斷 ('success', 'no-rating', 'not-found', 'fetch-failed') 和 `ImdbRawDataPayload` 的構建。
    *   **錯誤處理**：確保 `try...catch` 結構能正確捕獲由 `axios` 或 `cheerio` 解析引起的錯誤，並將其歸類為 `'fetch-failed'`。
    *   **`finally` 塊調整**：移除 `page.close()` 和 `browser.close()` 的調用。
2.  **保持接口定義一致性**：
    *   再次確認 `GetImdbRawDataInput`, `ImdbRawDataPayload`, `FetchImdbStatus` 這些共享接口定義完全不受影響。
    *   `processImdbData` 函數的邏輯基於 `ImdbRawDataPayload`，其本身不需要修改。

### 階段三：測試、優化與文檔更新

1.  **單元測試**：
    *   為新的 `fetchHtml` 函數編寫單元測試。
    *   更新或重寫針對 `performSearchAttempt`, `extractJsonLd`, `fallbackScraping` 的單元測試，使用靜態 HTML 字符串作為輸入。
2.  **集成測試**：
    *   使用多種電影標題（包括正常、冷門、多語言、易混淆的案例）對重構後的 `fetchRawImdbData` 進行全面的集成測試。
    *   驗證數據提取的準確性、各種狀態 (`status`) 的正確返回以及錯誤處理的穩健性。
3.  **錯誤處理和日誌審查**：
    *   仔細檢查所有修改部分的錯誤捕獲和日誌記錄，確保日誌信息清晰、有助於問題排查。
4.  **性能對比 (推薦)**：
    *   在完成重構和初步測試後，可以考慮使用 `public/IMDbStudy` 中的類似腳本，針對重構後的 `imdbScraper.ts` 進行並發性能測試，與之前的 Playwright 版本和純 Axios/Cheerio 研究腳本進行比較。
5.  **文檔更新**：
    *   更新 `imdbScraper.ts` 內部必要的註釋。
    *   如果專案中有其他相關文檔提及 IMDb 抓取實現細節，也應一併更新。

## 4. 對 `imdbScraper.ts` 結構的主要影響

*   **依賴變更**：Playwright 相關的導入和代碼將被完全移除；Axios 和 Cheerio 將成為新的核心依賴。
*   **異步操作核心**：異步操作的重心將從 Playwright 的瀏覽器/頁面事件轉移到 Axios 的 HTTP 請求和 Cheerio 的同步解析（儘管包裹在異步函數中）。
*   **代碼結構**：輔助函數 (`performSearchAttempt`, `extractJsonLd`, `fallbackScraping`) 的參數和內部實現將有較大調整，但 `fetchRawImdbData` 的整體業務流程和控制邏輯將得到保留和適配。
*   **可維護性**：預計代碼行數會有所減少，執行緒模型更簡單，有助於提升可維護性。

## 5. 潛在挑戰與應對

*   **IMDb 網站結構變更**：CSS 選擇器是脆弱的。如果 IMDb 更新其前端 HTML 結構，基於 Cheerio 的解析可能會失效。
    *   **應對**：保持選擇器的簡潔和通用性，定期檢查和更新。
*   **反爬蟲機制升級**：IMDb 可能會針對高頻率的直接 HTTP 請求加強反爬蟲措施（如 IP 封鎖、CAPTCHA）。
    *   **應對**：目前方案使用標準的 `User-Agent` 和 `Accept-Language`。若遇到問題，未來可考慮引入代理輪換、更複雜的請求頭模擬或請求頻率控制。但初期以簡潔實現為主。
*   **JavaScript 渲染的內容**：如果 IMDb 未來將關鍵數據（目前主要通過 JSON-LD 和初始 HTML 獲取）轉為完全由客戶端 JavaScript 動態渲染，且這些數據無法通過其他途徑獲取，則 Axios/Cheerio 方案可能會受限。
    *   **應對**：根據 `study_report.md`，目前 JSON-LD 是主要且可靠的數據源，此風險相對較低。若發生，則可能需要重新評估是否針對特定情況引入輕量級瀏覽器環境或API。

## 6. 預期成果

*   顯著提升 IMDb 數據抓取的性能和效率。
*   降低運行時的資源消耗 (CPU, 內存)。
*   提高抓取任務的成功率和穩定性。
*   簡化代碼邏輯，提升可維護性。

---
**下一步：** 按照上述計劃開始實施代碼修改。 