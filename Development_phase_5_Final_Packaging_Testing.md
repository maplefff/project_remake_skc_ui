# 開發階段五：最終打包與全面測試

**對應主計畫階段:** [階段五：最終打包與全面測試 (Final Packaging & Comprehensive Testing)](Development_plan.md#階段五最終打包與全面測試-final-packaging--comprehensive-testing)

**目標:** 產生經過全面測試、可在目標平台上穩定運行的最終應用程式版本。

## 詳細任務分解

### 1. 配置 Electron Builder

*   **任務:** 檢查並完善 `electron-builder.yml` (或 `package.json` 中的 `build` 部分) 配置，確保能為目標平台 (例如 macOS, Windows) 生成正確的安裝包，**並特別處理 Playwright 瀏覽器的打包**。
*   **步驟:**
    1.  打開 `electron-builder.yml` 或 `package.json`。
    2.  **檢查 `appId`:** 設置一個唯一的應用程式 ID (例如 `com.yourcompany.skcimdbapp`)。
    3.  **檢查 `productName`:** 設置應用程式的名稱 (例如 `SKCinema IMDb Rating`)。
    4.  **配置目標平台:** 在 `mac`, `win` 等鍵下配置特定平台的選項。
        *   **macOS (`mac`):**
            *   指定 `target` (例如 `dmg`, `zip`)。
            *   配置 `icon` (指向 `.icns` 圖標文件的路徑，例如 `build/icon.icns` - 我們需要準備這個圖標文件)。
            *   考慮代碼簽名 (`identity`) 以便在 macOS 上分發。
        *   **Windows (`win`):**
            *   指定 `target` (例如 `nsis` - 創建安裝程序, `zip`)。
            *   配置 `icon` (指向 `.ico` 圖標文件的路徑，例如 `build/icon.ico` - 我們需要準備這個圖標文件)。
            *   考慮代碼簽名。
    5.  **檢查 `files`:** 確保打包時包含所有必要的檔案和目錄，排除不必要的開發文件。`electron-vite` 的預設配置通常是合理的，確保它包含了編譯後的 JS 文件。
    6.  **檢查 `directories`:** 確認 `output` 指向打包輸出的目錄 (例如 `release`)。
    7.  **(重要) Playwright 瀏覽器打包配置 (使用 `extraResources` 策略):**
        *   **a. 確認瀏覽器已安裝:** 確保在開發環境中，Playwright 需要的瀏覽器（我們主要用 Chromium）已經通過 `npm install playwright` 或 `npx playwright install chromium` 被下載。通常位於 `node_modules/playwright/.local-browsers/` 下。
        *   **b. 配置 `extraResources`:** 在 `electron-builder.yml` 中添加 `extraResources` 配置，將開發環境中 Playwright 的瀏覽器文件夾複製到打包後應用的 `resources` 文件夾內的一個子目錄（例如 `pw-browsers`）。
            ```yaml
            # electron-builder.yml
            # ... 其他配置 ...
            extraResources:
              - filter:
                  - '**/*' # 包含所有文件
                from: './node_modules/playwright/.local-browsers/' # 源路徑 (根據實際情況可能需要調整)
                to: './pw-browsers' # 打包到 app resources 目錄下的 pw-browsers 子目錄
            # ... 其他配置 ...
            ```
            *注意：`from` 路徑可能需要根據 Playwright 版本或作業系統微調，需要實際檢查確認。*
        *   **c. 在主行程設置環境變數:** 在 Electron 主行程 (`electron/main/index.ts` 或相關初始化腳本) **啟動 Playwright 之前**，設置 `PLAYWRIGHT_BROWSERS_PATH` 環境變數，指向打包後應用內瀏覽器的位置。
            ```typescript
            // electron/main/index.ts
            import path from 'node:path';
            import { app } from 'electron'; // 確保引入 app

            // ... 其他 import ...

            // 設置 Playwright 瀏覽器路徑 (僅在打包後生效)
            if (app.isPackaged) {
              // process.resourcesPath 指向打包後應用內的 resources 文件夾
              process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(process.resourcesPath, 'pw-browsers');
              console.log('[Playwright Path] Set PLAYWRIGHT_BROWSERS_PATH to:', process.env.PLAYWRIGHT_BROWSERS_PATH);
            } else {
              // 開發模式下，Playwright 通常能自己找到瀏覽器
              console.log('[Playwright Path] Running in development mode, using default browser path.');
            }

            // ... 後續創建視窗、啟動 Playwright 的程式碼 ...
            // 例如在 scraper/skcScraper.ts 或 scraper/imdbScraper.ts 中
            // const browser = await chromium.launch(); // Playwright 會讀取環境變數
            ```
*   **驗證:** 配置文件語法正確，包含了基本的打包設置和 `extraResources` 配置。主行程代碼中添加了設置環境變數的邏輯。
*   **可能挑戰:** 正確配置圖標和簽名；`extraResources` 的 `from` 路徑需要找準；確保環境變數在 Playwright 啟動前被設置；打包後的應用體積會顯著增大。

### 2. 準備應用程式圖標

*   **任務:** 根據打包配置的要求，創建並放置應用程式圖標文件。
*   **步驟:**
    1.  創建應用程式圖標。可以使用現有的 `icon_example.icns` 作為 macOS 圖標的參考。
    2.  需要一個 `.icns` 格式的圖標用於 macOS，和一個 `.ico` 格式的圖標用於 Windows。可以使用在線轉換工具或專用軟體製作。
    3.  將圖標文件放置到 `electron-builder.yml` 中指定的路徑（例如，在專案根目錄下創建 `build` 文件夾，放入 `icon.icns` 和 `icon.ico`）。
*   **驗證:** 圖標文件存在於指定路徑，格式正確。

### 3. 執行最終打包

*   **任務:** 運行打包命令，生成所有目標平台的應用程式安裝包。
*   **步驟:**
    1.  確保所有程式碼已提交或保存。
    2.  執行打包命令，例如 `npm run build` 或 `yarn build` (這通常會觸發 `electron-builder` 命令)。
    3.  監控打包過程的輸出，注意任何錯誤或警告，特別是關於文件包含或 Playwright 相關的。
*   **驗證:** 打包命令成功完成，在指定的輸出目錄（如 `release`）下生成了目標平台的安裝文件（`.dmg`, `.exe`, `.zip` 等）。
*   **可能挑戰:** 打包過程中的錯誤；Playwright 瀏覽器打包問題；代碼簽名問題（如果配置了）。

### 4. 全面功能與視覺測試

*   **任務:** 在目標平台上安裝並運行打包後的應用程式，進行端到端的全面測試。
*   **步驟:**
    1.  **安裝測試:** 在目標操作系統上（例如 macOS 和 Windows 虛擬機或實體機）嘗試安裝應用程式，確保安裝過程順利。
    2.  **啟動測試:** 啟動安裝後的應用程式，確保能正常打開。
    3.  **核心功能測試:**
        *   觸發電影資料加載 (`get-combined-movies`)。
        *   **驗證爬蟲 (打包後關鍵點):** 確認打包後的應用程式**能夠成功啟動 Playwright 並執行爬蟲**，獲取 SK Cinema 和 IMDb 資料。如果失敗，檢查控制台是否有關於找不到瀏覽器或 Playwright 路徑的錯誤。
        *   **驗證 IPC:** 確認前後端通訊穩定。
    4.  **UI/UX 測試:**
        *   **視覺一致性:** 再次仔細對比應用介面與 `UI_example.png`，確保在目標平台上視覺效果完全一致（佈局、顏色、字體、圖標、按鈕、海報淡出等）。
        *   **交互測試:** 測試列表滾動、電影選擇、詳情更新、排序等所有交互是否流暢、響應正確。
        *   **響應式測試:** 如果設計需要考慮不同窗口大小，進行測試。
        *   **錯誤處理測試:** 嘗試模擬錯誤情況（例如斷網），檢查應用是否能合理處理並給出提示。
    5.  **資源消耗測試 (可選):** 觀察應用運行時的 CPU 和內存佔用情況，是否存在異常。
*   **驗證:** 應用程式在目標平台上安裝、啟動和運行穩定，所有核心功能正常，視覺效果與設計完全一致，交互流暢。
*   **可能挑戰:** 平台特定的兼容性問題；打包後爬蟲無法工作（常見於路徑或權限問題）；視覺渲染差異。

### 5. 修復剩餘問題

*   **任務:** 根據全面測試的結果，修復所有發現的 Bug 或不一致之處。
*   **步驟:**
    1.  定位問題根源。
    2.  修改程式碼或配置。
    3.  **重新打包並重新測試**，直到問題解決。
*   **驗證:** 所有已知問題已修復，應用程式通過最終測試。

## 階段產出物

*   配置完善的 `electron-builder.yml` 文件。
*   符合要求的應用程式圖標文件。
*   為目標平台生成的、經過全面測試的穩定應用程式安裝包。
*   一份測試報告或問題修復記錄 (可選)。 