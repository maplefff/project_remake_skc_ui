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
async function searchMovieOnImdb(page: Page, title: string, englishTitle?: string): Promise<SearchMovieResult> {
  
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
    movieUrl = await performSearchAttempt(page, searchQuery, selector);
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
        movieUrl = await performSearchAttempt(page, englishSearchQuery, selector); 
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
      // 新增: 電影主標題 (嘗試從 H1 data-testid 獲取)
      const titleSelector = 'h1[data-testid="hero__pageTitle"]'; 
      try {
        await page.waitForSelector(titleSelector, { timeout: 3000 });
        scrapedData.imdbPageTitle = (await page.textContent(titleSelector))?.trim() || undefined;
        if (scrapedData.imdbPageTitle) {
            console.log(`[imdbScraper] Fallback - Page Title: ${scrapedData.imdbPageTitle}`);
        } else {
            console.warn('[imdbScraper] Fallback - Page Title selector found, but text content is empty.');
        }
      } catch { 
        console.warn('[imdbScraper] Fallback - Page Title selector (h1[data-testid="hero__pageTitle"]) not found. Will try another common H1 selector.');
        // 嘗試備用 H1 選擇器 (更通用，但可能不那麼精準)
        const altTitleSelector = 'h1'; 
        try {
            await page.waitForSelector(altTitleSelector, { timeout: 1000 }); 
            const allH1s = await page.locator(altTitleSelector).allTextContents();
            if (allH1s.length > 0) {
                scrapedData.imdbPageTitle = allH1s[0]?.trim() || undefined;
                if (scrapedData.imdbPageTitle) {
                    console.log(`[imdbScraper] Fallback - Page Title (alt H1): ${scrapedData.imdbPageTitle}`);
                } else {
                    console.warn('[imdbScraper] Fallback - Alt Page Title selector (h1) found, but text content is empty.');
                }
            } else {
                 console.warn('[imdbScraper] Fallback - Alt Page Title selector (h1) did not find any elements.');
            }
        } catch { 
            console.warn('[imdbScraper] Fallback - Alt Page Title selector (h1) also not found or timed out.');
        }
      }

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
    const searchResult = await searchMovieOnImdb(page, input.movieName, input.englishTitle);
    const { movieUrl, searchedTitle, sourceTitleType } = searchResult;

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
      let imdbPageTitle: string | null = null; 

      if (jsonLdData && jsonLdData['@type'] === 'Movie') {
        console.log('[imdbScraper] Processing data from JSON-LD...');
        imdbPageTitle = jsonLdData.name?.trim() || null; 
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
        console.log('[imdbScraper] JSON-LD failed or invalid, attempting fallback scraping...');
        const fallbackData = await fallbackScraping(page);
        payload = { ...fallbackData, ...payload }; 
        extractedRating = fallbackData.imdbRating || null; 
        if (!imdbPageTitle) { // 如果 JSON-LD 未提供標題，則使用 fallback 的
          imdbPageTitle = fallbackData.imdbPageTitle?.trim() || null;
        }
      }

      // --- 新增: 標題相似度驗證 ---
      if (imdbPageTitle && searchedTitle) { // 首先確保兩個用於比較的標題都實際存在
        if (sourceTitleType === 'english') {
          // 只有當來源是英文備援搜尋時，才進行嚴格的相似度驗證
          const similarity = calculateTitleSimilarity(searchedTitle, imdbPageTitle);
          console.log(`[imdbScraper] Title similarity check (Source: English Fallback): Input='${searchedTitle}', IMDbPage='${imdbPageTitle}', Similarity=${similarity}%`);

          if (similarity < SIMILARITY_THRESHOLD) {
            console.warn(`[imdbScraper] English fallback title similarity (${similarity}%) is below threshold (${SIMILARITY_THRESHOLD}%). Marking as not found.`);
            payload.status = 'not-found';
            payload.error = `Title similarity too low for English fallback (${similarity.toFixed(2)}%): Input '${searchedTitle}' vs IMDb Page '${imdbPageTitle}'`;
            payload.imdbUrl = movieUrl; 
            payload.imdbRating = null;
            payload.plot = null;
            payload.genres = null;
            payload.directors = null;
            payload.cast = null;
            payload.jsonLd = null; 
            payload.imdbPageTitle = imdbPageTitle; 
            
            if (page) { try { await page.close(); console.log('[imdbScraper] Page closed due to low similarity on English fallback.'); } catch (e) { console.warn('[imdbScraper] Error closing page after low similarity:', e);}}
            if (ownBrowser && browser) { try { await browser.close(); console.log('[imdbScraper] Browser closed due to low similarity on English fallback.'); } catch(e) { console.error('[imdbScraper] Error closing browser after low similarity:', e);}}
            return payload; 
          }
        } else if (sourceTitleType === 'original') {
          // 如果是原片名搜尋成功，可以選擇性地計算並記錄相似度，但不因此將其標記為失敗
          const similarity = calculateTitleSimilarity(searchedTitle, imdbPageTitle);
          console.log(`[imdbScraper] Title similarity info (Source: Original Title): Input='${searchedTitle}', IMDbPage='${imdbPageTitle}', Similarity=${similarity}%. (Validation not strictly enforced for original title matches)`);
          // 若有需要，未來可在此處加入針對原片名匹配的較寬鬆驗證或特定邏輯
        } else {
          // sourceTitleType 為 null (表示搜尋完全失敗，movieUrl 也為 null，理論上不會執行到這裡，因為外層有 if(movieUrl) )
          // 或者 searchedTitle 為空，但 imdbPageTitle 存在的情況 (較罕見)
          console.log(`[imdbScraper] Skipping similarity check: sourceTitleType is '${sourceTitleType}' or searchedTitle is missing, but imdbPageTitle was found ('${imdbPageTitle}').`);
        }
      } else {
        if (!searchedTitle) console.warn('[imdbScraper] Cannot perform similarity check: searchedTitle is missing.');
        if (!imdbPageTitle) console.warn('[imdbScraper] Cannot perform similarity check: imdbPageTitle is missing (from JSON-LD and fallback scraping).');
      }
      // --- 相似度驗證結束 ---

      // 4. 判斷狀態並設置 payload (如果未因相似度不足而提前返回)
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