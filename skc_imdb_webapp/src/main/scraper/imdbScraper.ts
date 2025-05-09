// import { chromium, type Browser, type Page, type BrowserContext } from 'playwright';
import axios from 'axios';
import * as cheerio from 'cheerio';
import type { 
    CombinedMovieData, 
    GetImdbRawDataInput, 
    ImdbRawDataPayload, 
    // 移除未使用的導入
    // LoadingProgressPayload, 
    // LoadingProgressType 
} from '../../shared/ipc-interfaces';

// --- 新增: HTTP 請求輔助函數 ---
async function fetchHtml(url: string, attempt = 1, maxAttempts = 2): Promise<string> {
  console.log(`[imdbScraper] Fetching HTML from URL: ${url} (Attempt ${attempt}/${maxAttempts})`);
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.88 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9,zh-TW;q=0.8,zh;q=0.7' // Added zh-TW, zh for broader acceptance
      },
      timeout: 2500 // Changed timeout from 30000 to 2500 milliseconds
    });
    return response.data;
  } catch (error: any) {
    console.error(`[imdbScraper] Error fetching HTML from ${url} (Attempt ${attempt}/${maxAttempts}):`, error.message);
    if (axios.isAxiosError(error) && error.response) {
      console.error(`[imdbScraper] Status: ${error.response.status}, Data: ${JSON.stringify(error.response.data).substring(0, 200)}`);
    }
    if (attempt < maxAttempts) {
      console.log(`[imdbScraper] Retrying fetchHtml for ${url} in 2 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retrying
      return fetchHtml(url, attempt + 1, maxAttempts);
    }
    throw new Error(`Failed to fetch HTML from ${url} after ${maxAttempts} attempts: ${error.message}`);
  }
}
// ---

// --- 新增: 正則表達式配置，用於清理標題 ---
const TITLE_CLEANUP_REGEXPS: RegExp[] = [
  /電影日/g // 移除所有出現的 "電影日"
  // 未來可在此添加更多正則，例如移除括號內容：/\(.*?\)/g
];
// ---

// --- 新增: 相似度驗證閾值 ---
const SIMILARITY_THRESHOLD = 80; // 百分比
// ---

// 新增: 定義 fetchRawImdbData 的詳細返回狀態
export type FetchImdbStatus = 'success' | 'no-rating' | 'fetch-failed' | 'not-found';

// --- 新增: 標題相似度計算函數 (Jaccard) ---
function calculateTitleSimilarity(title1: string, title2: string): number {
  if (!title1 || !title2) {
    return 0;
  }

  const normalizeAndTokenize = (str: string): Set<string> => {
    return new Set(
      str
        .toLowerCase()
        .split(/\s+|\p{P}/u) // 按空白或標點符號分詞 (Unicode)
        .filter(token => token.length > 0)
    );
  };

  const tokens1 = normalizeAndTokenize(title1);
  const tokens2 = normalizeAndTokenize(title2);

  if (tokens1.size === 0 && tokens2.size === 0) {
    return 100; // 兩個空標題視為完全匹配
  }
  if (tokens1.size === 0 || tokens2.size === 0) {
    return 0; // 一個空一個非空，視為不匹配
  }

  const intersection = new Set([...tokens1].filter(token => tokens2.has(token)));
  const union = new Set([...tokens1, ...tokens2]);

  if (union.size === 0) { 
    return tokens1.size === 0 && tokens2.size === 0 ? 100 : 0;
  }

  const similarity = (intersection.size / union.size) * 100;
  return parseFloat(similarity.toFixed(2)); // 保留兩位小數
}
// ---

// 修改: searchMovieOnImdb 的返回類型，增加 searchedTitle 和 sourceTitleType
interface SearchMovieResult {
  movieUrl: string | null;
  searchedTitle: string | null;       // 記錄最終是用哪個標題搜尋成功的
  sourceTitleType: 'original' | 'english' | null; // 記錄成功來源是原片名還是英文名
}

// 原 searchMovieOnImdb 函數，修改其返回類型和返回内容
async function searchMovieOnImdb(title: string, englishTitle?: string): Promise<SearchMovieResult> {
  
  let movieUrl: string | null = null;
  let finalSearchedTitle: string | null = null;
  let finalSourceTitleType: 'original' | 'english' | null = null;
  
  // --- 原片名處理 (Primary search with original title) ---
  let searchQuery = title;
  console.log(`[imdbScraper] Original title for primary search: '${searchQuery}'`);
  for (const regex of TITLE_CLEANUP_REGEXPS) {
    const cleanedQuery = searchQuery.replace(regex, '').trim();
    if (cleanedQuery !== searchQuery) {
      console.log(`[imdbScraper] Applied regex ${regex} for cleanup on primary title. New search query: '${cleanedQuery}'`);
      searchQuery = cleanedQuery;
    }
  }
  
  const selector = 'ul[class^="ipc-metadata-list"] li a[href^="/title/tt"]';

  if (searchQuery.trim() !== '') { // 確保清理後的原片名不為空
    console.log(`[imdbScraper] Attempting primary search for: '${searchQuery}' (Original: '${title}')`);
    movieUrl = await performSearchAttempt(searchQuery, selector);
  }

  if (movieUrl) {
    console.log(`[imdbScraper] Primary search successful for '${searchQuery}'. URL: ${movieUrl}`);
    finalSearchedTitle = searchQuery; 
    finalSourceTitleType = 'original';
  } else {
    if (searchQuery.trim() !== '') {
        console.warn(`[imdbScraper] Primary search failed for processed title '${searchQuery}' (Original: '${title}').`);
    } else {
        console.warn(`[imdbScraper] Primary title '${title}' became empty after cleanup, skipping primary search.`);
    }
    
    // --- 英文片名備援搜尋邏輯 ---
    if (englishTitle && englishTitle.trim() !== '') {
      console.log(`[imdbScraper] Attempting fallback search with English title: '${englishTitle}'`);
      let englishSearchQuery = englishTitle; 
      for (const regex of TITLE_CLEANUP_REGEXPS) {
        const cleanedQuery = englishSearchQuery.replace(regex, '').trim();
        if (cleanedQuery !== englishSearchQuery) {
          console.log(`[imdbScraper] Applied regex ${regex} for cleanup on English title. New search query: '${cleanedQuery}'`);
          englishSearchQuery = cleanedQuery;
        }
      }
      
      if (englishSearchQuery.trim() !== '') {
        console.log(`[imdbScraper] Performing fallback search for processed English title: '${englishSearchQuery}'`);
        movieUrl = await performSearchAttempt(englishSearchQuery, selector); 
        if (movieUrl) {
          console.log(`[imdbScraper] Fallback search successful for '${englishSearchQuery}'. URL: ${movieUrl}`);
          finalSearchedTitle = englishSearchQuery; 
          finalSourceTitleType = 'english';
        } else {
          console.warn(`[imdbScraper] Fallback search also failed for processed English title '${englishSearchQuery}'.`);
        }
      } else {
        console.log(`[imdbScraper] English title ('${englishTitle}') became empty after cleanup, skipping fallback search.`);
  }
    } else {
      console.log(`[imdbScraper] No English title provided or it is empty, skipping fallback search.`);
    }
  }

  return { movieUrl, searchedTitle: finalSearchedTitle, sourceTitleType: finalSourceTitleType };
}

// 將單次搜索嘗試提取為輔助函數
async function performSearchAttempt(searchQuery: string, selector: string): Promise<string | null> {
   try {
     const searchUrl = `https://www.imdb.com/find/?q=${encodeURIComponent(searchQuery)}&s=tt`;
     console.log(`[imdbScraper] Fetching HTML for search query: '${searchQuery}' from URL: ${searchUrl}`);
     const htmlContent = await fetchHtml(searchUrl);
     const $ = cheerio.load(htmlContent);
     
     console.log(`[imdbScraper] HTML content loaded for query: '${searchQuery}'. Attempting selector: ${selector}`);
     const firstLink = $(selector).first();
     const href = firstLink.attr('href');

     if (href) {
         console.log(`[imdbScraper] Found potential match URL for query '${searchQuery}':`, href);
         return `https://www.imdb.com${href.split('?')[0]}`; 
     }
   } catch (error: any) { // Explicitly type error as any to access message property
     console.warn(`[imdbScraper] Could not find match for query '${searchQuery}' using selector. Error or timeout: ${error.message}`); 
   }
   return null; 
}

// Helper function to parse a single JSON-LD script content
function parseSingleJsonLdScript(scriptContent: string | null): any | null {
  if (scriptContent) {
    try {
      const jsonData = JSON.parse(scriptContent);
      if (jsonData['@type'] === 'Movie') {
        console.log('[imdbScraper] Found Movie type JSON-LD data (in helper).');
        return jsonData;
      }
    } catch (parseError) {
      console.warn('[imdbScraper] Error parsing a JSON-LD script content (in helper):', parseError);
    }
  }
  return null;
}

async function extractJsonLd(htmlContent: string): Promise<any | null> {
  console.log('[imdbScraper] Attempting to extract JSON-LD from HTML content...');
  
  try {
    const $ = cheerio.load(htmlContent);
    const scriptElements = $('script[type="application/ld+json"]').get(); // Get an array of DOM elements

    for (const element of scriptElements) {
      const scriptContent = $(element).html();
      const movieData = parseSingleJsonLdScript(scriptContent);
      if (movieData) {
        return movieData; // Found it, return immediately
      }
    }
    // If loop completes without returning, it means no Movie JSON-LD was found
    console.warn('[imdbScraper] Movie type JSON-LD not found after checking all script elements.');
    return null;

  } catch (error) {
    console.error('[imdbScraper] Error processing HTML for JSON-LD extraction (e.g., cheerio.load failed):', error);
    return null; 
  }
}

async function fallbackScraping(htmlContent: string): Promise<Partial<ImdbRawDataPayload>> {
    console.log('[imdbScraper] Performing fallback DOM scraping from HTML content...');
    const scrapedData: Partial<ImdbRawDataPayload> = {};
    try {
      const $ = cheerio.load(htmlContent);

      // 電影主標題 (嘗試從 H1 data-testid 獲取)
      const titleSelector = 'h1[data-testid="hero__pageTitle"]'; 
      try {
        const pageTitle = $(titleSelector).first().text()?.trim();
        if (pageTitle) {
            scrapedData.imdbPageTitle = pageTitle;
            console.log(`[imdbScraper] Fallback - Page Title: ${scrapedData.imdbPageTitle}`);
        } else {
            console.warn('[imdbScraper] Fallback - Page Title selector found, but text content is empty.');
        }
      } catch (e) { 
        console.warn('[imdbScraper] Fallback - Page Title selector (h1[data-testid="hero__pageTitle"]) not found or error. Will try another common H1 selector.', e);
        // 嘗試備用 H1 選擇器
        const altTitleSelector = 'h1'; 
        try {
            const altPageTitle = $(altTitleSelector).first().text()?.trim();
            if (altPageTitle) {
                scrapedData.imdbPageTitle = altPageTitle;
                console.log(`[imdbScraper] Fallback - Page Title (alt H1): ${scrapedData.imdbPageTitle}`);
            } else {
                 console.warn('[imdbScraper] Fallback - Alt Page Title selector (h1) did not find any elements or text content is empty.');
            }
        } catch (e2) { 
            console.warn('[imdbScraper] Fallback - Alt Page Title selector (h1) also not found or error.', e2);
        }
      }

      // 評分
      const ratingSelector = '[data-testid="hero-rating-bar__aggregate-rating__score"] > span:first-child';
      try {
        const rating = $(ratingSelector).first().text()?.trim();
        if (rating) scrapedData.imdbRating = rating;
        console.log(`[imdbScraper] Fallback - Rating: ${scrapedData.imdbRating}`);
      } catch (e) { console.warn('[imdbScraper] Fallback - Rating selector not found or error.', e); }

      // 劇情簡介
      const plotSelector = '[data-testid="plot-l"] span[data-testid="plot-xl"]'; // This selector might need adjustment for Cheerio
       try {
         const plot = $(plotSelector).first().text()?.trim(); // Or .html() if it contains inner tags needed
         if (plot) scrapedData.plot = plot;
         console.log(`[imdbScraper] Fallback - Plot found: ${plot ? 'Yes' : 'No'}`);
       } catch (e) { console.warn('[imdbScraper] Fallback - Plot selector not found or error.', e); }
      
      // 類型
      const genreSelector = 'div[data-testid="genres"] a span'; 
       try {
         scrapedData.genres = $(genreSelector).map((_i, el) => $(el).text()?.trim()).get().filter(Boolean);
         console.log(`[imdbScraper] Fallback - Genres: ${scrapedData.genres?.join(', ')}`);
       } catch (e) { console.warn('[imdbScraper] Fallback - Genre selector not found or error.', e); }

      // 導演
      const directorSelector = 'a[href*="/name/"][aria-label*="Director"], ul[data-testid*="hero-subnav__directors"] li a, section[data-testid*="director"] li a'; // Combined and made more robust for Cheerio
      try {
        scrapedData.directors = $(directorSelector).map((_i, el) => $(el).text()?.trim()).get().filter(Boolean);
        // Remove duplicates that might arise from multiple selectors matching the same director
        if (scrapedData.directors) {
          scrapedData.directors = [...new Set(scrapedData.directors)];
        }
        console.log(`[imdbScraper] Fallback - Directors: ${scrapedData.directors?.join(', ')}`);
      } catch (e) { console.warn('[imdbScraper] Fallback - Director selector not found or error.', e); }

      // 演員
      const castSelector = 'a[data-testid*="cast-item__name"]';
       try {
         scrapedData.cast = $(castSelector).map((_i, el) => $(el).text()?.trim()).get().filter(Boolean);
         if (scrapedData.cast && scrapedData.cast.length > 5) {
            scrapedData.cast = scrapedData.cast.slice(0, 5); 
         }
         console.log(`[imdbScraper] Fallback - Cast: ${scrapedData.cast?.join(', ')}`);
       } catch (e) { console.warn('[imdbScraper] Fallback - Cast selector not found or error.', e); }
    } catch (error) {
        console.error('[imdbScraper] Error during fallback scraping from HTML:', error);
    }
    return scrapedData; 
}

/**
 * 根據電影資訊抓取原始的 IMDb 資料
 * @param input 包含電影名稱等資訊的物件
 * @returns Promise<ImdbRawDataPayload> 包含原始或半處理 IMDb 資料的物件
 */
export async function fetchRawImdbData(
  input: GetImdbRawDataInput
): Promise<ImdbRawDataPayload> {
  console.log(`[imdbScraper] Fetching raw IMDb data for: ${input.englishTitle || input.movieName}`);
  
  let payload: ImdbRawDataPayload = {};

  try {
    // 1. 搜索電影並獲取 IMDb 頁面 URL
    const searchResult = await searchMovieOnImdb(input.movieName, input.englishTitle);
    const { movieUrl, searchedTitle, sourceTitleType } = searchResult;

    if (movieUrl) {
      payload.imdbUrl = movieUrl;
      console.log(`[imdbScraper] Navigating to movie page: ${movieUrl} - This will now be an HTML fetch.`);
      
      // Fetch HTML content of the movie page
      const moviePageHtmlContent = await fetchHtml(movieUrl);

      // 2. 嘗試提取 JSON-LD from HTML content
      const jsonLdData = await extractJsonLd(moviePageHtmlContent);
      payload.jsonLd = jsonLdData; // 儲存原始 JSON-LD

      let extractedRating: string | null = null;
      let imdbPageTitleFromScraping: string | null = null;

      if (jsonLdData && jsonLdData['@type'] === 'Movie') {
        console.log('[imdbScraper] Processing data from JSON-LD...');
        imdbPageTitleFromScraping = jsonLdData.name?.trim() || null; 
        extractedRating = jsonLdData.aggregateRating?.ratingValue?.toString() || null;
        payload.plot = jsonLdData.description || null;
        payload.genres = Array.isArray(jsonLdData.genre) ? jsonLdData.genre : (typeof jsonLdData.genre === 'string' ? [jsonLdData.genre] : null);
        payload.directors = Array.isArray(jsonLdData.director) 
          ? jsonLdData.director.map((d: any) => d?.name).filter(Boolean) 
          : (jsonLdData.director?.name ? [jsonLdData.director.name] : null);
        payload.cast = Array.isArray(jsonLdData.actor) 
          ? jsonLdData.actor.map((a: any) => a?.name).filter(Boolean).slice(0, 5) 
          : null;
        console.log('[imdbScraper] JSON-LD processing complete.');
      } else {
        console.log('[imdbScraper] JSON-LD failed or invalid, attempting fallback scraping from HTML content...');
        const fallbackData = await fallbackScraping(moviePageHtmlContent);
        payload = { ...payload, ...fallbackData };
        extractedRating = fallbackData.imdbRating || null; 
        if (!imdbPageTitleFromScraping) {
          imdbPageTitleFromScraping = fallbackData.imdbPageTitle?.trim() || null;
        }
      }
      payload.imdbPageTitle = imdbPageTitleFromScraping;

      // --- 新增: 標題相似度驗證 ---
      if (imdbPageTitleFromScraping && searchedTitle) { 
        if (sourceTitleType === 'english') {
          const similarity = calculateTitleSimilarity(searchedTitle, imdbPageTitleFromScraping);
          console.log(`[imdbScraper] Title similarity check (Source: English Fallback): Input='${searchedTitle}', IMDbPage='${imdbPageTitleFromScraping}', Similarity=${similarity}%`);

          if (similarity < SIMILARITY_THRESHOLD) {
            console.warn(`[imdbScraper] English fallback title similarity (${similarity}%) is below threshold (${SIMILARITY_THRESHOLD}%). Marking as not found.`);
            payload.status = 'not-found';
            payload.error = `Title similarity too low for English fallback (${similarity.toFixed(2)}%): Input '${searchedTitle}' vs IMDb Page '${imdbPageTitleFromScraping}'`;
            payload.imdbRating = null;
            payload.plot = null;
            payload.genres = null;
            payload.directors = null;
            payload.cast = null;
            payload.jsonLd = null; 
            return payload; 
          }
        } else {
          console.log(`[imdbScraper] Skipping strict similarity validation: Source type is '${sourceTitleType}' (not 'english'), or searchedTitle ('${searchedTitle}') or IMDb page title ('${imdbPageTitleFromScraping}') might be missing.`);
        }
      } else {
        if (!searchedTitle) console.warn('[imdbScraper] Cannot perform similarity check: searchedTitle is missing.');
        if (!imdbPageTitleFromScraping) console.warn('[imdbScraper] Cannot perform similarity check: imdbPageTitle (imdbPageTitleFromScraping) is missing (from JSON-LD and fallback scraping).');
      }
      // --- 相似度驗證結束 ---

      if (payload.status !== 'not-found') {
        if (extractedRating) {
            payload.status = 'success';
            payload.imdbRating = extractedRating;
            console.log(`[imdbScraper] Status set to 'success' for ${input.englishTitle || input.movieName}`);
        } else {
            payload.status = 'no-rating';
            payload.imdbRating = null; 
            console.warn(`[imdbScraper] Status set to 'no-rating' for ${input.englishTitle || input.movieName}`);
        }
      }
    } else {
      console.warn(`[imdbScraper] Could not find IMDb page for '${input.englishTitle || input.movieName}'. Status: 'not-found'`);
      payload.status = 'not-found';
      payload.error = 'Movie not found on IMDb';
    }
     return payload;

  } catch (error: any) {
    console.error(`[imdbScraper] Error fetching IMDb data for ${input.englishTitle || input.movieName}: ${error}`);
    if (typeof payload !== 'object' || payload === null) payload = {}; 
    payload.status = 'fetch-failed'; 
    payload.error = error.message || 'Unknown IMDb scraping error';
    return payload;
  } finally {
    console.log(`[imdbScraper] Completed IMDb data fetch for ${input.englishTitle || input.movieName}. No browser/page cleanup needed with Axios/Cheerio.`);
  }
}

/**
 * (可選) 處理原始 IMDb 資料，將其轉換為 CombinedMovieData 需要的最終格式
 * @param rawData 從 fetchRawImdbData 獲取的資料
 * @returns Partial<CombinedMovieData> 包含格式化 IMDb 欄位的物件
 */
export function processImdbData(rawData: ImdbRawDataPayload): Partial<CombinedMovieData> {
    return {
        imdbRating: rawData.imdbRating || null,
        imdbUrl: rawData.imdbUrl || null,
        plot: rawData.plot || null,
        genres: rawData.genres || null,
        directors: rawData.directors || null,
        cast: rawData.cast || null,
    };
}