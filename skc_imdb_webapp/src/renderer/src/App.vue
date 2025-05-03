<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted } from 'vue'
// Import necessary components and icons from Element Plus
import { ElContainer, ElHeader, ElAside, ElMain, ElScrollbar, ElImage, ElIcon, ElAlert, ElButton, ElSwitch } from 'element-plus'
import { Star, Picture as IconPicture, Film, Link, Loading } from '@element-plus/icons-vue'
import type { CombinedMovieData, SKCSession, LoadingProgressPayload } from 'src/shared/ipc-interfaces' // Assuming interface path

// --- Simulate Pinia Store State ---
const movies = ref<CombinedMovieData[]>([]);
const loading = ref<boolean>(true); // Start in loading state
const error = ref<string | null>(null);
const selectedMovie = ref<CombinedMovieData | null>(null);
const loadingMessage = ref<string>('正在初始化...'); // Changed initial message
const loadingProgressX = ref<number | null>(null);
const loadingProgressN = ref<number | null>(null);
const loadingMovieName = ref<string | null>(null);
const showTodayOnly = ref(true); // State for the 'Show Today Only' switch - Default back to true

// --- Simulate Store Actions ---
async function fetchMovies() {
  console.log("Fetching real movie data...");
  loading.value = true;
  error.value = null;
  // Reset detailed progress
  loadingProgressX.value = null;
  loadingProgressN.value = null;
  loadingMovieName.value = null;
  // Initial message set here, will be quickly overwritten by P0
  loadingMessage.value = '正在初始化...'; 

  try {
    // --- Call the actual IPC API exposed via preload script ---
    if (window.ipc?.getCombinedMovieData) {
        console.log("Calling window.ipc.getCombinedMovieData()...");
        // The actual data fetching is triggered, progress updates handled by listener
        const fetchedMovies: CombinedMovieData[] = await window.ipc.getCombinedMovieData();
        console.log(`Received ${fetchedMovies.length} movies from backend.`);

        // Update state with fetched data
        movies.value = fetchedMovies;
        if (fetchedMovies.length > 0) {
          selectMovie(fetchedMovies[0]);
        } else {
          selectedMovie.value = null;
        }
        console.log("Fetch and state update complete.");
    } else {
        throw new Error('Electron IPC API (window.ipc.getCombinedMovieData) is not available.');
    }
  } catch (e: any) {
    console.error("Error fetching combined movie data:", e);
    error.value = e.message || '獲取電影數據時發生未知錯誤。';
    movies.value = [];
    selectedMovie.value = null;
  } finally {
    loading.value = false;
    // Clear detailed progress state when loading finishes
    loadingProgressX.value = null;
    loadingProgressN.value = null;
    loadingMovieName.value = null;
  }
}

function selectMovie(movie: CombinedMovieData) {
  console.log(`Selecting movie: ${movie.filmNameID}`);
  // Use string/number comparison tolerant find or ensure IDs are consistent type
  selectedMovie.value = movies.value.find(m => String(m.filmNameID) === String(movie.filmNameID)) || null;
}

// --- Computed Properties and Helpers (Copied from HomeView.vue) ---

// Computed property to filter movies based on the switch
const filteredMovies = computed(() => {
  if (!showTodayOnly.value) {
    return movies.value; // If switch is off, show all movies
  }

  // Get today's date in MM-DD format
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, '0'); // Month is 0-indexed
  const day = String(today.getDate()).padStart(2, '0');
  const todayDateStr = `${month}-${day}`;

  console.log(`Filtering for date: ${todayDateStr}`); // Log the date being used for filtering

  return movies.value.filter(movie => {
    if (!movie.sessions || movie.sessions.length === 0) {
      return false; // Exclude movies with no sessions at all
    }
    // Check if any session date matches today's date
    const hasTodaySession = movie.sessions.some(session => session.date === todayDateStr);
    //console.log(`Movie: ${movie.movieName}, Has Today Session: ${hasTodaySession}`); // Log individual movie check
    return hasTodaySession;
  });
});

// --- 新增: 獲取用於分組的正規化 FilmType ---
function getGroupedFilmType(rawFilmType: string | undefined | null): string {
  if (!rawFilmType) return '未知類型';
  const lowerCaseType = rawFilmType.toLowerCase();
  if (lowerCaseType.includes('b.o.x') || lowerCaseType.includes('box') || lowerCaseType.includes('sealy') || lowerCaseType.includes('osim')) {
    return 'B.O.X.'; // 正規化名稱改為 B.O.X.
  }
  return rawFilmType; // 返回原始名稱
}

// 修改: 排序輔助函數，調整 B.O.X. 和普通廳的優先級
function getFilmTypePriority(filmType: string): number {
    const lowerCaseType = filmType.toLowerCase();
    if (lowerCaseType.includes('dolby')) return 0;
    if (lowerCaseType.includes('luxe')) return 1;
    // --- 修改: 調整 B.O.X. 和普通廳的優先級 ---
    if (lowerCaseType.includes('b.o.x.')) return 3; // B.O.X. 改為 3
    // 其他所有類型 (數位, 日語版 etc.) 為普通優先級
    return 2; // 普通廳改為 2
}

// 修改: groupedAndSortedSessions 使用正規化類型進行分組
const groupedAndSortedSessions = computed(() => {
  if (!selectedMovie.value?.sessions) {
    return {};
  }

  // --- MODIFIED START: Initialize sessionsToProcess based on showTodayOnly ---
  let sessionsToProcess: SKCSession[];

  if (showTodayOnly.value) {
    // Get today's date in MM-DD format
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, '0'); 
    const day = String(today.getDate()).padStart(2, '0');
    const todayDateStr = `${month}-${day}`;

    console.log(`Filtering right panel sessions for date: ${todayDateStr}`);

    sessionsToProcess = selectedMovie.value.sessions.filter(session => session.date === todayDateStr);
  } else {
    // If the switch is off, use all sessions
    sessionsToProcess = selectedMovie.value.sessions;
    console.log("Showing all sessions as 'Show Today Only' is off.");
  }
  // --- MODIFIED END ---

  // Continue with grouping and sorting using potentially filtered sessionsToProcess
  
  // 臨時分組結構
  const tempGroupedData: { 
      [dateKey: string]: { 
          weekday: string; 
          filmTypes: { [type: string]: SKCSession[] } 
      } 
  } = {};

  // Use sessionsToProcess instead of selectedMovie.value.sessions directly
  for (const session of sessionsToProcess) { 
    const dateKey = session.date; 
    if (!dateKey || !session.weekday) continue;
    // --- 修改: 使用正規化函數獲取分組依據的 filmType --- 
    const filmType = getGroupedFilmType(session.filmType);
    // --- 修改結束 ---
    if (!tempGroupedData[dateKey]) {
      tempGroupedData[dateKey] = { weekday: session.weekday, filmTypes: {} };
    }
    if (!tempGroupedData[dateKey].filmTypes[filmType]) {
      tempGroupedData[dateKey].filmTypes[filmType] = [];
    }
    tempGroupedData[dateKey].filmTypes[filmType].push(session);
  }

  // 最終的、排序後的結構
  const finalSortedData: { 
      [dateKey: string]: { 
          weekday: string; 
          // 修改: filmTypes 現在是排序後的陣列
          sortedFilmTypes: { filmType: string; sessions: SKCSession[] }[] 
      } 
  } = {};

  // 遍歷日期進行排序
  for (const dateKey in tempGroupedData) {
    const dateGroup = tempGroupedData[dateKey];
    const filmTypeKeys = Object.keys(dateGroup.filmTypes);

    // 根據自訂邏輯排序 filmTypeKeys
    filmTypeKeys.sort((a, b) => getFilmTypePriority(a) - getFilmTypePriority(b));

    // 創建排序後的 filmTypes 陣列
    const sortedTypesArray = filmTypeKeys.map(filmType => ({
      filmType: filmType,
      sessions: dateGroup.filmTypes[filmType].sort((sA, sB) => sA.showtime.localeCompare(sB.showtime)) //確保內部session排序
    }));

    finalSortedData[dateKey] = {
      weekday: dateGroup.weekday,
      sortedFilmTypes: sortedTypesArray
    };
  }

  console.log("Final Sorted Sessions Structure:", finalSortedData);
  return finalSortedData;
});

// Updated function to accept weekday
function formatGroupDateTitle(dateKey: string, weekday: string): string {
  if (!dateKey || !weekday) return '日期未知';
  // Simple MM-DD to MM/DD format
  const dateParts = dateKey.split('-');
  if (dateParts.length === 2) {
    return `${weekday} (${dateParts[0]}/${dateParts[1]})`;
  } else {
    return `${weekday} (${dateKey})`; // Fallback
  }
}

function formatRuntime(totalMinutes: number | undefined): string {
  if (typeof totalMinutes !== 'number' || isNaN(totalMinutes) || totalMinutes <= 0) {
    return '片長未知';
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  let result = '';
  if (hours > 0) {
    result += `${hours} 小時 `;
  }
  if (minutes > 0) {
    result += `${minutes} 分`;
  }
  return result.trim() || '片長未知'; // Return '片長未知' if result is empty (e.g., 0 minutes)
}

// --- 新增: 清理 Loading Progress Listener --- 
let cleanupLoadingProgressListener: (() => void) | null = null;

// --- 新增: 處理場次點擊的方法 ---
function handleSessionClick(session: SKCSession) {
  if (!session?.sessionId) {
    console.warn('Session ID is missing, cannot open link.', session);
    return;
  }
  const targetUrl = `https://www.skcinemas.com/booking/seats?c=1004&s=${session.sessionId}`;
  console.log('Opening external URL:', targetUrl);
  if (window.ipc?.openExternalUrl) {
    window.ipc.openExternalUrl(targetUrl).catch(error => {
      console.error('Failed to open external URL via IPC:', error);
      // 可以考慮在這裡顯示一個錯誤提示給用戶
    });
  } else {
    console.error('window.ipc.openExternalUrl is not available.');
  }
}

// --- Lifecycle Hook ---

onMounted(() => {
  // Register listener for loading progress updates
  if (window.ipc?.onUpdateLoadingProgress) {
    console.log('Registering loading progress listener...');
    // Define the callback function
    const handleProgressUpdate = (payload: LoadingProgressPayload) => {
      console.log('Received Progress:', payload); // Debug log
      loadingMessage.value = payload.message; // Always update the main message
      
      // Update detailed progress based on type
      if (payload.type.startsWith('imdb-progress')) {
          loadingProgressX.value = payload.x ?? null;
          loadingProgressN.value = payload.n ?? null;
          loadingMovieName.value = payload.movieName ?? null;
      } else {
          // Reset detailed progress for non-IMDb steps
          loadingProgressX.value = null;
          loadingProgressN.value = null;
          loadingMovieName.value = null;
      }
      // Handle skc-complete to potentially update N for display even before IMDb starts
      if (payload.type === 'skc-complete') {
          loadingProgressN.value = payload.totalMoviesWithSessions ?? null;
      } 
    };
    // --- 修改: 保存清理函數 --- 
    cleanupLoadingProgressListener = window.ipc.onUpdateLoadingProgress(handleProgressUpdate);
  } else {
    console.warn('window.ipc.onUpdateLoadingProgress is not available.');
  }

  // Fetch initial data
  fetchMovies();
});

// --- 新增: 在組件卸載時清理 Listener --- 
onUnmounted(() => {
  if (cleanupLoadingProgressListener) {
    cleanupLoadingProgressListener();
    console.log('Cleaned up loading progress listener on component unmount.');
  }
});

</script>

<template>
  <div class="common-layout home-view-dark">
    <!-- Loading Overlay -->
    <div v-if="loading" class="custom-loading-overlay">
      <el-icon class="is-loading custom-loading-spinner" :size="30">
        <Loading />
      </el-icon>
      <p class="custom-loading-text">{{ loadingMessage }}</p>
    </div>

    <!-- Main Application Container -->
  <el-container class="main-container">
      <!-- Header Section -->
      <el-header height="auto" class="main-header">
         <!-- Wrap title and switch for flex layout -->
         <div class="header-content">
           <h1 class="header-title-wrapper">
             新光影城電影列表 — 青埔影院
             <a href="https://www.skcinemas.com/sessions?c=1004" target="_blank" rel="noopener noreferrer" class="header-link-icon">
               <el-icon><Link /></el-icon>
             </a>
           </h1>
           <!-- 'Show Today Only' Switch -->
           <div class="show-today-switch-container">
              <el-switch
                v-model="showTodayOnly"
                size="large"
                id="showTodaySwitch" 
              />
              <label for="showTodaySwitch" class="switch-label">只顯示當日場次</label> 
           </div>
         </div>
         <!-- Error Alert -->
         <el-alert
           v-if="error"
           :title="'載入數據時發生錯誤'"
           type="error"
           :closable="false"
           show-icon
           class="error-alert"
         >
           <p>{{ error }}</p>
           <el-button @click="fetchMovies" type="primary" size="small" style="margin-top: 10px;">重試</el-button>
         </el-alert>
      </el-header>

      <!-- Content Area (only shown when not loading and no error) -->
      <el-container v-if="!loading && !error" class="content-container">
        <!-- Left Sidebar: Movie List -->
        <el-aside width="260px" class="movie-list-aside">
          <el-scrollbar>
            <!-- Placeholder if no movies -->
            <div v-if="movies.length === 0" class="no-movies-placeholder">
              目前沒有可顯示的電影。
            </div>
            <!-- Movie List Items -->
            <div v-else class="movie-list-items">
               <div
                 v-for="movie in filteredMovies"
                 :key="String(movie.filmNameID)"
                 class="movie-list-item"
                 :class="{ 'is-selected': selectedMovie && String(selectedMovie.filmNameID) === String(movie.filmNameID) }"
                 @click="selectMovie(movie)"
                >
                   <!-- List Item Poster -->
                   <el-image
                     :src="movie.posterPath || ''"  
                     :alt="`${movie.movieName} Poster`"
                     fit="cover"
                     class="list-item-poster-image"
                   >
                     <template #error>
                       <div class="image-slot-error list-item-poster-error">
                         <el-icon><IconPicture /></el-icon>
                       </div>
                     </template>
                     <template #placeholder>
                       <div class="image-slot-placeholder list-item-poster-placeholder-content"></div>
                     </template>
                   </el-image>

                   <!-- List Item Details -->
                   <div class="list-item-details">
                    <h4>{{ movie.movieName.replace(/　/g, ' ') }}</h4>
                    <p class="list-item-english-title">{{ movie.englishTitle }}</p>
                    <p class="rating imdb-rating-list">
                      <el-icon><Star /></el-icon>
                      <span v-if="movie.imdbRating === '-1'" class="rating-unavailable">未評分</span>
                      <span v-else-if="movie.imdbRating === '-2'" class="rating-unavailable">查詢失敗</span>
                      <span v-else-if="movie.imdbRating !== null">{{ parseFloat(movie.imdbRating).toFixed(1) }}</span>
                      <span v-else class="rating-unavailable">...</span>
                    </p>
                  </div>
               </div>
            </div>
          </el-scrollbar>
      </el-aside>

        <!-- Right Main Area: Movie Details -->
        <el-main class="movie-details-main">
          <!-- Placeholder if no movie selected -->
          <div v-if="!selectedMovie" class="details-placeholder" key="placeholder">
            <el-icon size="50"><Film /></el-icon>
            <p>請從左側列表選擇一部電影以查看詳情。</p>
          </div>
          <!-- Selected Movie Details View -->
          <div v-else class="selected-movie-details" key="details">
            <!-- Left Part: Textual Details -->
            <div class="details-content">
              <h2 style="word-break: break-all;">{{ selectedMovie.movieName.replace(/　/g, ' ') }}</h2>
              <p class="detail-english-title">{{ selectedMovie.englishTitle }}</p>
              <p class="rating">
                <el-icon><Star /></el-icon>
                <span v-if="selectedMovie.imdbRating === '-1'" class="rating-unavailable">IMDb未評分</span>
                <span v-else-if="selectedMovie.imdbRating === '-2'" class="rating-unavailable">IMDb查詢失敗</span>
                <span v-else-if="selectedMovie.imdbRating !== null">{{ parseFloat(selectedMovie.imdbRating).toFixed(1) + ' / 10 (IMDb)' }}</span>
                <span v-else class="rating-unavailable">...</span>
              </p>
              <div class="tags">
                 <span v-if="!selectedMovie.genres || selectedMovie.genres.length === 0" class="genre-tag-capsule" key="genres-placeholder">類型...</span>
                 <span v-else-if="Array.isArray(selectedMovie.genres)" v-for="genre in selectedMovie.genres" :key="genre" class="genre-tag-capsule">{{ genre }}</span>
              </div>
              <p class="credits">導演：<span>{{ Array.isArray(selectedMovie.directors) ? selectedMovie.directors.join(', ') : selectedMovie.directors || '...' }}</span></p>
              <p class="credits">主演：<span>{{ Array.isArray(selectedMovie.cast) ? selectedMovie.cast.join(', ') : selectedMovie.cast || '...' }}</span></p>
              <p class="credits runtime">片長：<span>{{ formatRuntime(selectedMovie.runtimeMinutes) }}</span></p>

              <h3>劇情簡介</h3>
              <p class="plot">{{ selectedMovie.ratingDescription || selectedMovie.plot || '...' }}</p>

              <!-- Sessions Section -->
              <div class="sessions-container">
                 <p v-if="!groupedAndSortedSessions || Object.keys(groupedAndSortedSessions).length === 0" class="no-sessions-info">無場次資訊</p>
                 <div
                   v-else
                   v-for="(dateGroupData, dateKey) in groupedAndSortedSessions" 
                   :key="dateKey"
                   class="session-date-group"
                  >
                    <!-- Pass both dateKey and weekday -->
                    <h4 class="session-date-title">時刻表 - {{ formatGroupDateTitle(dateKey as string, dateGroupData.weekday) }}</h4>
                    <div class="filmtype-columns-container">
                       <div
                         v-for="typeGroup in dateGroupData.sortedFilmTypes" 
                         :key="typeGroup.filmType"
                         class="filmtype-column"
                       >
                         <h5 class="filmtype-column-title">{{ typeGroup.filmType }}</h5>
                         <div
                           v-for="(session, index) in typeGroup.sessions"
                           :key="`${dateKey}-${typeGroup.filmType}-${index}`"
                           class="session-item-in-column"
                          >
                            <span 
                              class="showtime-tag-apple" 
                              @click="handleSessionClick(session)"
                              :style="{ cursor: session.sessionId ? 'pointer' : 'default' }" 
                            >
                              {{ session.showtime }}
                            </span>
                            <!-- Conditionally show screen name using new fields, check ORIGINAL filmType -->
                            <span
                              v-if="session.screenName && !(session.filmType?.toLowerCase().includes('luxe') || session.filmType?.toLowerCase().includes('dolby'))"
                              class="session-screenname"
                            >
                              {{ session.screenName }}
                            </span>
                          </div>
                       </div>
                    </div>
                  </div>
               </div>

              <!-- IMDb Link Section -->
              <div class="imdb-section">
                 <p v-if="selectedMovie.imdbUrl" class="imdb-link-wrapper">
                   <a :href="selectedMovie.imdbUrl" target="_blank" rel="noopener noreferrer" class="imdb-link">
                     在 IMDb 上查看
                     <el-icon><Link /></el-icon>
                   </a>
                 </p>
                 <p v-else-if="!loading" class="imdb-link-unavailable">
                     無法獲取 IMDb 連結。
                 </p>
                 <br>
                 <br>
                 <br>
               </div>
            </div>
            <!-- Right Part: Poster -->
            <div class="details-poster">
              <el-image
                :src="selectedMovie.posterPath || ''" 
                :alt="`${selectedMovie.movieName} Poster`"
                fit="contain"
                class="detail-poster-image"
              >
                 <template #error>
                   <div class="image-slot-error">
                     <el-icon><IconPicture /></el-icon> <span>圖片加載失敗</span>
                   </div>
                 </template>
                  <template #placeholder>
                   <div class="image-slot-placeholder">載入中...</div>
                 </template>
              </el-image>
            </div>
          </div>
      </el-main>
    </el-container>
  </el-container>
  </div>
</template>


<style>
/* Add global box-sizing */
*,
*::before,
*::after {
  box-sizing: border-box;
}

/* Copied styles from HomeView.vue */
.home-view-dark {
  /* Define CSS Variables for dark theme */
  --dark-bg-color: #141414;
  --dark-bg-secondary: #1f1f1f;
  --dark-border-color: #333;
  --dark-text-primary: #e0e0e0;
  --dark-text-secondary: #a0a0a0;
  --dark-highlight-bg: #3a3a5a; /* Selection background */
}

/* Ensure body has no margin */
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  color: var(--dark-text-primary);
  background-color: var(--dark-bg-color); /* Apply base background */
  overflow: hidden; /* Prevent body scrollbar */
}

/* Base layout styles - Back to edge-to-edge */
.common-layout {
  height: 100vh;
  width: 100%; /* Explicitly set width to 100% */
  padding: 0;
}

.main-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  /* Removed max-width, border-radius, shadow, min-height */
  background-color: var(--dark-bg-secondary);
  overflow: hidden;
  /* Restored full height */
  height: 100vh;
}

/* Header Styles */
.main-header {
  padding: 1rem 1.5rem; /* Reverted top/bottom padding */
  border-bottom: 1px solid var(--dark-border-color);
  background-color: transparent;
  flex-shrink: 0;
  height: auto;
}

/* New: Container for header content (title + switch) */
.header-content {
  display: flex;
  justify-content: space-between; /* Push title left, switch right */
  align-items: center; /* Vertically align items */
  height: 75px; /* Match fixed h1 height */
}

.main-header h1 {
  margin: 0; /* Reset margin */
  font-size: 2rem;
  color: var(--dark-text-primary);
  text-align: left;
  /* Remove fixed height and line-height from h1 itself */
  /* height: 75px; */ 
  /* line-height: 75px; */ 
}

/* New: Container for the switch for potential future styling */
.show-today-switch-container {
  /* Use flex to align switch and label */
  display: flex;
  align-items: center; /* Vertically center items */
  gap: 8px; /* Add some space between switch and label */
}

/* New: Style for the switch label */
.switch-label {
  color: var(--dark-text-secondary); /* Use secondary text color */
  font-size: 0.9rem; /* Adjust font size if needed */
  cursor: pointer; /* Indicate it's clickable (acts like a label) */
}

.error-alert {
  margin-top: 1rem;
  background-color: rgba(245, 108, 108, 0.1);
  border: 1px solid rgba(245, 108, 108, 0.3);
}

/* Content container (List + Details) */
.content-container {
  flex-grow: 1; /* Take remaining vertical space */
  overflow: hidden; /* Prevent scrolling at this level */
  display: flex; /* Arrange list and details horizontally */
}

/* Movie List Aside Styles */
.movie-list-aside {
  background-color: transparent; /* Use parent bg or specific color */
  border-right: 1px solid var(--dark-border-color);
  display: flex; /* Allow scrollbar to work correctly */
  flex-direction: column;
  flex-shrink: 0; /* Prevent aside from shrinking */
}

.movie-list-aside .el-scrollbar {
  flex-grow: 1; /* Allow scrollbar to fill space */
}
.movie-list-aside .el-scrollbar__view {
  padding: 0; /* Remove default padding if needed */
}

.no-movies-placeholder {
  padding: 2rem;
  text-align: center;
  color: var(--dark-text-secondary);
}

.movie-list-items {
  /* No specific styling needed here, items handled below */
}

/* Individual Movie List Item Styles */
.movie-list-item {
  display: flex;
  align-items: center;
  padding: 12px 15px;
  cursor: pointer;
  border-bottom: 1px solid var(--dark-border-color);
  transition: background-color 0.2s;
}

.movie-list-item:hover {
  background-color: rgba(255, 255, 255, 0.05);
}

.movie-list-item.is-selected {
  background-color: var(--dark-highlight-bg);
}

.list-item-poster-image {
  width: 70px;
  height: 105px;
  margin-right: 12px;
  flex-shrink: 0;
  border-radius: 6px;
  background-color: #555; /* Placeholder BG */
}

.list-item-details {
  overflow: hidden; /* Prevent text overflow */
}

.list-item-details h4 {
  margin: 0 0 2px 0;
  font-size: 0.9rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--dark-text-primary);
}

.list-item-english-title {
  font-size: 0.75rem;
  color: var(--dark-text-secondary);
  margin: 0 0 4px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.list-item-details .rating {
  font-size: 0.8rem;
  color: var(--dark-text-secondary);
  margin: 0;
  display: flex;
  align-items: center;
}
.list-item-details .rating .el-icon {
  margin-right: 4px;
  color: #f7ba2a; /* Gold star */
}
.list-item-details .rating.imdb-rating-list {
  font-weight: bold;
}


/* Poster Placeholder/Error Styles (List Item) */
.image-slot-error.list-item-poster-error,
.image-slot-placeholder.list-item-poster-placeholder-content {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  background-color: #444;
}
.list-item-poster-error .el-icon {
  font-size: 20px;
  color: var(--dark-text-secondary);
}

/* Movie Details Main Area Styles */
.movie-details-main {
  padding: 25px 30px;
  background-color: var(--dark-bg-color);
  overflow-y: auto;
  height: 100%;
  flex-grow: 1;
  min-width: 0; /* Re-added min-width: 0 */
}

/* Placeholder when no movie is selected */
.details-placeholder {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100%;
  color: var(--dark-text-secondary);
  text-align: center;
}
.details-placeholder .el-icon {
  margin-bottom: 15px;
}
.details-placeholder p {
   font-size: 1.1rem;
}

/* Container for selected movie details (Text + Poster) */
.selected-movie-details {
  display: flex;
  gap: 30px; /* Space between text content and poster */
  height: 100%; /* Try to fill parent height */
}

/* Left part: Text Content */
.details-content {
  flex-grow: 1; /* Take available space */
  min-width: 0; /* Prevent overflow issues */
  /* This section should be scrollable if movie-details-main isn't */
  /* overflow-y: auto; */ /* Check if needed */
  padding-right: 15px; /* Add padding if needed */
}

/* Right part: Poster */
.details-poster {
  flex-shrink: 0; /* Don't shrink poster */
  width: 325px; /* Fixed width for poster */
  /* Center image if container is larger */
  display: flex;
  flex-direction: column;
  align-items: center;
  /* padding-top: 10px; */ /* Adjust alignment */
}


/* Styles for elements within details-content */
.selected-movie-details h2 {
  margin: 0 0 2px 0;
  font-size: 1.8rem;
  color: var(--dark-text-primary);
  /* word-break is handled by inline style now */
}

.detail-english-title {
  font-size: 1.1rem;
  color: var(--dark-text-secondary);
  margin: 0 0 10px 0;
}

.selected-movie-details .rating {
  font-size: 1rem;
  color: var(--dark-text-secondary);
  margin: 10px 0;
  display: flex;
  align-items: center;
}
.selected-movie-details .rating .el-icon {
  margin-right: 5px;
  color: #f7ba2a;
}

.tags {
  margin-bottom: 15px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.genre-tag-capsule {
  display: inline-block;
  border-radius: 999px; /* Fully rounded */
  padding: 4px 12px;
  font-size: 13px;
  background-color: #48484a; /* Dark grey */
  color: #ccc; /* Light grey text */
  line-height: 1.4;
  font-weight: 500;
  transition: background-color 0.2s ease;
}

.genre-tag-capsule:hover {
  background-color: #5a5a5e; /* Slightly lighter on hover */
}

.credits {
  font-size: 0.9rem;
  color: var(--dark-text-secondary);
  margin: 5px 0;
}
.credits span {
  color: var(--dark-text-primary);
}

.selected-movie-details h3 {
  font-size: 1.2rem;
  margin: 25px 0 10px 0;
  border-bottom: 1px solid var(--dark-border-color);
  padding-bottom: 5px;
  color: var(--dark-text-primary);
}

.plot {
  font-size: 0.95rem; /* Slightly larger plot text */
  line-height: 1.6; /* Better readability */
  color: var(--dark-text-primary);
}

/* Sessions Container Styles */
.sessions-container {
  margin-top: 10px;
}

.session-date-group {
  margin-bottom: 20px;
}

.session-date-title {
  font-size: 1.1rem;
  color: var(--dark-text-primary);
  margin-bottom: 12px;
  padding-bottom: 3px;
  border-bottom: 1px solid var(--dark-border-color);
}

.filmtype-columns-container {
  display: flex;
  flex-wrap: wrap;
  gap: 20px; /* Space between film type columns - Reverted back to 20px */
}

.filmtype-column {
  flex: 1; /* Distribute space */
  min-width: 120px; /* Minimum width before wrapping - Reverted back to 120px */
  display: flex;
  flex-direction: column;
  gap: 8px; /* Space between session items in a column */
}

.filmtype-column-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--dark-text-secondary);
  margin: 0 0 5px 0;
  padding-bottom: 3px;
}

.session-item-in-column {
  display: flex;
  align-items: center;
  gap: 8px;
}

.showtime-tag-apple {
  display: inline-block;
  background-color: #0a84ff; /* Apple blue */
  color: #ffffff;
  border-radius: 7px;
  padding: 5px 10px;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.2;
  text-align: center;
  width: 55px; /* Changed: Fixed width to 55px */
  transition: background-color 0.2s ease;
  box-sizing: border-box; /* Added: Ensure padding is included in width */
}

.showtime-tag-apple:hover {
  background-color: #339dff; /* Lighter blue on hover */
}

.session-screenname {
  font-size: 0.85rem;
  color: var(--dark-text-secondary);
}

.no-sessions-info {
  font-size: 0.9rem;
  color: var(--dark-text-secondary);
  margin: 5px 0;
}

/* IMDb Section Styles */
.imdb-section {
  margin-top: 25px;
  padding-top: 15px;
  border-top: 1px dashed var(--dark-border-color); /* Dashed separator */
}

.imdb-link-wrapper {
  margin: 0;
}

.imdb-link {
  display: inline-flex;
  align-items: center;
  color: #66b1ff; /* Link color */
  text-decoration: none;
  font-weight: 500;
  transition: color 0.2s;
}
.imdb-link:hover {
  color: #8ccaff;
  text-decoration: underline;
}
.imdb-link .el-icon {
  margin-left: 5px;
}

.imdb-link-unavailable {
    font-size: 0.9rem;
    color: var(--dark-text-secondary);
    margin: 0;
}

/* Detail Poster Image Styles */
.detail-poster-image {
  width: 100%; /* Fill the container width */
  /* max-height: 80vh; */ /* Limit height if needed */
  height: auto; /* Maintain aspect ratio */
  border-radius: 10px;
  background-color: #555; /* Placeholder BG */
  object-fit: contain; /* Ensure whole image is visible */
  /* Added mask image for fade effect at bottom */
  mask-image: linear-gradient(to bottom, black 80%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, black 80%, transparent 100%);
}

/* Placeholder/Error Styles (Detail Poster) */
.image-slot-error,
.image-slot-placeholder {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: 100%; /* Fill poster container width */
  /* Ensure a minimum height for the placeholder */
  min-height: 400px; /* Adjust as needed */
  height: 100%;
  background: var(--dark-bg-secondary);
  color: var(--dark-text-secondary);
  font-size: 14px;
  text-align: center;
  border-radius: 10px; /* Match image radius */
}
.image-slot-error .el-icon {
  font-size: 30px;
  margin-bottom: 10px;
}

/* Loading Overlay Styles */
.custom-loading-overlay {
  /* Restore original styles based on previous state */
  position: fixed; /* Use fixed to cover the whole viewport */
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(20, 20, 20, 0.8); /* Dark semi-transparent */
  backdrop-filter: blur(5px); /* Blur effect */
  z-index: 2000; /* Ensure it's on top */
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  /* Set color here to attempt inheritance */
  color: #FFFFFF; 
}

.custom-loading-spinner {
  /* Remove explicit color setting from spinner */
}

.custom-loading-text {
  /* Keep original styles */
  margin-top: 15px;
  color: #C0C4CC; /* Restore original text color */
  font-size: 0.9rem; /* Keep font-size if needed */
}

/* Custom Scrollbar Styles (Copied from previous App.vue) */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background-color: rgba(128, 128, 128, 0.5);
  border-radius: 10px;
  border: 2px solid transparent;
  background-clip: content-box;
}
::-webkit-scrollbar-thumb:hover {
  background-color: rgba(160, 160, 160, 0.7);
}

/* 新增: 為不可用評分添加樣式 */
.rating-unavailable {
  color: var(--dark-text-secondary); /* 使用次要文字顏色 */
  /* font-style: italic; */ /* 移除斜體 */
}

/* --- 新增: 為可點擊的場次添加一點視覺效果 (可選) --- */
.showtime-tag-apple[style*="cursor: pointer"]:hover {
  opacity: 0.85;
  /* 可以添加其他 hover 效果，例如輕微放大或陰影 */
  /* transform: scale(1.05); */ 
}

/* MODIFIED: Header title styles for icon alignment */
.header-title-wrapper {
  display: inline-flex; /* Use inline-flex for alignment */
  align-items: center; /* Vertically center text and icon */
  gap: 8px; /* Space between text and icon */
  margin: 0; /* Reset margin */
  font-size: 2rem;
  color: var(--dark-text-primary);
  text-align: left;
}

/* ADDED: Style for the header link icon */
.header-link-icon {
  color: var(--dark-text-secondary); /* Slightly muted color */
  font-size: 1.5rem; /* Adjust icon size */
  line-height: 1; /* Prevent extra vertical space */
  text-decoration: none;
  transition: color 0.2s;
  /* ADDED: Relative positioning to move icon down */
  position: relative;
  top: 3px; 
}

.header-link-icon:hover {
  color: var(--el-color-primary); /* Use Element Plus primary color on hover */
}

</style>
