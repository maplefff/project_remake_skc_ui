# 開發階段二：SK Cinema 時刻表爬蟲

**對應主計畫階段:** [階段二：SK Cinema 時刻表爬蟲 (SK Cinema Scraper)](Development_plan.md#階段二sk-cinema-時刻表爬蟲-skc-scraper)

**目標:** 能夠通過 IPC 從前端觸發，成功獲取、處理並返回結構化、格式化的 SK Cinema 電影時刻表資料陣列。

## 詳細任務分解

### 1. 整合與配置 Playwright

*   **任務:** 在 Electron 主行程中安裝並配置 Playwright。
*   **步驟:**
    1.  在專案根目錄 `/Users/wu_cheng_yan/cursor/project_remake_skc_ui/skc_imdb_webapp` 下執行 `npm install playwright`。這會同時安裝 Playwright 庫及其所需的瀏覽器執行檔。
    2.  考慮在 `electron/main/scraper/` 目錄下創建 Playwright 相關的初始化或輔助函數（例如，啟動瀏覽器實例）。
*   **驗證:** `playwright` 成功添加到 `package.json` 的依賴中。
*   **可能挑戰:** 首次安裝可能需要較長時間下載瀏覽器二進制文件。

### 2. 編寫 Playwright 攔截腳本

*   **任務:** 編寫 TypeScript 腳本 (`electron/main/scraper/skcScraper.ts`)，使用 Playwright 導航至目標頁面並攔截 API 回應。
*   **步驟:**
    1.  引入 `playwright` 模組。
    2.  創建一個異步函數，例如 `fetchSkcMovieData(locationCode: string = '1004')`。
    3.  在函數內部：
        *   啟動瀏覽器 (`chromium.launch()`)。
        *   創建新的瀏覽器上下文 (`browser.newContext()`) 和頁面 (`context.newPage()`)。
        *   **設置回應監聽器:** 使用 `page.on('response', async (response) => { ... })`。
        *   在監聽器回調中，檢查 `response.url()` 是否匹配目標 API 的正則表達式 (`/api/VistaDataV2/GetHomePageListForApps/i` 和 `/GetSessionByCinemasIDForApp/i`)。
        *   如果匹配且 `response.ok()`，則異步讀取並解析 JSON (`await response.json()`)。
        *   將解析後的 `HomePage` JSON 和 `Session` JSON（按 `FilmNameID` 組織）儲存到函數作用域的變數中。**注意處理 API 可能返回錯誤或非預期結構的情況。**
        *   **導航至目標頁面:** `await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 60000 })`。
        *   添加短暫延遲 (`await page.waitForTimeout(3000)`) 確保所有網路請求完成。
        *   關閉瀏覽器 (`await browser.close()`)。
        *   返回儲存的 API 資料。
*   **驗證:** 單獨測試此函數（例如，在主行程中直接調用並打印結果），確認能獲取到兩個 API 的 JSON 資料。
*   **可能挑戰:** API URL 或結構可能改變；網路超時；Playwright API 的異步處理。

### 3. 定義資料結構介面

*   **任務:** 在 `src/types/ipc.ts` (或單獨的 `src/types/movie.ts`) 中創建 TypeScript 介面來定義 SK Cinema 電影資料和場次資料的結構。
*   **步驟:**
    1.  創建 `SKCSession` 介面：
        ```typescript
        export interface SKCSession {
          date: string; // MM-DD (週N)
          showtime: string; // HH:mm
          endTime: string; // HH:mm
          theater: string; // 例如 "數位 (A廳)"
        }
        ```
    2.  創建 `SKCMovie` 介面：
        ```typescript
        export interface SKCMovie {
          filmNameID: string | number;
          movieName: string;
          englishTitle: string;
          posterUrl: string | null;
          skRating: string; // 例如 "普遍級"
          ratingDescription: string;
          runtimeMinutes: number;
          sessions: SKCSession[];
        }
        ```
*   **驗證:** TypeScript 編譯器能識別這些介面。

### 4. 實作資料處理與格式化邏輯

*   **任務:** 在 `skcScraper.ts` 中添加處理攔截到的原始 API 資料的邏輯，將其轉換為符合 `SKCMovie[]` 介面的格式。
*   **步驟:**
    1.  創建輔助函數 `formatSessionDate` 和 `formatSessionTime` (參考舊專案 `skcScraper.js`)。
    2.  從 `HomePage` 資料中提取海報 URL，建立 `Map<FilmNameID, PosterURL>`。
    3.  遍歷 `HomePage` 資料中的 `newestMovie.Film` 陣列。
    4.  對於每部電影：
        *   獲取 `FilmNameID`。
        *   從之前儲存的 `Session` 資料中查找對應該 `FilmNameID` 的原始場次列表。
        *   如果沒有場次，可以選擇跳過該電影或返回空 `sessions` 陣列。
        *   遍歷原始場次，使用輔助函數格式化 `BusinessDate`, `ShowTime`, `EndTime`，並組合 `FilmType` 和 `ScreenName` 作為 `theater`。
        *   從海報 Map 中查找海報 URL。
        *   組合所有資訊，創建一個符合 `SKCMovie` 介面的物件。
    5.  將所有處理好的 `SKCMovie` 物件收集到一個陣列中並返回。
*   **驗證:** 處理邏輯能正確合併資料，格式化輸出符合 `SKCMovie[]` 介面。單元測試（如果可行）或日誌輸出驗證。
*   **可能挑戰:** API 返回的欄位名稱大小寫可能不一致；日期時間格式處理；資料缺失的處理。

### 5. 建立 IPC 接口

*   **任務:** 創建一個 IPC 通道，允許前端觸發 SK Cinema 爬蟲並接收結果。
*   **步驟:**
    1.  **定義通道名稱:** 在 `src/types/ipc.ts` 中添加 `GET_SKC_MOVIES: 'get-skc-movies'`。
    2.  **主行程處理:** 在 `electron/main/ipcHandlers.ts` (或 `index.ts`) 中：
        ```typescript
        import { ipcMain } from 'electron';
        import { fetchSkcMovieData } from './scraper/skcScraper'; // 假設路徑
        import { SKCMovie } from '../../src/types/movie'; // 假設路徑

        ipcMain.handle('get-skc-movies', async (): Promise<SKCMovie[]> => {
          try {
            console.log('[IPC] Handling get-skc-movies request...');
            const movies = await fetchSkcMovieData();
            console.log(`[IPC] Returning ${movies.length} SKC movies.`);
            return movies;
          } catch (error) {
            console.error('[IPC] Error handling get-skc-movies:', error);
            // 可以選擇拋出錯誤或返回空陣列/錯誤標識
            throw new Error('Failed to fetch SKC movie data.');
          }
        });
        ```
    3.  **預載腳本暴露:** 在 `electron/preload/index.ts` 中：
        ```typescript
        // ... (在 contextBridge.exposeInMainWorld 的 'electronAPI' 對象中添加)
        getSkcMovies: (): Promise<SKCMovie[]> => ipcRenderer.invoke('get-skc-movies'),
        ```
    4.  **更新 Window 接口聲明 (如果需要):**
        ```typescript
        // declare global { interface Window { electronAPI: { ...; getSkcMovies: () => Promise<SKCMovie[]>; }}}
        ```
*   **驗證:** 見下一節的階段性測試。
*   **可能挑戰:** IPC 異步處理；TypeScript 類型在主行程、預載和渲染行程之間的共享和路徑問題。

## 階段性測試

*   **任務:** 驗證 SK Cinema 爬蟲功能在開發模式和初步打包後的應用中都能正常工作。
*   **步驟:**
    1.  **開發模式測試:**
        *   在 `src/App.vue` (或其他臨時測試元件) 中添加一個按鈕。
        *   點擊按鈕時，調用 `window.electronAPI.getSkcMovies()`。
        *   將返回的電影數量或第一個電影的名稱顯示在頁面上，並在控制台打印完整資料。
        *   執行 `npm run dev`，啟動應用，點擊按鈕，檢查 UI 顯示和控制台輸出是否符合預期。
    2.  **初步打包測試:**
        *   執行 `npm run build` (或 `yarn build`) 來打包應用程式。
        *   找到打包生成的安裝檔（例如在 `dist_electron` 或 `release` 目錄下）。
        *   安裝並運行打包後的應用程式。
        *   重複開發模式測試中的按鈕點擊和驗證步驟，確保在打包環境下功能正常。
*   **目標:** 確認 SK Cinema 爬蟲的核心邏輯在開發和生產環境下均能成功執行並通過 IPC 返回資料。

## 階段產出物

*   可運行的 Playwright 腳本 (`skcScraper.ts`)，用於獲取和處理 SK Cinema 資料。
*   定義好的 `SKCMovie` 和 `SKCSession` TypeScript 介面。
*   一個可用的 IPC 通道 (`get-skc-movies`)，用於前端調用。
*   通過了初步的開發模式和打包測試，驗證了本階段功能的端到端流程。 