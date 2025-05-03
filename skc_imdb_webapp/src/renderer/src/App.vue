<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted } from 'vue'
// Import necessary components and icons from Element Plus
import { ElContainer, ElButton } from 'element-plus'
import type { CombinedMovieData, SKCSession, LoadingProgressPayload } from '../../shared/ipc-interfaces' // Corrected path in previous step

// Import child components
import AppHeader from './components/AppHeader.vue'
import LoadingOverlay from './components/LoadingOverlay.vue' // Added
import MovieListSidebar from './components/MovieListSidebar.vue' // Added
import MovieDetailsPanel from './components/MovieDetailsPanel.vue' // Added

// Import utility functions
import { processFilmTypeAndModifier, getFilmTypePriority } from './utils/formatters'

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

// --- 新增: 解析 FilmType 以獲取分組名和附加描述 ---

// 修改: 排序輔助函數，基於 groupName

// 修改: groupedAndSortedSessions 使用新函數並附加 modifier
const groupedAndSortedSessions = computed(() => {
  if (!selectedMovie.value?.sessions) {
    return {};
  }

  let sessionsToProcess: SKCSession[];

  if (showTodayOnly.value) {
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, '0'); 
    const day = String(today.getDate()).padStart(2, '0');
    const todayDateStr = `${month}-${day}`;
    sessionsToProcess = selectedMovie.value.sessions.filter(session => session.date === todayDateStr);
  } else {
    sessionsToProcess = selectedMovie.value.sessions;
  }
  
  // 臨時分組結構 (擴展 SKCSession 以包含 modifier)
  type SessionWithModifier = SKCSession & { sessionModifier?: string | null };
  const tempGroupedData: { 
      [dateKey: string]: { 
          weekday: string; 
          filmTypes: { [groupName: string]: SessionWithModifier[] } // Key is groupName
      } 
  } = {};

  // 遍歷並處理 filmType，附加 modifier
  for (const session of sessionsToProcess) { 
    const dateKey = session.date; 
    if (!dateKey || !session.weekday) continue;
    
    // --- 使用新函數處理 --- 
    const { groupName, modifier } = processFilmTypeAndModifier(session.filmType);
    // --- 修改結束 ---
    
    if (!tempGroupedData[dateKey]) {
      tempGroupedData[dateKey] = { weekday: session.weekday, filmTypes: {} };
    }
    if (!tempGroupedData[dateKey].filmTypes[groupName]) { // Use groupName as key
      tempGroupedData[dateKey].filmTypes[groupName] = [];
    }
    // --- 將 modifier 附加到 session 物件 --- 
    tempGroupedData[dateKey].filmTypes[groupName].push({ ...session, sessionModifier: modifier });
    // --- 修改結束 ---
  }

  // 最終的、排序後的結構 (類型也需更新)
  const finalSortedData: { 
      [dateKey: string]: { 
          weekday: string; 
          sortedFilmTypes: { filmType: string; sessions: SessionWithModifier[] }[] // Use SessionWithModifier
      } 
  } = {};

  // 遍歷日期進行排序
  for (const dateKey in tempGroupedData) {
    const dateGroup = tempGroupedData[dateKey];
    const filmTypeKeys = Object.keys(dateGroup.filmTypes);

    // 根據自訂邏輯排序 filmTypeKeys (groupName)
    filmTypeKeys.sort((a, b) => getFilmTypePriority(a) - getFilmTypePriority(b));

    // 創建排序後的 filmTypes 陣列
    const sortedTypesArray = filmTypeKeys.map(groupNameKey => ({
      filmType: groupNameKey, // Display groupName as the title
      sessions: dateGroup.filmTypes[groupNameKey].sort((sA, sB) => sA.showtime.localeCompare(sB.showtime)) 
    }));

    finalSortedData[dateKey] = {
      weekday: dateGroup.weekday,
      sortedFilmTypes: sortedTypesArray
    };
  }

  console.log("Final Sorted Sessions Structure with Modifiers:", finalSortedData);
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
    <!-- Use LoadingOverlay component -->
    <LoadingOverlay 
      :loading="loading" 
      :loading-message="loadingMessage" 
      :progress-x="loadingProgressX" 
      :progress-n="loadingProgressN" 
      :movie-name="loadingMovieName"
    />

    <!-- Main Application Container -->
    <el-container class="main-container">
      <!-- Use AppHeader component -->
      <AppHeader :error="error" v-model:showTodayOnly="showTodayOnly" @retry="fetchMovies" />
      
      <!-- Content Area (only shown when not loading and no error) -->
      <el-container v-if="!loading && !error" class="content-container">
        <!-- Use MovieListSidebar component -->
        <MovieListSidebar
          :filtered-movies="filteredMovies" 
          :selected-movie="selectedMovie"
          :loading="loading" 
          :error="error"
          @select-movie="selectMovie" 
        />

        <!-- Right Main Area: Movie Details -->
        <MovieDetailsPanel 
          :selected-movie="selectedMovie" 
          :grouped-and-sorted-sessions="groupedAndSortedSessions"
        />
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
  flex-direction: column !important;
  width: 100%;
  background-color: var(--dark-bg-secondary);
  overflow: hidden;
  height: 100vh;
}

/* Content container (List + Details) */
.content-container {
  flex-grow: 1; /* Take remaining vertical space */
  overflow: hidden; /* Prevent scrolling at this level */
  display: flex; /* Arrange list and details horizontally */
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

/* ADDED: Style for the session modifier text */
.session-modifier {
  font-size: 0.8rem; /* Smaller font size */
  color: var(--dark-text-secondary); /* Muted color */
  /* font-style: italic; */ /* Removed italic style */
  /* margin-left: 4px; */ /* Optional space */
}

</style>
