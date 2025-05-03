import { chromium, type Browser, type Page, type BrowserContext } from 'playwright';
import type { 
    CombinedMovieData, 
    GetImdbRawDataInput, 
    ImdbRawDataPayload, 
    // 移除未使用的導入
    // LoadingProgressPayload, 
    // LoadingProgressType 
} from '../../shared/ipc-interfaces';

// --- 新增: 正則表達式配置，用於清理標題 ---
const TITLE_CLEANUP_REGEXPS: RegExp[] = [
  /電影日/g // 移除所有出現的 "電影日"
  // 未來可在此添加更多正則，例如移除括號內容：/\(.*?\)/g
];
// ---

// 新增: 定義 fetchRawImdbData 的詳細返回狀態
export type FetchImdbStatus = 'success' | 'no-rating' | 'fetch-failed' | 'not-found';

// 輔助函數 (待實現)
async function searchMovieOnImdb(page: Page, title: string, englishTitle?: string): Promise<string | null> {
  
  // --- 修改: 使用正則表達式清理標題 ---
  let searchQuery = title;
  console.log(`[imdbScraper] Original title: '${searchQuery}'`);
  for (const regex of TITLE_CLEANUP_REGEXPS) {
    const cleanedQuery = searchQuery.replace(regex, '').trim();
    if (cleanedQuery !== searchQuery) {
      console.log(`[imdbScraper] Applied regex ${regex} for cleanup. New search query: '${cleanedQuery}'`);
      searchQuery = cleanedQuery;
    }
  }
  // --- 清理邏輯結束 ---
  
  const selector = 'ul[class^="ipc-metadata-list"] li a[href^="/title/tt"]';

  console.log(`[imdbScraper] Searching IMDb primarily for: '${searchQuery}' (Original title: '${title}', English: '${englishTitle || 'N/A'}')`);

  // 直接執行搜索嘗試，使用處理後的 searchQuery
  const movieUrl = await performSearchAttempt(page, searchQuery, selector);

  if (!movieUrl) {
     console.warn(`[imdbScraper] Search failed for processed title '${searchQuery}' (Original: '${title}').`);
  }

  return movieUrl;
}

// 將單次搜索嘗試提取為輔助函數
async function performSearchAttempt(page: Page, searchQuery: string, selector: string): Promise<string | null> {
   try {
     await page.setExtraHTTPHeaders({ 
         'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.88 Safari/537.36',
         'Accept-Language': 'en-US,en;q=0.9' // 保持英文介面
     });
     const searchUrl = `https://www.imdb.com/find/?q=${encodeURIComponent(searchQuery)}&s=tt`;
     await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }); 
     console.log(`[imdbScraper] Page loaded for query: '${searchQuery}'. Attempting selector: ${selector}`);
     
     await page.waitForSelector(selector, { timeout: 10000 }); 
     const href = await page.locator(selector).first().getAttribute('href');

     if (href) {
         console.log(`[imdbScraper] Found potential match URL for query '${searchQuery}':`, href);
         return `https://www.imdb.com${href.split('?')[0]}`; 
     }
   } catch (error) {
     console.warn(`[imdbScraper] Could not find match for query '${searchQuery}' using selector. Error or timeout.`); 
   }
   return null; 
}

async function extractJsonLd(page: Page): Promise<any | null> {
  console.log('[imdbScraper] Attempting to extract JSON-LD...');
  try {
    const jsonLdScripts = await page.$$('script[type="application/ld+json"]');
    for (const scriptElement of jsonLdScripts) {
        const jsonLdText = await scriptElement.textContent();
        if (jsonLdText) {
            const jsonData = JSON.parse(jsonLdText);
            if (jsonData['@type'] === 'Movie') {
                console.log('[imdbScraper] Found Movie type JSON-LD data.');
                return jsonData;
            }
        }
    }
  } catch (error) {
    console.error('[imdbScraper] Error parsing JSON-LD:', error);
  }
  console.warn('[imdbScraper] Movie type JSON-LD not found or failed to parse.');
  return null;
}

async function fallbackScraping(page: Page): Promise<Partial<ImdbRawDataPayload>> {
    console.log('[imdbScraper] Performing fallback DOM scraping...');
    const scrapedData: Partial<ImdbRawDataPayload> = {};
    try {
      // 評分
      const ratingSelector = '[data-testid="hero-rating-bar__aggregate-rating__score"] > span:first-child';
      try {
        await page.waitForSelector(ratingSelector, { timeout: 3000 });
        scrapedData.imdbRating = await page.textContent(ratingSelector) || undefined;
        console.log(`[imdbScraper] Fallback - Rating: ${scrapedData.imdbRating}`);
      } catch { console.warn('[imdbScraper] Fallback - Rating selector not found.'); }

      // 劇情簡介
      const plotSelector = '[data-testid="plot-l"] span[data-testid="plot-xl"]';
       try {
         await page.waitForSelector(plotSelector, { timeout: 3000 });
         scrapedData.plot = await page.textContent(plotSelector) || undefined;
         console.log(`[imdbScraper] Fallback - Plot found.`);
       } catch { console.warn('[imdbScraper] Fallback - Plot selector not found.'); }
      
      // 類型
      const genreSelector = 'div[data-testid="genres"] a span'; 
       try {
         await page.waitForSelector(genreSelector, { timeout: 3000 });
         scrapedData.genres = await page.$$eval(genreSelector, spans => spans.map(span => span.textContent?.trim() || '').filter(Boolean));
         console.log(`[imdbScraper] Fallback - Genres: ${scrapedData.genres?.join(', ')}`);
       } catch { console.warn('[imdbScraper] Fallback - Genre selector not found.'); }

      // 導演
      const directorSelector = 'a[href*="/name/"][aria-label*="Director"], li[data-testid*="director"] a';
      try {
        await page.waitForSelector(directorSelector, { timeout: 3000 });
        scrapedData.directors = await page.$$eval(directorSelector, links => 
            Array.from(links).map(a => a.textContent?.trim() || '').filter(Boolean)
        );
        console.log(`[imdbScraper] Fallback - Directors: ${scrapedData.directors?.join(', ')}`);
      } catch { console.warn('[imdbScraper] Fallback - Director selector not found.'); }

      // 演員
      const castSelector = 'a[data-testid*="cast-item__name"]';
       try {
         await page.waitForSelector(castSelector, { timeout: 3000 });
         scrapedData.cast = await page.$$eval(castSelector, links => 
             Array.from(links).map(a => a.textContent?.trim() || '').filter(Boolean)
         );
         if (scrapedData.cast && scrapedData.cast.length > 5) {
            scrapedData.cast = scrapedData.cast.slice(0, 5); 
         }
         console.log(`[imdbScraper] Fallback - Cast: ${scrapedData.cast?.join(', ')}`);
       } catch { console.warn('[imdbScraper] Fallback - Cast selector not found.'); }
    } catch (error) {
        console.error('[imdbScraper] Error during fallback scraping:', error);
        // 即使抓取過程中出錯，仍然返回已經抓取到的部分數據
    }
    // 將 return 語句移到 try...catch 外部
    return scrapedData; 
}

/**
 * 根據電影資訊抓取原始的 IMDb 資料
 * @param input 包含電影名稱等資訊的物件
 * @param existingContext 可選的現有 BrowserContext，用於並行處理
 * @returns Promise<ImdbRawDataPayload> 包含原始或半處理 IMDb 資料的物件
 */
export async function fetchRawImdbData(
  input: GetImdbRawDataInput, 
  existingContext?: BrowserContext
): Promise<ImdbRawDataPayload> {
  console.log(`[imdbScraper] Fetching raw IMDb data for: ${input.englishTitle || input.movieName}`);
  
  let browser: Browser | null = null;
  let context: BrowserContext;
  let page: Page | null = null;
  let ownBrowser = false;

  try {
    if (existingContext) {
      console.log('[imdbScraper] Reusing existing browser context.');
      context = existingContext;
    } else {
      console.log('[imdbScraper] Launching new browser instance.');
      ownBrowser = true;
      browser = await chromium.launch({ headless: true }); 
      context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.88 Safari/537.36',
        locale: 'en-US' 
      });
    }

    page = await context.newPage();
    let payload: ImdbRawDataPayload = {};

    // 1. 搜索電影並獲取 IMDb 頁面 URL
    const movieUrl = await searchMovieOnImdb(page, input.movieName, input.englishTitle);

    if (movieUrl) {
      payload.imdbUrl = movieUrl;
      console.log(`[imdbScraper] Navigating to movie page: ${movieUrl}`);
      await page.setExtraHTTPHeaders({ 
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.88 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9'
      });
      await page.goto(movieUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

      // 2. 嘗試提取 JSON-LD
      const jsonLdData = await extractJsonLd(page);
      payload.jsonLd = jsonLdData; // 儲存原始 JSON-LD

      let extractedRating: string | null = null;

      if (jsonLdData && jsonLdData['@type'] === 'Movie') {
        // 3a. 從 JSON-LD 解析資料 (優先)
        console.log('[imdbScraper] Processing data from JSON-LD...');
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
        // 3b. 如果 JSON-LD 失敗或類型不對，執行後備 DOM 抓取
        console.log('[imdbScraper] JSON-LD failed or invalid, attempting fallback scraping...');
        const fallbackData = await fallbackScraping(page);
        payload = { ...fallbackData, ...payload }; 
        extractedRating = fallbackData.imdbRating || null; // Use fallback rating
      }

      // 4. 判斷狀態並設置 payload
      if (extractedRating) {
          payload.status = 'success';
          payload.imdbRating = extractedRating;
          console.log(`[imdbScraper] Status set to 'success' for ${input.englishTitle || input.movieName}`);
      } else {
          payload.status = 'no-rating';
          payload.imdbRating = null; // Explicitly set to null if no rating found
          console.warn(`[imdbScraper] Status set to 'no-rating' for ${input.englishTitle || input.movieName}`);
      }
    } else {
      console.warn(`[imdbScraper] Could not find IMDb page for '${input.englishTitle || input.movieName}'. Status: 'not-found'`);
      payload.status = 'not-found';
      payload.error = 'Movie not found on IMDb';
    }
     return payload;

  } catch (error: any) {
    console.error(`[imdbScraper] Error fetching IMDb data for ${input.englishTitle || input.movieName}: ${error}`);
    return { 
        status: 'fetch-failed', // Assign specific status for fetch errors
        error: error.message || 'Unknown IMDb scraping error' 
    }; 
  } finally {
     if (page) {
        try {
            await page.close();
            console.log(`[imdbScraper] Page closed for ${input.englishTitle || input.movieName}.`);
        } catch (closeError) {
             console.warn(`[imdbScraper] Error closing page for ${input.englishTitle || input.movieName}:`, closeError);
        }
     }
     if (ownBrowser && browser) {
       try {
          await browser.close();
          console.log(`[imdbScraper] Browser closed for ${input.englishTitle || input.movieName}.`);
       } catch(closeError) {
            console.error(`[imdbScraper] Error closing browser for ${input.englishTitle || input.movieName}:`, closeError);
       }
     } else if (!ownBrowser) {
         console.log(`[imdbScraper] Leaving browser context open (reused) for ${input.englishTitle || input.movieName}.`);
     }
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