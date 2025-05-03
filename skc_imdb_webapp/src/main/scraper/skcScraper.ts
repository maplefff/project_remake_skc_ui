import { chromium, type Browser, type Page, type Response } from 'playwright';
// 導入需要的介面
import type { SKCSession, CombinedMovieData, SkcRawDataPayload } from '../../shared/ipc-interfaces';

// --- 輔助函數 --- 

/**
 * 格式化日期為 MM-DD
 * @param rawDate - 原始日期字串 (假設格式為 YYYY-MM-DD or YYYY/MM/DD)
 */
function formatSessionDate(rawDate: string): string {
  try {
    const date = new Date(rawDate.replace(/-/g, '/')); // 嘗試兼容兩種分隔符
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    // Removed weekday formatting here
    return `${month}-${day}`;
  } catch (error) {
    console.warn(`[formatSessionDate] Error formatting date '${rawDate}':`, error);
    return 'Invalid Date';
  }
}

/**
 * Get weekday string "週N"
 * @param dateObject - JavaScript Date object
 */
function getWeekdayString(dateObject: Date): string {
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const weekday = weekdays[dateObject.getDay()];
    return `週${weekday}`;
}

/**
 * 格式化時間為 HH:mm
 * @param rawTime - 原始時間字串 (假設格式為 HH:mm:ss 或 HHmm)
 */
function formatSessionTime(rawTime: string): string {
  try {
    if (rawTime.includes(':')) {
      // 假設是 HH:mm:ss
      const [hour, minute] = rawTime.split(':');
      return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
    } else if (rawTime.length === 4) {
      // 假設是 HHmm
      const hour = rawTime.substring(0, 2);
      const minute = rawTime.substring(2, 4);
      return `${hour}:${minute}`;
    } else {
      // 嘗試解析其他可能的數字格式，例如直接是 HHMMSS 數字
      const numTime = parseInt(rawTime, 10);
      if (!isNaN(numTime)) {
         const timeStr = numTime.toString().padStart(6, '0');
         const hour = timeStr.substring(0, 2);
         const minute = timeStr.substring(2, 4);
         // 確保小時和分鐘有效
         if (parseInt(hour) >= 0 && parseInt(hour) < 24 && parseInt(minute) >= 0 && parseInt(minute) < 60) {
           return `${hour}:${minute}`;
         }
      }
      console.warn(`[formatSessionTime] Unrecognized time format '${rawTime}'`);
      return 'Invalid Time'; 
    }
  } catch (error) {
    console.warn(`[formatSessionTime] Error formatting time '${rawTime}':`, error);
    return 'Invalid Time';
  }
}

// --- 新的原始資料抓取函數 ---

/**
 * 抓取 SK Cinema 原始 API 資料
 * @param locationCode - 影城代碼 (預設 1004 為青埔)
 * @returns Promise<SkcRawDataPayload> 包含原始 homePageData 和 sessionData 的物件
 */
export async function fetchRawSkcData(locationCode: string = '1004'): Promise<SkcRawDataPayload> {
  console.log(`[skcScraper] Fetching RAW SKC data for location: ${locationCode}`);
  const browser: Browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page: Page = await context.newPage();

  const targetUrl = `https://www.skcinemas.com/sessions?c=${locationCode}`;
  let homePageData: any = null;
  let sessionData: any = null;
  let fetchError: Error | null = null;

  const responsePromise = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('[skcScraper] Timeout waiting for API responses'));
    }, 45000); // 45 秒超時

    page.on('response', async (response: Response) => {
      const url = response.url();
      const isHomePageApi = /\/api\/VistaDataV2\/GetHomePageListForApps/i.test(url);
      const isSessionApi = /\/GetSessionByCinemasIDForApp/i.test(url);

      if ((isHomePageApi || isSessionApi) && response.ok()) {
        try {
          const json = await response.json();
          if (isHomePageApi) {
            console.log('[skcScraper] Intercepted GetHomePageListForApps API response (Raw).');
            homePageData = json;
            // 移除打印原始 JSON
          } else if (isSessionApi) {
            console.log('[skcScraper] Intercepted GetSessionByCinemasIDForApp API response (Raw).');
            sessionData = json;
          }

          // 如果兩個 API 都已攔截到，則完成 Promise
          if (homePageData && sessionData) {
            clearTimeout(timeout);
            resolve();
          }
        } catch (error) {
          console.error(`[skcScraper] Error parsing JSON from ${url}:`, error);
          // 不在這裡 reject，允許另一個 API 可能成功
        }
      }
    });
  });

  try {
    console.log(`[skcScraper] Navigating to target URL for raw data: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 60000 });
    console.log('[skcScraper] Navigation complete for raw data. Waiting for API responses...');
    
    // 等待 responsePromise 完成或超時/錯誤
    await responsePromise; 

    if (!homePageData || !sessionData) {
       throw new Error('Failed to capture both required SKC API responses within timeout.');
    }
    console.log('[skcScraper] Successfully captured both raw API responses.');

  } catch (error: any) {
    console.error(`[skcScraper] Error fetching raw SKC data: ${error}`);
    fetchError = error; // 記錄錯誤
  } finally {
    await browser.close();
    console.log('[skcScraper] Browser closed for raw data fetch.');
  }

  // 如果在 finally 之前有錯誤，則返回 null
  if (fetchError) {
     return { homePageData: null, sessionData: null };
  }

  return { homePageData, sessionData };
}


// --- 新的資料處理函數 ---

/**
 * 處理從 SK Cinema API 獲取的原始資料，轉換為 CombinedMovieData 陣列
 * @param rawData 包含原始 homePageData 和 sessionData 的物件
 * @returns CombinedMovieData[] 格式化後的電影時刻表陣列 (IMDb 欄位為 null)
 */
export function processSkcData(rawData: SkcRawDataPayload): CombinedMovieData[] {
  const { homePageData, sessionData } = rawData;
  const formattedMovies: CombinedMovieData[] = [];

  if (!homePageData || !sessionData) {
    console.error('[processSkcData] Missing homePageData or sessionData. Cannot process.');
    return formattedMovies; // 返回空陣列
  }

  console.log('[processSkcData] Starting data processing...');

   // --- 資料處理邏輯開始 --- 

    // 1. 從 homePageData 提取海報 URL Map
    const posterMap = new Map<string | number, string>();
    try {
      // 檢查 FilmUrl 是否存在且為陣列
      if (homePageData?.data?.newestMovie?.FilmUrl && Array.isArray(homePageData.data.newestMovie.FilmUrl)) {
        for (const filmUrlEntry of homePageData.data.newestMovie.FilmUrl) {
          // 確保有 FilmNameID 且 FU_Type 為 0 (代表海報) 且 FU_FileName 存在
          if (filmUrlEntry.FilmNameID && filmUrlEntry.FU_Type === 0 && filmUrlEntry.FU_FileName) { 
            // 嘗試構建完整的 URL，如果它不是完整的 URL
            let fullPosterUrl = filmUrlEntry.FU_FileName;
            if (!fullPosterUrl.startsWith('http')) {
              // 假設需要加上基礎 URL，需要確認 skcinemas 的圖片路徑規則
              // 暫時假設一個可能的基礎路徑，需要驗證！
              fullPosterUrl = `https://www.skcinemas.com${fullPosterUrl.startsWith('/') ? '' : '/'}${fullPosterUrl}`; 
            }
             posterMap.set(filmUrlEntry.FilmNameID, fullPosterUrl);
          }
        }
      } else {
        console.warn('[processSkcData] No FilmUrl data found in homePageData to extract posters.');
      }
    } catch (e) {
      console.error('[processSkcData] Error processing homePageData for posters:', e);
    }
    console.log(`[processSkcData] Extracted ${posterMap.size} posters.`);

    // 2. 遍歷 homePageData 中的電影列表
    try {
      // 檢查 Film 陣列是否存在
      if (homePageData?.data?.newestMovie?.Film && Array.isArray(homePageData.data.newestMovie.Film)) {
        for (const film of homePageData.data.newestMovie.Film) {
          const filmId = film.FilmNameID;
          if (!filmId) {
            console.warn('[processSkcData] Skipping film with missing FilmNameID:', film);
            continue; 
          }

          // 3. 從 sessionData 中查找對應電影的原始場次列表
          let rawSessions: any[] = []; // 類型待細化
          try {
            // 檢查 Session 陣列是否存在
            if (sessionData?.data?.Session && Array.isArray(sessionData.data.Session)) {
              rawSessions = sessionData.data.Session.filter((s: any) => s.FilmNameID === filmId);
            } else {
               console.warn(`[processSkcData] No Session data found in sessionData for film ${filmId}.`);
            }
          } catch(e) {
             console.error(`[processSkcData] Error filtering sessions for film ${filmId}:`, e);
          }

          // 4. 格式化場次 
          const formattedSessions: SKCSession[] = [];
          if (rawSessions.length > 0) {
            for (const rawSession of rawSessions) {
              // --- 修改: 添加 SessionID 的檢查 --- 
              if (rawSession.BusinessDate && rawSession.ShowTime && rawSession.EndTime && rawSession.ScreenName && rawSession.SessionID) {
                const sessionDateObject = new Date(rawSession.BusinessDate.replace(/-/g, '/'));
                if (!sessionDateObject || isNaN(sessionDateObject.getTime())) {
                   console.warn(`[processSkcData] Invalid session date object for date '${rawSession.BusinessDate}', film ${filmId}. Skipping session.`);
                   continue;
                }

                const session: SKCSession = {
                   date: formatSessionDate(rawSession.BusinessDate),
                   weekday: getWeekdayString(sessionDateObject),
                   showtime: formatSessionTime(rawSession.ShowTime),
                   endTime: formatSessionTime(rawSession.EndTime),
                   filmType: rawSession.FilmType || '',
                   screenName: rawSession.ScreenName || '',
                   // --- 新增: 提取 sessionId --- 
                   sessionId: String(rawSession.SessionID) // 確保是字串
                };
                formattedSessions.push(session);
              } else {
                // --- 修改: 更新警告信息，包含 SessionID 缺失的可能性 ---
                console.warn(`[processSkcData] Skipping session for film ${filmId} due to missing fields (incl. SessionID?):`, rawSession);
              }
            }
             // 按日期和時間排序場次 (可選但推薦)
             formattedSessions.sort((a, b) => {
               // 比較日期字符串 (假設格式一致)
               const dateComparison = a.date.localeCompare(b.date);
               if (dateComparison !== 0) return dateComparison;
               // 如果日期相同，比較時間字符串
               return a.showtime.localeCompare(b.showtime);
             });
          }

          // 5. 組合 CombinedMovieData 物件 (IMDb 欄位為 null)
          if (formattedSessions.length > 0) {
            formattedMovies.push({
              filmNameID: filmId,
              movieName: film.FilmName || 'Unknown Title',
              englishTitle: film.TitleAlt || '',
              posterUrl: posterMap.get(filmId) || null,
              posterPath: null,
              skRating: film.Rating || 'N/A',
              ratingDescription: film.RatingDescription || '',
              runtimeMinutes: parseInt(film.RunTime, 10) || 0, 
              sessions: formattedSessions,
              // IMDb 欄位初始化為 null
              imdbRating: null,
              imdbUrl: null,
              plot: null,
              genres: null,
              directors: null,
              cast: null,
              imdbStatus: 'failed' // 初始狀態設為 failed，等待後續 IMDb 處理更新
            });
          } else {
             console.log(`[processSkcData] Skipping movie ${filmId} (${film.FilmName}) as it has no sessions found in sessionData.`);
          }
        }
      } else {
         console.warn('[processSkcData] No Film list found in homePageData.');
      }
    } catch (e) {
      console.error('[processSkcData] Error processing film list or sessions:', e);
    }

    // --- 資料處理邏輯結束 --- 

    console.log(`[processSkcData] Data processing complete. Found ${formattedMovies.length} movies (initial).`);
    return formattedMovies; 
}


// --- 原有的 fetchSkcMovieData 函數 (現已棄用，其邏輯已拆分) ---
/*
export async function fetchSkcMovieData(locationCode: string = '1004', date?: string): Promise<CombinedMovieData[]> {
  // ... 原有的 Playwright 啟動和攔截邏輯 ...
  // ... 原有的資料處理邏輯 ...
}
*/ 