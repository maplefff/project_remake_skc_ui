# 開發計畫

**版本:** 1.0
**日期:** 2024-07-27

## 1. 目的 (Purpose)

開發一個桌面應用程式，旨在解決以下核心需求：

*   **自動抓取電影資訊:** 從 SK Cinema 青埔影院網站 (`https://www.skcinemas.com/sessions?c=1004`) 自動獲取最新的電影放映時刻表。
*   **豐富電影資料:** 整合從 IMDb 網站抓取的電影評分、導演、演員、劇情簡介等關鍵資訊。
*   **便捷的資訊展示:** 提供一個清晰、易用的使用者介面，讓使用者可以：
    *   快速瀏覽按 IMDb 評分排序的電影列表。
    *   方便地查看選定電影的詳細資訊（包含時刻表和 IMDb 資料）。

## 2. 解決方案選型 (Solution Selection)

為了實現上述目標並保持架構簡潔，我們選擇以下技術棧：

*   **前端框架 (Frontend Framework):** **Vue.js** (使用 Vue 3 Composition API)。
*   **應用程式框架與後端執行環境 (Application Framework & Backend Runtime):** **Electron**。利用 Electron 的主行程 (Main Process) 直接執行後端邏輯（包括爬蟲任務），避免引入額外的後端伺服器框架。
*   **網頁爬蟲與自動化 (Web Scraping & Automation):** **Playwright**。在 Electron 主行程中運行，用於攔截 SK Cinema API 和爬取 IMDb 頁面。
*   **行程間通訊 (Inter-Process Communication - IPC):** **Electron IPC**。用於主行程 (後端邏輯) 與渲染行程 (Vue 前端) 之間的資料和指令傳遞。**前後端將通過明確定義的 TypeScript 介面 (Interface) 來規範 IPC 通訊的資料結構。**
*   **開發語言 (Language):** **TypeScript**。應用於 Vue 前端和 Electron 主行程，提供靜態類型檢查，提高程式碼的穩定性和可維護性。
*   **UI 元件庫 (UI Component Library):** **Element Plus**。用於快速建構使用者介面。

## 3. 目錄結構計畫 (Proposed Directory Structure)

基於 `electron-vite` 和我們選擇的技術棧，實際的目錄結構如下 (`tree -L 4` 輸出簡化版):

```
/Users/wu_cheng_yan/cursor/project_remake_skc_ui/skc_imdb_webapp/  # 專案根目錄
├── electron.vite.config.ts    # electron-vite 配置
├── index.html                 # HTML 入口文件 (給渲染行程)
├── node_modules/              # 依賴庫
├── out/                       # 開發模式/build script 編譯輸出
│   ├── main/
│   │   └── index.js           # 編譯後的主行程入口
│   └── preload/
│       └── index.js           # 編譯後的預載腳本
├── package.json
├── package-lock.json
├── README.md
├── resources/                 # 靜態資源 (打包時複製)
│   └── icon.icns            # macOS 圖標 (已存在)
├── src/                       # 原始碼目錄
│   ├── main/                  # Electron 主行程程式碼
│   │   ├── index.ts           # 主行程入口
│   │   └── scraper/           # 爬蟲相關模組
│   │       ├── imdbScraper.ts # IMDb 爬蟲邏輯
│   │       └── skcScraper.ts  # SK Cinema 爬蟲邏輯
│   ├── preload/               # Electron 預載腳本
│   │   ├── index.d.ts         # 預載腳本類型定義
│   │   └── index.ts           # 預載腳本入口
│   ├── renderer/              # Vue.js 前端渲染行程程式碼
│   │   ├── index.html         # Vue HTML 入口
│   │   └── src/               # Vue 應用程式原始碼
│   │       ├── App.vue        # 根 Vue 元件
│   │       ├── assets/        # 靜態資源 (會被編譯，目前為空)
│   │       ├── components/    # Vue 元件
│   │       │   ├── MovieDetail.vue
│   │       │   └── MovieList.vue
│   │       ├── env.d.ts       # 環境類型定義
│   │       ├── main.ts        # Vue 應用入口
│   │       ├── styles/        # 全局樣式 (目前為空)
│   │       └── views/         # Vue 路由視圖 (目前為空)
│   └── shared/                # 主行程與渲染行程共享的程式碼
│       └── ipc-interfaces.ts  # IPC 介面定義
├── tsconfig.json              # 根 TypeScript 配置
├── tsconfig.node.json         # Electron 主行程/預載的 TS 配置
└── tsconfig.web.json          # Vue 渲染行程的 TS 配置
```

## 4. 開發子計畫 (Development Sub-plans)

我們將開發過程分解為以下階段：

### 階段一：環境設定與基礎架構 (Setup & Foundation)

*   **任務：**
    *   使用 `electron-vite` 或推薦工具初始化 Vue + TypeScript + Electron 專案結構。
    *   整合 Element Plus 到 Vue 專案中，並配置 **CSS 變數或主題化機制，以精確匹配參考截圖中的深色主題顏色方案** (背景、文字、按鈕藍色等)。
    *   配置基本的 Electron 主行程 (`main`) 和預載腳本 (`preload`)，渲染行程 (`renderer`) 結構。
    *   建立主行程與渲染行程之間基礎的 IPC 通訊通道（例如，定義一個簡單的測試接口並驗證其可用性）。
    *   設定基本的 TypeScript 配置 (`tsconfig.json`)。
*   **目標：** 確保開發環境正常運作，Element Plus 可用並應用了**與截圖一致的精確深色主題**，前後端可以通過 IPC 進行基本通訊。

### 階段二：SK Cinema 時刻表爬蟲 (SK Cinema Scraper)

*   **任務：**
    *   在 Electron 主行程中整合並配置 Playwright。
    *   參考 `project_skc_ui/skc_imdb_webapp/backend/src/services/skcScraper.js` 的實現，編寫 Playwright 腳本：
        *   啟動瀏覽器，導航至 SK Cinema 目標頁面 (`https://www.skcinemas.com/sessions?c=1004`)。
        *   設置監聽器攔截 `/api/VistaDataV2/GetHomePageListForApps` 和 `/GetSessionByCinemasIDForApp` API 回應。
        *   解析這兩個 API 返回的 JSON 資料。
    *   **定義 SK Cinema 電影資料結構 (TypeScript Interface):** 創建一個明確的介面來描述從 SK Cinema 獲取的電影資訊，至少包含：`filmNameID` (string | number), `movieName` (string), `englishTitle` (string), `posterUrl` (string | null), `skRating` (string), `ratingDescription` (string), `runtimeMinutes` (number), `sessions` (Array of Session Objects).
    *   **定義 Session 物件結構 (TypeScript Interface):** 包含 `date` (string - 格式化後), `showtime` (string - 格式化後), `endTime` (string - 格式化後), `theater` (string).
    *   **實作資料處理邏輯:**
        *   合併 `HomePage` 和 `Session` 資料。
        *   提取海報 URL。
        *   格式化日期和時間 (參考 `skcScraper.js` 中的 `formatSessionDate`, `formatSessionTime`)。
        *   將處理後的資料轉換為符合上述定義介面的物件陣列。
    *   **建立 IPC 接口:** 創建一個 IPC 通道 (如 `get-skc-movies`)，前端可以調用此接口觸發爬蟲，後端完成後返回符合定義介面的電影資料陣列。
*   **目標：** 能夠通過 IPC 從前端觸發，成功獲取、處理並返回結構化、格式化的 SK Cinema 電影時刻表資料陣列。
*   **階段性測試：**
    *   **運行開發模式測試：** 啟動 Electron 應用，驗證前端能觸發 SK Cinema 爬蟲並成功接收/展示（基礎）資料。
    *   **執行初步打包測試：** 打包應用並在打包版本中驗證 SK Cinema 爬蟲功能。

### 階段三：IMDb 資訊爬蟲 (IMDb Scraper)

*   **任務：**
    *   擴充 Electron 主行程中的 Playwright 功能。
    *   **定義包含 IMDb 資訊的完整電影資料結構 (TypeScript Interface):** 擴展階段二的電影介面，加入 IMDb 相關欄位，至少包含：`imdbRating` (string | number), `imdbUrl` (string), `plot` (string), `genres` (string), `directors` (string), `cast` (string)。
    *   **編寫 IMDb 爬蟲邏輯 (參考 `imdbService.js` 策略):**
        *   接收階段二產生的電影列表作為輸入。
        *   對於每部電影，使用 Playwright 控制瀏覽器：
            *   導航到 IMDb 網站，搜索電影標題。
            *   找到最匹配的電影詳情頁面連結並導航。
            *   **優先嘗試提取並解析頁面中的 JSON-LD 資料** (類似 `imdbService.js` 的方法)。
            *   如果 JSON-LD 失敗或不完整，**回退到使用 Playwright 的 DOM 查詢功能 (CSS 選擇器或 XPath)** 來提取所需資訊（評分、導演、演員、劇情、類型、IMDb 連結等）。需要考慮處理反爬機制。
    *   **合併資料:** 將獲取的 IMDb 資料合併到對應電影的資料結構中。
    *   **更新/建立 IPC 接口:** 創建或更新 IPC 通道 (如 `get-combined-movies`)，前端調用後，後端執行 SK Cinema 和 IMDb 爬蟲，最終返回包含兩者資訊的、符合完整定義介面的電影資料陣列。
*   **目標：** 能夠獲取並整合 IMDb 資訊，並通過 IPC 返回包含 SK Cinema 時刻表和 IMDb 詳細資訊的完整電影資料陣列。
*   **階段性測試：**
    *   **運行開發模式測試：** 啟動 Electron 應用，驗證前端能觸發完整流程並成功接收/展示合併後的資料。
    *   **執行打包測試：** 打包應用並在打包版本中驗證 SK Cinema 和 IMDb 爬蟲均能正常工作。

### 階段四：前端介面開發 (Frontend UI Development - Vue)

*   **視覺目標:** **完全複製**舊專案截圖 (`/Users/wu_cheng_yan/cursor/project_remake_skc_ui/UI_example.png`) 中的 UI 外觀、佈局、顏色和細節。
*   **任務：**
    *   使用 Vue Router 設定單一主視圖路由。
    *   利用 Element Plus 的 `ElContainer`, `ElAside`, `ElMain` 搭建雙欄佈局，**確保背景色、邊框、間距等與截圖一致**。
    *   **開發左側電影列表元件 (`ElAside`):**
        *   使其內容可滾動。
        *   使用 `ElCard` 或自訂結構展示電影預覽卡片，**確保卡片樣式（圓角、陰影、背景色）與截圖一致**。
        *   **定義前端使用的電影資料類型 (TypeScript Interface/Type):** 確保與 IPC 合約一致 (來自階段三的完整結構)。
        *   實現通過 IPC 調用 `get-combined-movies` 獲取資料。
        *   處理加載和錯誤狀態 (使用 Element Plus 元件並調整樣式)。
        *   **卡片內容:**
            *   `ElImage` (海報縮圖), **應用 CSS 實現底部垂直漸變淡出效果**。
            *   中文標題, 英文標題, `ElIcon` + IMDb 評分 (**確保字體、顏色、大小與截圖一致**)。
        *   實現按 IMDb 評分數據進行降序排序。
        *   實現點擊卡片選擇電影的交互，並提供**與截圖一致的視覺選中狀態** (例如不同的背景色或邊框)。
    *   **開發右側電影詳情元件 (`ElMain`):**
        *   內容根據左側選擇動態更新。
        *   **詳情內容:** `ElImage` (大海報), 中文/英文標題, 詳細 IMDb 評分, `ElTag` (顯示 `genres` 陣列, **樣式需匹配截圖**), 導演, 主演, 片長, 劇情簡介文本 (**確保各部分字體、顏色、間距與截圖一致**)。
        *   **時刻表顯示:**
            *   按日期 (`Session.date`) 分組顯示。
            *   顯示語言版本/影廳 (`Session.theater`)。
            *   使用 `ElButton` **並自訂樣式** (藍色背景、白色文字、圓角等) 或其他合適元件清晰地展示放映時間 (`Session.showtime`)，**使其外觀與截圖中的按鈕完全一致**。
*   **目標：** 完成一個功能完整、響應式、且**在視覺細節上（包括按鈕樣式、海報淡出、顏色主題）與參考截圖無法區分**的使用者介面。能正確調用後端爬蟲、處理資料/狀態，並按設計要求清晰展示所有電影資訊和時刻表。
*   **階段性測試：**
    *   **運行開發模式測試：** 啟動 Electron 應用，全面測試 UI 交互、資料展示和與後端 IPC 的協同工作。
    *   **執行打包測試：** 打包應用並進行端到端的功能和視覺驗證。

### 階段五：最終打包與全面測試 (Final Packaging & Comprehensive Testing)

*   **任務：**
    *   配置 Electron Builder 以生成目標平台（例如 macOS, Windows）的應用程式安裝包，並進行**最終**打包。
    *   執行打包命令。
    *   在不同環境下進行**最終的**安裝和**全面的**功能測試，重點驗證：
        *   爬蟲功能在打包後是否穩定工作。
        *   IPC 通訊是否穩定可靠。
        *   **UI 顯示和交互是否在所有目標平台上均與截圖完全一致。**
    *   修復測試中發現的所有剩餘問題。
*   **目標：** 產生經過全面測試、可在目標平台上穩定運行的最終應用程式版本。

### 階段六：優化與完善 (Refinement & Optimization - Optional)

*   **任務：**
    *   根據需要改善錯誤處理機制和使用者回饋。
    *   進行必要的效能優化（例如，將爬蟲任務放入獨立的工作線程或使用非阻塞操作，避免 UI 卡頓）。
    *   調整 UI/UX 細節，提升使用者體驗。
    *   考慮增加資料持久化功能（例如，將爬蟲結果緩存到本地文件或 localStorage），避免每次啟動都重新抓取，並提供離線查看能力。
*   **目標：** 提升應用程式的穩定性、效能和整體使用者體驗。 