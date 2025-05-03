<script setup lang="ts">
import type { PropType } from 'vue';
import { ElMain, ElIcon, ElImage, ElButton } from 'element-plus'
import { Star, Picture as IconPicture, Film, Link } from '@element-plus/icons-vue'
import type { CombinedMovieData, SKCSession } from '../../../shared/ipc-interfaces';
// Import necessary formatters (ensure path is correct relative to this file)
import { formatRuntime, formatGroupDateTitle } from '../utils/formatters'

// --- Define Props ---
const props = defineProps({
  selectedMovie: { type: Object as PropType<CombinedMovieData | null>, default: null },
  // Define the expected structure for grouped sessions directly here
  groupedAndSortedSessions: {
    type: Object as PropType<{ [dateKey: string]: { weekday: string; sortedFilmTypes: { filmType: string; sessions: (SKCSession & { sessionModifier?: string | null })[] }[] } }>,
    default: () => ({})
  }
});

// --- Methods for handling clicks (copied from App.vue) ---
async function openLink(url: string | null | undefined) {
  if (!url) {
    console.warn('[MovieDetailsPanel] Attempted to open invalid URL:', url);
    return;
  }
  console.log(`[MovieDetailsPanel] Requesting to open external URL: ${url}`);
  try {
    if (window.ipc?.openExternalUrl) {
      await window.ipc.openExternalUrl(url);
    } else {
      throw new Error('Electron IPC API (window.ipc.openExternalUrl) is not available.');
    }
  } catch (error: any) {
    console.error(`[MovieDetailsPanel] Error opening external URL ${url}:`, error);
    // Handle error display within the panel if needed
  }
}

function handleSessionClick(session: SKCSession) {
  if (!session?.sessionId) {
    console.warn('[MovieDetailsPanel] Session ID is missing, cannot build booking link.', session);
    return;
  }
  const targetUrl = `https://www.skcinemas.com/booking/seats?c=1004&s=${session.sessionId}`;
  openLink(targetUrl);
}

</script>

<template>
  <el-main class="movie-details-main">
    <!-- Placeholder if no movie selected (copied from App.vue) -->
    <div v-if="!selectedMovie" class="details-placeholder" key="placeholder">
      <el-icon size="50"><Film /></el-icon>
      <p>請從左側列表選擇一部電影以查看詳情。</p>
    </div>
    <!-- Selected Movie Details View (copied from App.vue) -->
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
                      <span
                        v-if="session.sessionModifier"
                        class="session-modifier"
                      >
                        {{ session.sessionModifier }}
                      </span>
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
             <a :href="selectedMovie.imdbUrl" target="_blank" rel="noopener noreferrer" class="imdb-link" @click.prevent="openLink(selectedMovie.imdbUrl)">
               在 IMDb 上查看
               <el-icon><Link /></el-icon>
             </a>
           </p>
           <p v-else class="imdb-link-unavailable">
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
          lazy
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
</template>

<style scoped>
/* Styles for Details Panel (copied from App.vue) */
.movie-details-main {
  padding: 25px 30px;
  background-color: var(--dark-bg-color);
  overflow-y: auto;
  height: 100%;
  flex-grow: 1;
  min-width: 0;
}

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

.selected-movie-details {
  display: flex;
  gap: 30px;
  height: 100%;
}

.details-content {
  flex-grow: 1;
  min-width: 0;
  padding-right: 15px;
}

.details-poster {
  flex-shrink: 0;
  width: 325px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.selected-movie-details h2 {
  margin: 0 0 2px 0;
  font-size: 1.8rem;
  color: var(--dark-text-primary);
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
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 13px;
  background-color: #48484a;
  color: #ccc;
  line-height: 1.4;
  font-weight: 500;
  transition: background-color 0.2s ease;
}
.genre-tag-capsule:hover {
  background-color: #5a5a5e;
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
  font-size: 0.95rem;
  line-height: 1.6;
  color: var(--dark-text-primary);
}

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
  gap: 20px;
}

.filmtype-column {
  flex: 1;
  min-width: 120px;
  display: flex;
  flex-direction: column;
  gap: 8px;
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
  background-color: #0a84ff;
  color: #ffffff;
  border-radius: 7px;
  padding: 5px 10px;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.2;
  text-align: center;
  width: 55px;
  transition: background-color 0.2s ease;
  box-sizing: border-box;
}
.showtime-tag-apple[style*="cursor: pointer"]:hover {
  background-color: #339dff;
  opacity: 0.85;
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

.imdb-section {
  margin-top: 25px;
  padding-top: 15px;
  border-top: 1px dashed var(--dark-border-color);
}

.imdb-link-wrapper {
  margin: 0;
}

.imdb-link {
  display: inline-flex;
  align-items: center;
  color: #66b1ff;
  text-decoration: none;
  font-weight: 500;
  transition: color 0.2s;
  cursor: pointer;
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

.detail-poster-image {
  width: 100%;
  height: auto;
  border-radius: 10px;
  background-color: #555;
  object-fit: contain;
  mask-image: linear-gradient(to bottom, black 80%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, black 80%, transparent 100%);
}

.image-slot-error,
.image-slot-placeholder {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: 100%;
  min-height: 400px;
  height: 100%;
  background: var(--dark-bg-secondary);
  color: var(--dark-text-secondary);
  font-size: 14px;
  text-align: center;
  border-radius: 10px;
}
.image-slot-error .el-icon {
  font-size: 30px;
  margin-bottom: 10px;
}

.rating-unavailable {
  color: var(--dark-text-secondary);
}

.session-modifier {
  font-size: 0.8rem;
  color: var(--dark-text-secondary);
}

/* Variables assumed to be inherited */
</style>