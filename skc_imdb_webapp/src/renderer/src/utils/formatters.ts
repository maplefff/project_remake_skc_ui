import type { CombinedMovieData, SKCSession } from '../../../shared/ipc-interfaces';

// --- 解析 FilmType 以獲取分組名和附加描述 ---
export interface ProcessedFilmType {
  groupName: string;
  modifier: string | null;
}

export function processFilmTypeAndModifier(rawFilmType: string | undefined | null): ProcessedFilmType {
  if (!rawFilmType) {
    return { groupName: '未知類型', modifier: null };
  }

  const lowerCaseType = rawFilmType.toLowerCase();
  let groupName = rawFilmType; // Default to original
  let modifier: string | null = null;
  let keywordFound = false;

  // Check for Dolby
  if (lowerCaseType.includes('dolby')) {
    groupName = 'Dolby Cinema';
    // Extract modifier by removing base name and separators
    modifier = rawFilmType.replace(/dolby cinema/i, '').replace(/[-:()]/g, '').trim();
    keywordFound = true;
  }
  // Check for LUXE (if not already Dolby)
  else if (lowerCaseType.includes('luxe')) {
    groupName = 'LUXE';
    modifier = rawFilmType.replace(/luxe/i, '').replace(/[-:()]/g, '').trim();
    keywordFound = true;
  }
  // Check for B.O.X./Sealy/OSIM (if not Dolby or LUXE)
  else if (lowerCaseType.includes('b.o.x') || lowerCaseType.includes('box') || lowerCaseType.includes('sealy') || lowerCaseType.includes('osim')) {
    groupName = 'B.O.X.';
    modifier = null; 
    keywordFound = true;
  }

  // If a keyword was found but modifier is empty string, set to null
  if (keywordFound && modifier === '') {
      modifier = null;
  }

  return { groupName, modifier };
}
// --- END: processFilmTypeAndModifier ---

// --- 排序輔助函數，基於 groupName ---
export function getFilmTypePriority(groupName: string): number { 
    const lowerCaseType = groupName.toLowerCase(); 
    if (lowerCaseType.includes('dolby')) return 0;
    if (lowerCaseType.includes('luxe')) return 1;
    // Treat '普通' or unknown as priority 2
    if (lowerCaseType.includes('b.o.x')) return 3; // B.O.X. has lowest priority
    return 2; // Default priority for '普通' etc.
}
// --- END: getFilmTypePriority ---

// --- 格式化日期標題 ---
export function formatGroupDateTitle(dateKey: string, weekday: string): string {
  if (!dateKey || !weekday) return '日期未知';
  // Simple MM-DD to MM/DD format
  const dateParts = dateKey.split('-');
  if (dateParts.length === 2) {
    return `${weekday} (${dateParts[0]}/${dateParts[1]})`;
  } else {
    return `${weekday} (${dateKey})`; // Fallback
  }
}
// --- END: formatGroupDateTitle ---

// --- 格式化運行時間 ---
export function formatRuntime(totalMinutes: number | undefined | null): string {
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
// --- END: formatRuntime ---

export function groupMoviesByDate(movies: CombinedMovieData[]): Record<string, CombinedMovieData[]> {
  return movies.reduce(
    (acc, movie) => {
      const date = movie.sessions && movie.sessions.length > 0 ? movie.sessions[0].showtime.split(' ')[0] : 'Unknown Date'
      if (!acc[date]) {
        acc[date] = []
      }
      acc[date].push(movie)
      return acc
    },
    {} as Record<string, CombinedMovieData[]>
  )
}

export function formatShowtime(showtime: string): string {
  const parts = showtime.split(' ')
  if (parts.length >= 2) {
    return parts[1] // Return only the time part HH:mm
  }
  return showtime // Fallback
}

export function sortMovies(movies: CombinedMovieData[]): CombinedMovieData[] {
  return [...movies].sort((a, b) => {
    // Prioritize movies with sessions
    const aHasSessions = a.sessions && a.sessions.length > 0
    const bHasSessions = b.sessions && b.sessions.length > 0

    if (aHasSessions && !bHasSessions) return -1
    if (!aHasSessions && bHasSessions) return 1
    if (!aHasSessions && !bHasSessions) {
      // If neither has sessions, sort by movieName
      return a.movieName.localeCompare(b.movieName)
    }

    // If both have sessions, sort by the earliest showtime in sessions
    const earliestAShowtime = a.sessions[0]?.showtime
    const earliestBShowtime = b.sessions[0]?.showtime

    if (earliestAShowtime && earliestBShowtime) {
      return earliestAShowtime.localeCompare(earliestBShowtime)
    } else if (earliestAShowtime) {
      return -1 // a comes first if b has no showtime somehow
    } else if (earliestBShowtime) {
      return 1 // b comes first if a has no showtime somehow
    }

    // Fallback to movieName sort if sessions are missing
    return a.movieName.localeCompare(b.movieName)
  })
}

const filmTypeOrder: Record<string, number> = {
  Dolby: 1,
  LUXE: 2,
  'B.O.X.': 4 // Assign B.O.X. the highest order number
}

// Unified B.O.X. types
const boxTypes = ['BOX', 'Sealy', 'OSIM']

export function sortShowtimes(showtimes: SKCSession[]): SKCSession[] {
  return [...showtimes].sort((a, b) => {
    // Group B.O.X. types
    const aFilmTypeDisplay = boxTypes.includes(a.filmType) ? 'B.O.X.' : a.filmType
    const bFilmTypeDisplay = boxTypes.includes(b.filmType) ? 'B.O.X.' : b.filmType

    // Get order, default to a large number for unspecified types
    const orderA = filmTypeOrder[aFilmTypeDisplay] ?? 3
    const orderB = filmTypeOrder[bFilmTypeDisplay] ?? 3

    if (orderA !== orderB) {
      return orderA - orderB
    }

    // If film types are the same (or same order), sort by showtime (HH:mm)
    return a.showtime.localeCompare(b.showtime)
  })
}

export function getImdbStatusClass(status?: string): string {
  switch (status) {
    case 'loading':
      return 'text-yellow-500'
    case 'live':
    case 'cache':
      return 'text-green-500'
    case 'live-no-rating':
    case 'cache-no-rating':
      return 'text-gray-500'
    case 'failed':
    case 'live-failed':
    case 'cache-failed':
      return 'text-red-500'
    default:
      return 'text-gray-400'
  }
}

// Helper to determine if screen name should be shown for B.O.X. types
export function shouldShowScreenName(filmType: string): boolean {
  return boxTypes.includes(filmType);
} 