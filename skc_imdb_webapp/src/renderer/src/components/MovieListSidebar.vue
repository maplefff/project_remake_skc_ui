<script setup lang="ts">
import { PropType } from 'vue';
import { ElAside, ElScrollbar, ElIcon, ElImage } from 'element-plus'
import { Star, Picture as IconPicture } from '@element-plus/icons-vue'
import type { CombinedMovieData } from '../../../shared/ipc-interfaces';

defineProps({
  filteredMovies: { type: Array as PropType<CombinedMovieData[]>, required: true },
  selectedMovie: { type: Object as PropType<CombinedMovieData | null>, default: null },
  loading: { type: Boolean, default: false }, // Keep loading prop
  error: { type: String as PropType<string | null>, default: null }, // Keep error prop
});

const emit = defineEmits<{ 
  (e: 'select-movie', movie: CombinedMovieData): void 
}>();

function handleSelectMovie(movie: CombinedMovieData) {
  emit('select-movie', movie);
}

</script>

<template>
  <el-aside width="260px" class="movie-list-aside">
    <el-scrollbar>
      <!-- Placeholder if no movies or error -->
      <div v-if="loading" class="no-movies-placeholder"> 
         <span>列表載入中...</span>
      </div>
       <div v-else-if="error" class="no-movies-placeholder error-text">
         載入電影列表失敗。
       </div>
      <div v-else-if="filteredMovies.length === 0" class="no-movies-placeholder">
        目前沒有可顯示的電影。
      </div>
      <!-- Movie List Items (copied from App.vue) -->
      <div v-else class="movie-list-items">
         <div
           v-for="movie in filteredMovies" 
           :key="String(movie.filmNameID)"
           class="movie-list-item"
           :class="{ 'is-selected': selectedMovie && String(selectedMovie.filmNameID) === String(movie.filmNameID) }"
           @click="handleSelectMovie(movie)" 
          >
             <!-- List Item Poster -->
             <el-image
               :src="movie.posterPath || ''"  
               :alt="`${movie.movieName} Poster`"
               fit="cover"
               lazy
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
</template>

<style scoped>
/* Styles for Sidebar (copied from App.vue) */
.movie-list-aside {
  background-color: transparent;
  border-right: 1px solid var(--dark-border-color);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.movie-list-aside .el-scrollbar {
  flex-grow: 1;
}
.movie-list-aside .el-scrollbar__view {
  padding: 0;
}

.no-movies-placeholder {
  padding: 2rem;
  text-align: center;
  color: var(--dark-text-secondary);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  min-height: 150px;
}
.no-movies-placeholder.error-text {
  color: var(--el-color-error);
}

.movie-list-items {
  /* No specific styling needed */
}

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
  background-color: #555;
}

.list-item-details {
  overflow: hidden;
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
  color: #f7ba2a;
}
.list-item-details .rating.imdb-rating-list {
  font-weight: bold;
}

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

.rating-unavailable {
  color: var(--dark-text-secondary);
}

/* Variables assumed to be inherited */
</style> 