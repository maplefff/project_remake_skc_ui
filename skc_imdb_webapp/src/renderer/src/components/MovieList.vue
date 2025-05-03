<template>
  <div class="movie-list-container">
    <!-- 移除 Scrollbar 外部的標題 -->
    <el-scrollbar height="100vh" class="movie-list-scrollbar">
      <!-- 移除列表標題 -->
      <!-- <h2 class="list-header-title">新光影城電影列表－青埔影院</h2> -->
      
      <!-- Loading State -->
      <div v-if="isLoading" class="loading-state">
        <el-skeleton :rows="8" animated />
      </div>
      
      <!-- Error State -->
      <div v-else-if="error" class="error-state">
        <el-alert title="載入電影資料失敗" type="error" :closable="false" show-icon>
          {{ error }}
        </el-alert>
      </div>

      <!-- Data Loaded State -->
      <div v-else class="movie-list">
        <el-empty v-if="sortedMovies.length === 0" description="沒有找到電影資料" />
        <!-- List items... -->
        <div
          v-else
          v-for="movie in sortedMovies"
          :key="movie.filmNameID"
          class="list-item"
          :class="{ 'is-active': selectedMovieId === movie.filmNameID }"
          @click="selectMovie(movie.filmNameID, movie)"
        >
          <!-- ... item content ... -->
          <img :src="movie.posterPath || '/placeholder.png'" alt="Poster" class="list-poster-placeholder" loading="lazy" @error="onImageError" />
          <div class="list-info">
              <div class="list-title" :title="movie.movieName">{{ movie.movieName }}</div>
              <div class="list-rating">
                  <el-icon :size="14" color="#E5C51A"><StarFilled /></el-icon>
                  <span>{{ movie.imdbRating || 'N/A' }}</span>
              </div>
          </div>
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
// Import necessary components, ensuring ElEmpty is included
import { ElScrollbar, ElSkeleton, ElAlert, ElIcon, ElEmpty } from 'element-plus' 
import { StarFilled } from '@element-plus/icons-vue'
import type { CombinedMovieData } from 'src/shared/ipc-interfaces'

// --- State, Emits, Fetch Data, selectMovie, sortedMovies --- 
// (Keep existing logic as it's about data handling, not UI structure)
const movies = ref<CombinedMovieData[]>([])
const isLoading = ref(true) 
const error = ref<string | null>(null)
const selectedMovieId = ref<string | number | null>(null)
const emit = defineEmits(['movie-selected'])

onMounted(async () => {
  try {
    isLoading.value = true
    error.value = null
    console.log('[MovieList] Fetching combined movie data...')
    const result = await window.ipc.getCombinedMovieData()
    console.log('[MovieList] Received data:', result)
    if (result && result.length > 0) {
      movies.value = result
      if (sortedMovies.value.length > 0) {
        selectMovie(sortedMovies.value[0].filmNameID, sortedMovies.value[0])
      }
    } else {
      movies.value = []
      console.warn('[MovieList] Received empty or invalid data from main process.')
    }
  } catch (err) {
    console.error('[MovieList] Error fetching movie data:', err)
    error.value = err instanceof Error ? err.message : String(err)
    movies.value = []
  } finally {
    isLoading.value = false
  }
})

const selectMovie = (movieId: string | number, movieObject?: CombinedMovieData) => {
  console.log(`[MovieList] Selecting movie ID: ${movieId}`)
  selectedMovieId.value = movieId
  const movieToSend = movieObject || movies.value.find(m => m.filmNameID === movieId)
  if (movieToSend) {
    emit('movie-selected', movieToSend)
  } else {
    console.warn(`[MovieList] Could not find movie with ID ${movieId} to emit.`)
  }
}

const sortedMovies = computed(() => {
  return [...movies.value].sort((a, b) => {
    const ratingA = Number(a.imdbRating) || 0
    const ratingB = Number(b.imdbRating) || 0
    return ratingB - ratingA
  })
})

// Handle image loading errors
const onImageError = (event: Event) => {
  const imgElement = event.target as HTMLImageElement;
  // Optionally set a placeholder or hide the image
  imgElement.src = '/placeholder.png'; // Fallback to a known placeholder
};

</script>

<style scoped>
/* Styles based on example_interfaces_v2.html and macOS dark theme */
.movie-list-container {
  height: 100%;
  background-color: #2a2a2a; /* Sidebar background */
  /* 移除 flex 佈局 */
  /* display: flex; */
  /* flex-direction: column; */
}

/* 移除列表標題樣式 */
/* .list-header-title { ... } */

.movie-list-scrollbar {
  /* flex-grow: 1; */ /* 移除 flex-grow */
}

.loading-state {
  padding: 20px;
}

.error-state .el-alert {
  margin: 20px;
}

.movie-list {
  padding: 5px 0; /* Reduced vertical padding */
}

.list-item {
  padding: 8px 15px; /* Adjusted padding */
  border-bottom: 1px solid rgba(90, 90, 90, 0.4); /* Subtle divider */
  cursor: pointer;
  transition: background-color 0.15s ease;
  display: flex;
  align-items: center;
  gap: 12px;
}

.list-item:last-child {
  border-bottom: none;
}

.list-item:hover {
  background-color: rgba(255, 255, 255, 0.08); /* Subtle hover effect */
}

/* Active state using macOS accent blue */
.list-item.is-active {
  /* 根據截圖調整為較柔和的藍色 */
  background-color: #364e6f; /* 示例：較柔和的藍灰色 */ 
}

.list-item.is-active .list-title,
.list-item.is-active .list-rating,
.list-item.is-active .list-rating span {
  color: #ffffff; /* White text on active */
}
.list-item.is-active .list-rating .el-icon {
  color: #ffffff; /* White icon on active */
}


.list-poster-placeholder {
  width: 75px; /* 原為 50px */
  height: 113px; /* 原為 75px */
  background-color: #444; /* Dark placeholder background */
  flex-shrink: 0;
  border-radius: 4px;
  object-fit: cover;
  display: block;
}

.list-info {
  flex-grow: 1;
  overflow: hidden;
}

.list-title {
  font-weight: 500; /* Slightly bolder */
  font-size: 14px;
  margin: 0 0 4px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: rgba(255, 255, 255, 0.9); /* Brighter text */
}

.list-rating {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6); /* Lighter secondary text */
  display: flex;
  align-items: center;
}

.list-rating .el-icon {
  margin-right: 4px;
  /* Color set via attribute */
}

.list-rating span {
    /* Rating number color */
    color: rgba(255, 255, 255, 0.7);
}

.movie-list > .el-empty {
    margin-top: 50px;
}
</style> 