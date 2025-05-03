# 開發階段三：IMDb 資訊爬蟲

**對應主計畫階段:** [階段三：IMDb 資訊爬蟲 (IMDb Scraper)](Development_plan.md#階段三imdb-資訊爬蟲-imdb-scraper)

**目標:** 能夠獲取並整合 IMDb 資訊，並通過 IPC 返回包含 SK Cinema 時刻表和 IMDb 詳細資訊的完整電影資料陣列。

## 詳細任務分解

### 1. 擴展 Playwright 功能

*   **任務:** 確保 Playwright 在主行程中配置完善，能夠處理導航到外部網站 (IMDb) 並執行頁面操作。
*   **步驟:**
    *   檢查階段二中 Playwright 的設置，確保瀏覽器實例可以重複使用或按需創建。
    *   考慮添加通用的 User-Agent 字串或其他瀏覽器配置以模擬真實用戶，降低被 IMDb 檢測到的風險。
*   **驗證:** 能夠使用 Playwright 成功打開並導航至 IMDb 網站首頁。

### 2. 定義完整電影資料結構

*   **任務:** 在 `src/types/movie.ts` (或 `ipc.ts`) 中擴展或創建一個新的 TypeScript 介面，包含 SK Cinema 和 IMDb 的所有欄位。
*   **步驟:**
    1.  創建 `CombinedMovie` 介面，繼承或組合 `SKCMovie` 介面，並添加 IMDb 欄位：
        ```typescript
        import { SKCMovie } from './skc'; // 假設 SKCMovie 在 skc.ts

        export interface CombinedMovie extends SKCMovie {
          imdbRating: string | number | null; // 允許 null 以表示未找到
          // 注意：實際實現中，'未評分' 對應 '-1' (string), '查詢失敗' 對應 '-2' (string)
          imdbUrl: string | null;
          plot: string | null;
          genres: string[]; // 字符串數組用於 ElTag
          directors: string | null;
          cast: string | null; // 演員列表可能較長，用 string
          // 可以添加一個標識符，說明 IMDb 數據是否成功獲取
          imdbDataFetched: boolean;
        }
        ```
*   **驗證:** TypeScript 編譯器能識別此擴展介面。

### 3. 編寫 IMDb 爬蟲邏輯

*   **任務:** 在 `electron/main/scraper/imdbScraper.ts` 中創建一個函數，接收電影標題（或 `SKCMovie` 物件），使用 Playwright 爬取 IMDb 資訊，並返回部分 IMDb 資料。
*   **步驟:**
    1.  創建異步函數 `fetchImdbDetails(movieTitle: string): Promise<Partial<CombinedMovie>>` (返回部分資料，因為只包含 IMDb 欄位)。
    2.  **搜索電影:**
        *   使用 Playwright 導航到 IMDb 搜索頁面（例如 `https://www.imdb.com/find?q=${encodeURIComponent(movieTitle)}&s=tt&ttype=ft`）。
        *   **定位第一個結果:** 使用 Playwright 的選擇器（如 `page.locator('ul[class^="ipc-metadata-list"] li a[href^="/title/tt"]').first()`）找到第一個指向電影標題頁面的連結。**處理找不到結果的情況。**
        *   獲取連結的 `href` 屬性。
    3.  **導航到詳情頁:**
        *   使用 Playwright 導航到上一步獲取的電影詳情頁面 URL。
        *   等待頁面加載完成（例如 `page.waitForLoadState('domcontentloaded')` 或等待特定元素出現）。
    4.  **提取 JSON-LD (優先):**
        *   使用 `page.locator('script[type="application/ld+json"]').first()` 定位 JSON-LD 腳本。
        *   獲取其內部 HTML (`element.innerHTML()`)。
        *   嘗試 `JSON.parse()` 解析內容。
        *   如果成功且 `@type` 為 `Movie`，則提取 `name`, `aggregateRating.ratingValue`, `director`, `actor`, `genre`, `description`, `datePublished`, `duration`, `url` 等欄位。**注意處理數組和單個物件的情況** (如導演、演員、類型)。
    5.  **提取 CSS (回退):**
        *   如果 JSON-LD 失敗，則使用 Playwright 的選擇器直接從 HTML 提取資訊。**需要針對 IMDb 的當前 HTML 結構編寫穩定的選擇器**（這部分最容易因網站更新而失效）。例如：
            *   評分: `[data-testid="hero-rating-bar__aggregate-rating__score"] span:first-child`
            *   劇情: `[data-testid="plot-xl"]` 或類似的劇情描述區域。
            *   導演/演員/類型: 可能在特定的列表或標籤區域，需要仔細檢查 HTML。
    6.  **格式化並返回資料:** 將提取到的資料整理成 `Partial<CombinedMovie>` 物件返回，包含 `imdbRating`, `imdbUrl`, `plot`, `genres` (轉為 string[]), `directors`, `cast`, `imdbDataFetched: true`。如果提取失敗，返回 `{ imdbDataFetched: false }` 或包含盡可能多的 `null` 值。
*   **驗證:** 單獨測試此函數，傳入不同的電影標題，檢查返回的 IMDb 資料是否準確。特別測試一些容易出錯的情況（如多個同名電影、找不到結果、頁面結構變化）。
*   **可能挑戰:** IMDb 的反爬蟲機制；頁面結構頻繁變化導致選擇器失效；JSON-LD 結構不一致；處理搜索結果不精確的問題。

### 4. 合併資料與主流程

*   **任務:** 創建一個主流程函數（可能在 `electron/main/index.ts` 或 `ipcHandlers.ts`），協調 SK Cinema 和 IMDb 的爬取，並合併結果。
*   **步驟:**
    1.  創建一個新的主處理函數，例如 `fetchAllMovieData()`。
    2.  首先調用 `fetchSkcMovieData()` 獲取 `SKCMovie[]` 列表。
    3.  **並行處理 IMDb 請求 (推薦):**
        *   遍歷 `SKCMovie` 列表，為每個電影創建一個調用 `fetchImdbDetails(skcMovie.movieName)` 的 Promise。
        *   使用 `Promise.allSettled()` 或類似機制並發執行這些 IMDb 爬取任務（可以限制並發數量以避免對 IMDb 造成過大壓力或被封鎖）。
    4.  **合併結果:**
        *   等待所有 IMDb Promise 完成。
        *   遍歷 `SKCMovie` 列表和對應的 IMDb 結果。
        *   將成功的 IMDb 結果合併到 `SKCMovie` 物件中，創建 `CombinedMovie` 物件。對於無法獲取評分的電影 (找到頁面但無評分)，將 `imdbRating` 設為特殊值 `'-1'`。對於獲取失敗或未找到的 IMDb 請求，將 `imdbRating` 設為 `'-2'`，並保留其他 IMDb 欄位為 `null`。
    5.  **排序:** 在返回前，根據 `imdbRating` 對最終的 `CombinedMovie[]` 陣列進行排序，規則為：實際評分數字（降序）> 未評分 (`'-1'`) > 查詢失敗 (`'-2'`)。
    6.  返回最終的 `CombinedMovie[]` 陣列。
*   **驗證:** 測試主流程函數，確保能正確調用兩個爬蟲並合併資料，處理 IMDb 爬取失敗的情況。
*   **可能挑戰:** 並發控制；錯誤處理；合併邏輯的準確性。

### 5. 更新/建立 IPC 接口

*   **任務:** 創建或更新 IPC 通道，供前端調用以獲取合併後的完整電影資料。
*   **步驟:**
    1.  **定義通道名稱:** 在 `src/types/ipc.ts` 中添加 `GET_COMBINED_MOVIES: 'get-combined-movies'`。
    2.  **主行程處理:** 更新或創建 `ipcMain.handle`：
        ```typescript
        import { fetchAllMovieData } from './mainLogic'; // 假設路徑
        import { CombinedMovie } from '../../src/types/movie'; // 假設路徑

        ipcMain.handle('get-combined-movies', async (): Promise<CombinedMovie[]> => {
          try {
            console.log('[IPC] Handling get-combined-movies request...');
            const movies = await fetchAllMovieData();
            console.log(`[IPC] Returning ${movies.length} combined movies.`);
            return movies;
          } catch (error) {
            console.error('[IPC] Error handling get-combined-movies:', error);
            throw new Error('Failed to fetch combined movie data.');
          }
        });
        ```
    3.  **預載腳本暴露:** 添加新的方法：
        ```typescript
        // ... (在 contextBridge.exposeInMainWorld 的 'electronAPI' 對象中添加)
        getCombinedMovies: (): Promise<CombinedMovie[]> => ipcRenderer.invoke('get-combined-movies'),
        ```
    4.  **更新 Window 接口聲明:**
        ```typescript
        // declare global { interface Window { electronAPI: { ...; getCombinedMovies: () => Promise<CombinedMovie[]>; }}}
        ```
*   **驗證:** 見下一節。
*   **可能挑戰:** 確保新的 IPC 通道被正確註冊和暴露。

## 階段性測試

*   **任務:** 驗證包含 IMDb 資料的完整爬蟲流程在開發和打包環境下正常工作。
*   **步驟:**
    1.  **開發模式測試:**
        *   修改 `src/App.vue` 或測試元件中的按鈕點擊處理函數，改為調用 `window.electronAPI.getCombinedMovies()`。
        *   更新 UI 或控制台輸出來顯示合併後的資料，例如第一個電影的 IMDb 評分和導演。
        *   執行 `npm run dev`，啟動應用，點擊按鈕，檢查輸出是否包含 IMDb 資料。
    2.  **打包測試:**
        *   執行 `npm run build`。
        *   安裝並運行打包後的應用程式。
        *   重複驗證步驟，確保 SK Cinema 和 IMDb 爬蟲在打包環境下都能成功執行並返回合併後的資料。
*   **目標:** 確認整合了 IMDb 爬蟲的完整流程能在開發和生產環境下穩定運行。

## 階段產出物

*   可運行的 Playwright 腳本 (`imdbScraper.ts`)，用於獲取 IMDb 詳細資訊。
*   定義好的 `CombinedMovie` TypeScript 介面。
*   協調兩個爬蟲並合併資料的主流程邏輯。
*   一個可用的 IPC 通道 (`get-combined-movies`)，用於前端獲取完整資料。
*   通過了本階段的開發模式和打包測試。 