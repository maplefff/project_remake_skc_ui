# 開發階段 4：前端 UI 調整備忘 (memo_phase_4.md)

本文件記錄在開發階段 4 中，針對新專案 `skc_imdb_webapp` 的前端 UI (`src/renderer/src/App.vue`) 進行的主要調整過程和最終狀態。

**核心目標：** 根據使用者提供的舊專案 `project_skc_ui` 中的 `HomeView.vue` 視覺效果，重新建構 `App.vue` 的介面。

**主要調整記錄：**

1.  **放棄早期佈局嘗試：**
    *   最初嘗試了原生 Flexbox 三欄佈局和 Element Plus 三欄佈局，後根據使用者指示放棄。
    *   也嘗試了 Element Plus 左右兩欄，右側再分兩欄的佈局，並使用 `v-if` 移除了初始佔位符，但這也不是最終方案。

2.  **採用舊專案 `HomeView.vue` 結構與樣式：**
    *   **結構複製：** 將 `HomeView.vue` 的整體模板結構（包含 `<el-header>`, `<el-container>`, `<el-aside>`, `<el-main>` 的佈局，以及 `<el-main>` 內部分為 `.details-content` 和 `.details-poster` 的結構）複製到 `App.vue` 的 `<template>` 中。
    *   **樣式複製：** 將 `HomeView.vue` 的 `<style scoped>` 內的全部 CSS 規則（包括深色主題變數、佈局、列表項、詳情、標籤、時刻表、海報、載入動畫等樣式）複製到 `App.vue` 的 `<style>` 中。
    *   **移除 `scoped`:** 為了能覆蓋全域樣式（如 `body` margin），移除了 `<style>` 標籤的 `scoped` 屬性。

3.  **狀態與邏輯模擬：**
    *   由於新專案**未使用 Pinia**，將舊專案中由 Pinia 管理的狀態（`movies`, `selectedMovie`, `loading`, `error`, `loadingMessage`）改為在 `App.vue` 中使用本地的 `ref()` 進行模擬。
    *   將舊專案中觸發 Store action 的操作改為調用 `App.vue` 內部的本地異步函數 `fetchMovies` 和同步函數 `selectMovie`。
    *   `fetchMovies` 內部填充了**硬編碼的佔位數據 (Placeholder Data)** 以便預覽 UI，並模擬了載入延遲。
    *   複製了必要的輔助函數（`groupedAndSortedSessions`, `formatGroupDateTitle`, `formatRuntime`）到 `App.vue`。

4.  **佈局微調（貼合邊界與穩定性）：**
    *   為實現內容貼合應用程式視窗邊界，進行了多次調整：
        *   確保 `body { margin: 0; }`。
        *   為 `#app` (在 `index.css` 中) 添加 `width: 100%; height: 100vh; display: block;`。
        *   確保 `.common-layout` 和 `.main-container` 均設定 `width: 100%;` 和 `height: 100vh;`。
        *   移除 `.common-layout` 的 `padding` 和 flex 居中樣式。
        *   移除 `.main-container` 的 `max-width`, `border-radius`, `box-shadow` 等卡片樣式。
        *   為 Flexbox 子項（如 `.movie-details-main`, `.details-content`）添加 `min-width: 0;` 防止內容溢出。
        *   為電影標題 `h2` 添加 `word-break: break-all;` 樣式防止撐開佈局。
    *   添加了全域 `* { box-sizing: border-box; }` 以統一盒模型計算。

5.  **標題欄 (`<el-header>`) 調整：**
    *   標題 `<h1>` 設定 `text-align: left;`。
    *   最終調整 `<h1>` 的高度和行高為 `height: 75px; line-height: 75px;`，並重設 `margin: 0;`。
    *   Header 的上下 `padding` 恢復為 `1rem`。

6.  **TypeScript 型別處理：**
    *   根據使用者指示，**保持 `ipc-interfaces.ts` 中 `CombinedMovieData` 的原始定義** (`filmNameID: string | number`, `imdbRating: string | null`) 不變。
    *   修改了 `App.vue` 中的佔位數據和模板渲染邏輯，以**嚴格符合**這些混合型別：
        *   `filmNameID` 使用字符串，比較時用 `String()` 轉換。
        *   `imdbRating` 使用字符串 (`'8.6'`, `'-1'`, `'-2'`) 或 `null`，比較特殊值用字符串比較。
        *   顯示數字評分前，檢查是否為非 null 且非特殊值的字符串，再用 `parseFloat().toFixed(1)` 轉換顯示。
    *   解決了 `v-if/else` 分支的 `key` 唯一性問題。
    *   解決了 `formatGroupDateTitle` 的參數型別問題 (使用 `as string`)。

**目前狀態：**

*   `App.vue` 的 UI 結構和樣式已調整為與舊專案 `HomeView.vue` 非常接近。
*   UI 顯示的是**內部模擬的佔位數據**。
*   佈局設定為**填滿整個應用程式視窗**，左右貼合邊界。
*   應用程式可通過 `npm run dev` 在瀏覽器中獨立運行預覽。
*   下一步是將 `fetchMovies` 函數中的模擬數據邏輯替換為實際調用 Electron IPC (`window.electronAPI.getCombinedMovieData()`) 的邏輯，以實現前後端數據對接。
*   關於應用程式**預設及最小視窗大小**的設定方法已確認在 `src/main/index.ts` 中。 