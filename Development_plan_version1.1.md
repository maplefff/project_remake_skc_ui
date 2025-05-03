# Development Plan for Version 1.1.0 - 只顯示當日功能

**目標:** 在應用程式標頭右側新增一個開關，讓使用者可以選擇只顯示當天有場次的電影及其對應的當日場次。

---

## 第一步：新增 UI 元件與佈局

1.  **目標：** 在標頭右側顯示「只顯示當日」的 switch 按鈕，外觀符合要求，可以點擊切換狀態，但**不**觸發任何過濾功能。
2.  **詳細子步驟：**
    *   **(Template)** 在 `App.vue` 的 `<el-header>` 區塊內，加入一個 `<el-switch>` 元件。
    *   **(Template)** 為 `<el-switch>` 設定文字標籤或使用相鄰的 `<label>`。
    *   **(Script)** 在 `App.vue` 的 `<script setup>` 中，新增一個 `ref` 變數 `showTodayOnly = ref(false)`。
    *   **(Template)** 將 `<el-switch>` 的 `v-model` 綁定到 `showTodayOnly`。
    *   **(Style)** 在 `App.vue` 的 `<style>` 區塊中，編寫 CSS 規則，將 switch 定位到標頭區域的右側，確保與標題垂直對齊。
    *   **測試：** 運行應用程式，確認：
        *   Switch 按鈕出現在標頭右側，位置和外觀正確。
        *   可以點擊 switch 來切換其視覺上的開/關狀態。
        *   切換 switch **不會**影響左側電影列表或右側電影詳情的任何顯示內容。

---

## 第二步：過濾左側電影列表

1.  **目標：** 當 switch 被勾選（設定為「只顯示當日」）時，左側的電影列表應只顯示當天有場次的電影。移除海報的 lazy loading。
2.  **詳細子步驟：**
    *   **(Script)** 在 `App.vue` 中實作獲取當前日期 (MM-DD 格式) 的邏輯。
    *   **(Template)** 找到左側電影列表中的 `<el-image>` (class `list-item-poster-image`)，移除 `lazy` 屬性。
    *   **(Script)** 建立 `filteredMovies` 計算屬性：
        *   如果 `showTodayOnly` 為 `false`，返回所有 `movies`。
        *   如果 `showTodayOnly` 為 `true`，則遍歷 `movies`，只返回 `sessions` 中包含**當前日期**場次的電影。
    *   **(Template)** 修改左側電影列表的 `v-for`，使其迭代 `filteredMovies` 而不是 `movies`。
    *   **測試：** 運行應用程式，確認：
        *   取消勾選 switch 時，顯示所有電影。
        *   勾選 switch 時，左側列表只顯示當天有場次的電影。
        *   列表刷新時，電影海報不再顯示佔位符（lazy loading 已移除）。
        *   點擊篩選後的電影，右側詳情（此階段還未修改）能正常顯示該電影的所有場次資訊。

---

## 第三步：過濾右側電影詳情場次

1.  **目標：** 當 switch 被勾選時，右側電影詳情區域顯示的場次表，也應只顯示當天的場次。
2.  **詳細子步驟：**
    *   **(Script)** 修改 `groupedAndSortedSessions` 計算屬性：
        *   在其現有邏輯處理 `selectedMovie.value.sessions` 之前或之初，加入判斷。
        *   如果 `showTodayOnly` 為 `true`，則只選取 `date` 為**當前日期**的 `session` 進行後續的分組和排序。
        *   如果 `showTodayOnly` 為 `false`，則處理所有 `session`（保持原樣）。
    *   **測試：** 運行應用程式，確認：
        *   取消勾選 switch 時，選擇電影後，右側顯示所有日期的場次。
        *   勾選 switch 時，選擇電影後，右側**只**顯示當天的場次，且按類型和時間正確分組排序。
        *   在勾選狀態下，如果選擇的電影當天沒有場次，右側應正確顯示「無場次資訊」。
        *   反覆切換 switch，左右兩側的顯示都能正確、同步地更新。 