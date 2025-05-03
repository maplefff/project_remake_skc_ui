# Memo 5: 打包 Playwright 瀏覽器到 Electron 應用

本文檔記錄了將 Playwright 及其所需的瀏覽器（此處以 Chromium 為例）打包進 Electron 應用的詳細步驟和配置方法，以便應用在沒有全局安裝 Playwright 的環境下也能獨立運行。

## 關鍵步驟與配置

1.  **安裝 Playwright 與瀏覽器:**
    *   確保 Playwright 已作為開發依賴安裝到專案中：
        ```bash
        npm install --save-dev playwright
        # 或 yarn add --dev playwright
        ```
    *   下載所需的瀏覽器（例如 Chromium）。這會將瀏覽器下載到 Playwright 的本地快取目錄。
        ```bash
        npx playwright install chromium
        ```
    *   **注意:** Playwright 的瀏覽器快取路徑可能因操作系統而異。在 macOS 上，通常位於 `~/Library/Caches/ms-playwright/`。需要找到實際下載的瀏覽器版本目錄（例如 `chromium-1169`）。

2.  **配置 `electron-builder` (`package.json`):**
    *   在 `package.json` 的 `build` 配置段中，使用 `extraResources` 字段來指定需要複製到打包後應用資源目錄的文件或目錄。
    *   `from`: 指向本地 Playwright 瀏覽器快取的 **具體版本目錄**。**必須使用絕對路徑或相對於用戶主目錄的路徑 (`~`)**，因為 `electron-builder` 可能無法正確解析相對於專案的路徑。
    *   `to`: 指定瀏覽器文件夾在打包後應用資源 (`app.asar.unpacked` 或 `Resources` 目錄下) 中的相對路徑。建議使用一個清晰的名稱，例如 `pw-browsers/<browser-version>`。

    ```json
    // package.json (部分)
    "build": {
      "appId": "com.example.skc-imdb-app",
      "productName": "SKCinema IMDb Rating",
      "files": [
        "dist/main/**/*",
        "dist/preload/**/*",
        "dist/renderer/**/*"
      ],
      "directories": {
        "output": "release"
      },
      "mac": {
        "icon": "resources/icon.icns"
      },
      "win": {
        "icon": "resources/icon.ico"
      },
      "extraResources": [
        {
          "from": "~/Library/Caches/ms-playwright/chromium-1169/", // macOS 示例，需替換為實際快取路徑和版本
          "to": "pw-browsers/chromium-1169", // 打包後資源目錄下的路徑
          "filter": [
            "**/*" // 確保複製所有內容
          ]
        }
        // 如果需要打包其他瀏覽器，在此處添加更多對象
      ]
      // ... 其他配置
    }
    ```

3.  **在 Electron 主進程中設置環境變數:**
    *   在應用啟動時（通常在 `src/main/index.ts` 或類似文件中），需要檢查應用是否處於打包狀態 (`app.isPackaged`)。
    *   如果已打包，則必須設置 `PLAYWRIGHT_BROWSERS_PATH` 環境變數，使其指向打包後資源目錄中包含瀏覽器的 **父目錄** (`pw-browsers`)。Playwright 會在此路徑下查找其可執行的瀏覽器。
    *   `process.resourcesPath` 是 Electron 提供的變數，指向打包後應用的資源目錄。

    ```typescript
    // src/main/index.ts (部分)
    import { app } from 'electron';
    import path from 'path';

    // ... 其他導入和代碼 ...

    if (app.isPackaged) {
      // 指向 extraResources 中 'to' 指定路徑的上一層目錄
      process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(process.resourcesPath, 'pw-browsers');
      console.log(`[Main] Setting PLAYWRIGHT_BROWSERS_PATH (packaged): ${process.env.PLAYWRIGHT_BROWSERS_PATH}`);
    } else {
       console.log(`[Main] Running in development mode, using default Playwright path.`);
       // 開發模式下，Playwright 會自動查找其默認安裝/快取路徑
    }

    // ... 應用啟動邏輯 ...
    ```

4.  **執行打包:**
    *   運行 `electron-builder` 的打包命令：
        ```bash
        npm run build:mac # 或其他目標平台的命令
        # 或 yarn build:mac
        ```

## 注意事項

*   **瀏覽器快取路徑:** 不同操作系統（Windows, Linux）的 Playwright 快取路徑不同，需要相應修改 `extraResources.from` 的路徑。
*   **瀏覽器版本:** `extraResources` 中的 `from` 和 `to` 路徑應包含具體的瀏覽器版本號，確保打包的是正確版本。
*   **Playwright 版本更新:** 如果更新了 Playwright 依賴，可能需要重新運行 `npx playwright install <browser>` 並更新 `package.json` 中 `extraResources` 的瀏覽器版本路徑。
*   **打包體積:** 將瀏覽器打包進應用會顯著增加最終的安裝包體積。
*   **`filter`:** 確保 `filter` 設置為 `["**/*"]` 或包含所有必要的文件，避免遺漏。
*   **環境變數設置時機:** `PLAYWRIGHT_BROWSERS_PATH` 必須在任何 Playwright 操作（如 `chromium.launch()`）執行之前設置。

通過以上步驟，可以將 Playwright 瀏覽器成功嵌入 Electron 應用，實現離線獨立運行。
