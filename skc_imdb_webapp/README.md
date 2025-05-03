# skc_imdb_webapp

## 專案目的 (Project Purpose)

本專案旨在開發一個 Electron 桌面應用程式，用於方便地查詢 IMDb（Internet Movie Database）的電影評分。它可能整合或輔助 SKCinema 相關的電影資訊查詢需求，提供一個簡潔易用的介面來獲取評分數據。

## 技術選型 (Technology Stack)

*   **框架 (Framework):** Electron
*   **前端 (Frontend):** Vue.js 3, TypeScript
*   **建構工具 (Build Tool):** Vite
*   **套件管理器 (Package Manager):** npm
*   **程式碼檢查與格式化 (Linting/Formatting):** ESLint, Prettier
*   **IDE 建議 (Recommended IDE):** VSCode + Volar (Vue), ESLint, Prettier extensions

## 專案設定 (Project Setup)

### 前置準備 (Prerequisites)

*   **安裝 Node.js 和 npm (Install Node.js and npm):**
    *   本專案需要 Node.js (建議使用 LTS 版本) 和 npm (Node Package Manager)。
    *   npm 通常會隨著 Node.js 一起安裝。您可以從 [Node.js 官方網站](https://nodejs.org/) 下載並安裝適合您作業系統的版本。
    *   安裝完成後，您可以在終端機（Terminal）或命令提示字元（Command Prompt）中執行以下指令來驗證安裝是否成功：
        ```bash
        node -v
        npm -v
        ```

### 安裝步驟 (Installation Steps)

1.  **複製儲存庫 (Clone the repository):**
    ```bash
    git clone <YOUR_REPOSITORY_URL> # 請替換成您的儲存庫 URL
    ```
2.  **進入專案目錄 (Navigate to the project directory):**
    ```bash
    cd skc_imdb_webapp
    ```
3.  **安裝依賴 (Install dependencies):**
    ```bash
    npm install
    ```

### 開發模式 (Development)

啟動開發伺服器，支援熱重載。
```bash
npm run dev
```

### 建構應用程式 (Build)

為指定平台建構可執行的應用程式。
```bash
# For Windows
npm run build:win

# For macOS
npm run build:mac

# For Linux
npm run build:linux
```

## 專案結構 (Project Structure)

```
.
├── electron-builder.yml
├── electron.vite.config.ts
├── eslint.config.mjs
├── index.html
├── package-lock.json
├── package.json
├── README.md
├── resources
│   └── icon.icns
├── src
│   ├── main
│   │   ├── index.ts
│   │   └── scraper
│   ├── preload
│   │   ├── index.d.ts
│   │   └── index.ts
│   ├── renderer
│   │   ├── index.html
│   │   └── src
│   └── shared
│       └── ipc-interfaces.ts
├── tsconfig.json
├── tsconfig.node.json
└── tsconfig.web.json

```
