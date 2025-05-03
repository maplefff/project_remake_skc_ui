<template>
  <div class="movie-detail-container">
    <!-- Empty State -->
    <div v-if="!movie" class="no-movie-selected">
      <el-empty description="請從左側列表選擇一部電影" />
    </div>
    
    <!-- Content State -->
    <div v-else class="detail-content">
      <!-- Header Section -->
      <div class="detail-header">
        <!-- Meta Details FIRST (Left) -->
        <div class="detail-meta">
          <h2 class="detail-title">{{ movie.movieName }}</h2>
          <h3 class="detail-subtitle">{{ movie.englishTitle }}</h3>
          <div class="detail-rating">
            <el-icon :size="20" color="#E5C51A"><StarFilled /></el-icon>
            <span>{{ movie.imdbRating || 'N/A' }} / 10 (IMDb)</span>
          </div>
          <div class="detail-genres">
            <el-tag 
              v-for="genre in movie.genres || []"
              :key="genre"
              size="small"
              round
              class="genre-tag"
            >
              {{ genre }}
            </el-tag>
          </div>
          <div class="detail-people">
            <p><strong>導演:</strong> {{ movie.directors?.join(', ') || 'N/A' }}</p>
            <p><strong>主演:</strong> {{ movie.cast?.join(', ') || 'N/A' }}</p>
            <p><strong>片長:</strong> {{ formatRuntime(movie.runtimeMinutes) }}</p>
          </div>
        </div>
        <!-- Poster SECOND (Right) -->
        <img 
          :src="movie.posterUrl || '/placeholder.png'" 
          alt="Movie Poster" 
          class="detail-poster" 
          loading="lazy"
          @error="onImageError"
        />
      </div>

      <!-- Plot Section -->
      <div class="detail-section detail-plot">
        <h3>劇情簡介</h3>
        <p>{{ movie.ratingDescription || '暫無分級資訊' }}</p>
      </div>

      <!-- Sessions Section -->
      <div class="detail-section detail-sessions">
        <h3>時刻表</h3>
        <div v-if="groupedSessions && Object.keys(groupedSessions).length > 0">
          <div v-for="(sessionsOnDate, date) in groupedSessions" :key="date" class="session-date-group">
            <h5>{{ date }}</h5>
            <div v-for="(sessionsInScreen, screenName) in groupSessionsByScreenName(sessionsOnDate)" :key="screenName" class="session-theater-group">
              <p class="theater-name">{{ screenName }}</p>
              <el-button
                v-for="session in sessionsInScreen"
                :key="session.showtime + session.screenName" 
                round
                class="session-button"
              >
                {{ session.showtime }}
              </el-button>
            </div>
          </div>
        </div>
        <el-empty v-else description="暫無放映場次" />
      </div>

       <!-- IMDb Link Section (Optional) -->
      <div v-if="movie.imdbUrl" class="detail-section detail-link">
         <a :href="movie.imdbUrl" target="_blank" rel="noopener noreferrer">在 IMDb 上查看完整資訊 →</a>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineProps } from 'vue'
// 修改: 移除未使用的 ElImage
import { ElIcon, ElTag, ElButton, ElEmpty } from 'element-plus'
import { StarFilled } from '@element-plus/icons-vue'
import type { CombinedMovieData, SKCSession } from 'src/shared/ipc-interfaces'

interface Props {
  movie: CombinedMovieData | null
}

const props = defineProps<Props>()

// Helper function to format runtime
const formatRuntime = (minutes: number | null | undefined): string => {
  if (!minutes) return 'N/A'
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  let result = ''
  if (hours > 0) {
    result += `${hours} 小時 `
  }
  if (mins > 0) {
    result += `${mins} 分鐘`
  }
  return result.trim() || 'N/A'
}

// Computed property to group sessions by date
const groupedSessions = computed(() => {
  if (!props.movie?.sessions) return null
  return props.movie.sessions.reduce((acc, session) => {
    const dateKey = session.date // Assuming date is already formatted as needed
    if (!acc[dateKey]) {
      acc[dateKey] = []
    }
    acc[dateKey].push(session)
    // Sort sessions within the date by showtime
    acc[dateKey].sort((a, b) => a.showtime.localeCompare(b.showtime));
    return acc
  }, {} as Record<string, SKCSession[]>)
})

// Helper function to further group sessions by screen within a date
const groupSessionsByScreenName = (sessions: SKCSession[]) => {
  return sessions.reduce((acc, session) => {
    const screenKey = session.screenName || '未知影廳' // Handle cases where screenName might be empty
    if (!acc[screenKey]) {
      acc[screenKey] = []
    }
    acc[screenKey].push(session)
    return acc
  }, {} as Record<string, SKCSession[]>)
}

// Handle image loading errors
const onImageError = (event: Event) => {
  const imgElement = event.target as HTMLImageElement;
  imgElement.style.display = 'none'; // Hide broken image
  // Optionally show a placeholder div
};

</script>

<style scoped>
/* Styles based on example_interfaces_v2.html and macOS dark theme */
.movie-detail-container {
  padding: 25px 30px; /* More padding */
  height: 100vh; 
  box-sizing: border-box; /* Include padding in height */
  overflow-y: auto; /* Allow scrolling for content */
  background-color: #1e1e1e; /* Main area background */
}

.no-movie-selected {
  display: flex;
  justify-content: center;
  align-items: center;
  height: calc(100vh - 100px);
  color: rgba(255, 255, 255, 0.6);
}

.detail-content {
  /* No specific styles needed for the wrapper now */
}

/* Header Section */
.detail-header {
  display: flex;
  gap: 25px; /* Increased gap */
  margin-bottom: 25px;
  padding-bottom: 25px;
  border-bottom: 1px solid rgba(90, 90, 90, 0.5); /* Subtle divider */
}

.detail-poster {
  width: 300px; /* 原為 200px */
  height: 450px; /* 原為 300px */
  background-color: #333; /* Darker placeholder */
  border-radius: 6px;
  flex-shrink: 0;
  object-fit: cover;
  display: block;
}

.detail-meta {
  flex-grow: 1;
}

.detail-title {
  font-size: 26px; /* Larger title */
  font-weight: 600;
  margin: 0 0 10px 0;
  line-height: 1.3;
  color: rgba(255, 255, 255, 0.95); /* Bright white */
}

.detail-subtitle {
  font-size: 16px;
  font-weight: normal;
  color: rgba(255, 255, 255, 0.65); /* Lighter secondary text */
  margin: 0 0 18px 0;
}

.detail-rating {
  font-size: 15px; /* Adjusted size */
  margin-bottom: 18px;
  display: flex;
  align-items: center;
  color: rgba(255, 255, 255, 0.7);
}

.detail-rating .el-icon {
  /* Color set via attribute */
  margin-right: 6px;
}

.detail-rating span {
    font-weight: 500;
}

.detail-genres {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 18px;
}

.genre-tag {
  /* macOS style tag */
  background-color: rgba(128, 128, 128, 0.25); /* Semi-transparent gray */
  border: none; /* No border */
  color: rgba(255, 255, 255, 0.8); /* Light text */
  padding: 3px 10px;
  border-radius: 12px; /* More rounded */
  font-size: 12px;
  line-height: 1.5;
  height: auto;
}

.detail-people p {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.6;
  margin: 4px 0;
}

.detail-people strong {
  color: rgba(255, 255, 255, 0.85);
  margin-right: 5px;
  font-weight: 500;
}

/* Content Sections */
.detail-section {
  margin-bottom: 30px;
}

.detail-section h3 {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 15px;
  color: rgba(255, 255, 255, 0.9); /* Brighter headings */
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(90, 90, 90, 0.5);
}

.detail-plot p {
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
  line-height: 1.7;
}

/* Sessions Section */
.session-date-group {
  margin-bottom: 20px;
}

.session-date-group h5 {
  font-size: 15px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  margin-bottom: 12px;
  /* No border needed */
}

.session-theater-group {
  margin-bottom: 15px;
  padding-left: 5px; /* Optional indent */
}

.theater-name {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 10px;
}

.session-button.el-button {
  /* macOS style button */
  background-color: #0a84ff; /* macOS Blue */
  border-color: #0a84ff;
  color: #ffffff;
  min-width: 65px;
  padding: 4px 14px; /* Adjusted padding */
  font-size: 13px;
  height: 28px; /* Fixed height */
  line-height: 1; /* Adjust line height */
  font-weight: 500;
  margin-right: 8px;
  margin-bottom: 8px;
  border-radius: 6px; /* Standard macOS button radius */
  transition: background-color 0.15s ease;
}

.session-button.el-button:hover {
  background-color: #369aff; /* Lighter blue on hover */
  border-color: #369aff;
}

/* IMDb Link */
.detail-link a {
  color: #0a84ff; /* macOS Blue */
  text-decoration: none;
  font-size: 14px;
}

.detail-link a:hover {
  text-decoration: underline;
}

/* Override ElEmpty style if needed */
.el-empty {
    /* Adjust styles for dark mode if default is not good */
    --el-empty-fill-color-0: #1e1e1e;
    --el-empty-fill-color-1: #2a2a2a;
    --el-empty-fill-color-2: #333333;
    --el-empty-fill-color-3: #3a3a3a;
    --el-empty-fill-color-4: #444444;
    --el-empty-fill-color-5: #4f4f4f;
    --el-empty-fill-color-6: #5a5a5a;
    --el-empty-fill-color-7: #666666;
    --el-empty-fill-color-8: #737373;
    --el-empty-fill-color-9: #808080;
}
.el-empty .el-empty__description p {
    color: rgba(255, 255, 255, 0.6);
}

</style>