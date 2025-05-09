**IMDb 數據抓取方案並發性能比較報告**

**日期：** 2025-05-08 (請根據實際執行日期調整)
**報告人：** AI 助理

**1. 背景與目的**

本報告旨在比較兩種不同的技術方案在並發抓取 IMDb 電影數據時的性能表現（主要關注執行時間和成功率）。比較結果將作為主專案 (`skc_imdb_webapp`) 中 IMDb 數據抓取模塊優化或重構的參考依據。此前，主專案主要依賴 Playwright (`imdbScraper.ts`) 進行數據抓取。

**2. 測試方案詳述**

本次比較測試了以下兩種方案：

*   **方案 A：Playwright 並發方案**
    *   **核心技術**：使用 Playwright (Chromium 瀏覽器) 進行完整的瀏覽器自動化操作。
    *   **執行邏輯簡述**：
        1.  啟動一個共享的 Playwright 瀏覽器實例。
        2.  對於每部待測電影，在共享瀏覽器實例上創建一個**新的、獨立的瀏覽器上下文 (Browser Context)**。
        3.  在該上下文中創建一個新頁面，導航至 IMDb 進行電影標題搜索。
        4.  從搜索結果中選取第一個匹配項，導航至電影詳情頁面。
        5.  優先嘗試解析頁面中的 JSON-LD 數據以獲取電影評分和評分人數等核心信息。
        6.  所有電影的處理任務通過 `Promise.allSettled()` 實現並發執行。
        7.  每個任務完成後關閉其對應的瀏覽器上下文，所有任務結束後關閉共享瀏覽器實例。
    *   **備註**：此測試腳本中的數據提取邏輯相較於主專案的 `imdbScraper.ts` 有所簡化，主要集中在「按單一標題搜索 -> 從 JSON-LD 提取評分數據」，**未完全複製** `imdbScraper.ts` 中複雜的標題清理、雙標題備援搜索、詳盡的 DOM 元素抓取備援以及嚴格的標題相似度驗證邏輯。

*   **方案 B：Axios/Cheerio 並發方案**
    *   **核心技術**：使用 Axios 進行 HTTP 請求，使用 Cheerio 進行服務器端 HTML 解析。
    *   **執行邏輯簡述**：
        1.  對於每部待測電影，使用 Axios 發起 HTTP GET 請求到 IMDb 進行電影標題搜索。
        2.  使用 Cheerio 解析搜索結果頁面的 HTML，提取第一個匹配項的電影詳情頁鏈接。
        3.  使用 Axios 發起 HTTP GET 請求到電影詳情頁面。
        4.  使用 Cheerio 解析詳情頁 HTML，優先嘗試提取並解析頁面中的 JSON-LD 數據以獲取電影評分和評分人數等核心信息。
        5.  所有電影的處理任務通過 `Promise.allSettled()` 實現並發執行。
    *   **備註**：與方案 A 類似，此測試腳本中的數據提取邏輯也進行了簡化，專注於核心流程。

**3. 測試環境與依賴**

*   **測試執行目錄**：`/Users/wu_cheng_yan/cursor/project_remake_skc_ui/public/IMDbStudy/`
*   **所需主要依賴**：
    *   方案 A (Playwright): `playwright`
    *   方案 B (Axios/Cheerio): `axios`, `cheerio` (Cheerio 被 `IMDb_study_without_playwright.js` 內部使用)
*   **測試電影數量**：30 部（從預定義的100部電影列表中選取前30部）

**4. 相關程式碼位置**

*   **並發測試執行腳本**：
    *   Playwright: `/Users/wu_cheng_yan/cursor/project_remake_skc_ui/public/IMDbStudy/run_playwright_concurrent.js`
    *   Axios: `/Users/wu_cheng_yan/cursor/project_remake_skc_ui/public/IMDbStudy/run_axios_concurrent.js`
*   **核心抓取邏輯實現 (被上述腳本調用)**：
    *   Playwright 研究腳本: `/Users/wu_cheng_yan/cursor/project_remake_skc_ui/public/IMDbStudy/IMDb_study_playwright.js`
    *   Axios/Cheerio 研究腳本: `/Users/wu_cheng_yan/cursor/project_remake_skc_ui/public/IMDbStudy/IMDb_study_without_playwright.js`
*   **主專案現有 IMDb 抓取器 (供參考，其完整邏輯未在本次測試中完全複製)**：
    *   `/Users/wu_cheng_yan/cursor/project_remake_skc_ui/skc_imdb_webapp/src/main/scraper/imdbScraper.ts`

**5. 比較測試結果 (30 部電影)**

| 指標                 | Playwright 並發測試結果 | Axios/Cheerio 並發測試結果 |
| :------------------- | :---------------------- | :----------------------- |
| 處理電影數量       | 30                      | 30                       |
| 成功抓取數量       | 26                      | 30                       |
| 失敗抓取數量       | 4                       | 0                        |
| 失敗主要原因 (Playwright) | 頁面導航超時 (30秒)   | -                        |
| **總執行時間 (毫秒)** | **39983.66 ms**         | **5173.03 ms**           |
| **總執行時間 (秒)**   | **約 40.0 秒**           | **約 5.2 秒**            |

*註：單部電影的詳細處理時間已在腳本執行期間打印至控制台。*

**6. 結果分析與觀察**

*   **執行效率**：Axios/Cheerio 方案在處理30部電影的並發測試中，總執行時間遠少於 Playwright 方案，前者約為後者的 13%。這表明在服務器端直接進行 HTTP 請求和 HTML 解析比驅動完整瀏覽器實例更為高效。
*   **成功率與穩定性**：Axios/Cheerio 方案在此次測試中實現了 100% 的成功率。Playwright 方案則有 4 次因頁面導航超時而失敗，顯示其在網絡波動或目標網站響應較慢時可能更為敏感。
*   **資源開銷**：雖然未進行精確的資源監控，但 Playwright 方案因需啟動和管理瀏覽器上下文及頁面渲染，其固有的資源開銷（CPU、內存）預計會高於 Axios/Cheerio 方案。
*   **測試邏輯簡化**：必須強調，本次比較中使用的測試腳本採用了簡化的抓取邏輯，主要驗證核心的搜索和 JSON-LD 數據提取。主專案 `imdbScraper.ts` 中包含的諸如複雜標題預處理、多種標題源的備援搜索、詳盡的 DOM 元素備援抓取以及基於相似度的結果驗證等增強穩定性和準確性的邏輯，並未在本次性能測試腳本中完全實現。這些額外邏輯無疑會增加兩種方案的實際執行時間。

**7. 初步建議與對主專案的啟示**

基於本次並發性能測試的結果，針對主專案 `skc_imdb_webapp` 的 IMDb 數據抓取功能，提出以下初步建議：

1.  **優先考慮輕量級方案**：若 IMDb 數據抓取的主要瓶頸在於性能和請求成功率，且多數情況下不需要複雜的客戶端 JavaScript 執行或深度用戶交互，強烈建議將主專案的 IMDb 抓取核心邏輯遷移到類似 Axios/Cheerio 的方案。這有望顯著提升數據獲取速度並降低資源消耗。
2.  **保留 `imdbScraper.ts` 的健壯性邏輯**：不論選擇何種底層抓取技術（Playwright 或 Axios/Cheerio），`imdbScraper.ts` 中已實現的許多寶貴邏輯，如：
    *   `TITLE_CLEANUP_REGEXPS` 標題清理
    *   原片名與英文片名的備援搜索策略
    *   詳盡的 `fallbackScraping` (DOM元素備援抓取)
    *   `calculateTitleSimilarity` 標題相似度驗證 (特別是針對英文備援搜索結果)
    都應予以保留並適配到新的抓取流程中，以確保數據的準確性和覆蓋面。本次測試比較的是「引擎」的效率，而非完整「策略」的效率。
3.  **Playwright 的定位**：如果決定轉向 Axios/Cheerio 作為主要方案，Playwright 仍可作為處理極少數必須依賴完整瀏覽器環境才能抓取數據的邊緣情況的備選方案。若繼續以 Playwright 為主，則需重點優化其超時管理、錯誤重試機制，並考慮是否所有電影都需要通過 Playwright 進行。
4.  **進一步測試**：在將 `imdbScraper.ts` 的完整邏輯遷移到新方案後，建議進行更全面的端到端性能和準確性測試。

**8. 結論**

對於並發抓取 IMDb 電影評分等核心數據的任務，基於 Axios 和 Cheerio 的輕量級 HTTP 請求與服務器端解析方案，在本次簡化邏輯的測試中，展現出遠超 Playwright 方案的執行效率和更高的成功率。主專案在進行後續優化時，應認真評估此方向的可行性，同時確保現有抓取策略中的健壯性邏輯得到繼承。 