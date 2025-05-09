import { app, shell, BrowserWindow, ipcMain, protocol, net } from 'electron'
import { join } from 'node:path'
import path from 'node:path'; // 導入 path 模組
import fs from 'node:fs'; // 導入 fs 模組
import Store from 'electron-store'; // Import the type explicitly - Removed unused StoreSchema
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { chromium, type Browser, type BrowserContext } from 'playwright'
import {
  IpcChannels,
  type GetInitialDataHandler,
  type ButtonClickedHandler,
  type GetSkcRawDataHandler,
  type GetImdbRawDataHandler,
  type GetCombinedMovieDataHandler,
  type CombinedMovieData,
  type LoadingProgressPayload,
  type LoadingProgressType,
  type ImdbRawDataPayload,
  type SkcRawDataPayload,
  type OpenExternalUrlHandler
} from '../shared/ipc-interfaces'
import { fetchRawSkcData, processSkcData } from './scraper/skcScraper'
import { fetchRawImdbData, processImdbData } from './scraper/imdbScraper'
import axios from 'axios'; // 導入 axios
import { pathToFileURL } from 'node:url'; // Import pathToFileURL

// --- Register Custom Protocol (Step 1.3 Part 1) ---
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app', // Our custom protocol scheme
    privileges: {
      standard: true, // Treat as standard scheme (like http)
      secure: true, // Treat as secure
      supportFetchAPI: true, // Allow fetching via fetch()
      bypassCSP: true // Might be needed depending on CSP settings
    }
  }
]);
// --- End Register Custom Protocol ---

// --- Cache & Store Setup (Step 1.1) ---

// Define the schema
interface CacheSchema {
  posterCache: Record<string, { timestamp: number; filePath: string }>;
  imdbCache: Record<string, { timestamp: number; data: ImdbRawDataPayload }>; 
  // --- 修改: SKC 快取結構，使用時間戳 --- 
  skcRawDataCache: { fetchTimestamp: number; data: SkcRawDataPayload };
}

const schema = {
	posterCache: {
		type: 'object',
		additionalProperties: {
			type: 'object',
			properties: {
				timestamp: { type: 'number' },
				filePath: { type: 'string' } 
			}
		}
	},
  // --- 新增: IMDb 快取 Schema ---
  imdbCache: {
      type: 'object',
      additionalProperties: {
          type: 'object',
          properties: {
              timestamp: { type: 'number' },
              // data 欄位可以是任何 object，因為 ImdbRawDataPayload 結構可能變化
              data: { type: 'object' } 
          }
      }
  },
  // --- 修改: SKC 快取 Schema，使用時間戳 ---
  skcRawDataCache: {
      type: 'object',
      properties: {
          fetchTimestamp: { type: 'number' }, // 儲存抓取時的 Date.now() 值
          // data 欄位是 SkcRawDataPayload 結構
          data: {
              type: 'object',
              properties: {
                  homePageData: { type: 'object' },
                  sessionData: { type: 'object' }
              }
          }
      }
  }
};

// Initialize electron-store using default import and explicit type
// --- 修改: 加入 ImdbRawDataPayload 到 CacheSchema 泛型 --- (雖然 Store 本身不嚴格檢查，但為了類型安全)
const store: Store<CacheSchema> = new Store<CacheSchema>({ schema }); // Use the imported Store type
// @ts-expect-error Property 'path' might not exist on type definition but exists at runtime.
console.log('[Cache Store] Initialized electron-store at:', store.path);

// Create image cache directory path
const imageCachePath = path.join(app.getPath('userData'), 'imageCache');

// Ensure the image cache directory exists
try {
  if (!fs.existsSync(imageCachePath)) {
    fs.mkdirSync(imageCachePath, { recursive: true });
    console.log('[Cache Store] Created image cache directory at:', imageCachePath);
  } else {
    console.log('[Cache Store] Image cache directory already exists at:', imageCachePath);
  }
} catch (error) {
  console.error('[Cache Store] Failed to create image cache directory:', error);
  // Handle the error appropriately, maybe show a dialog or log severely
}

// --- End Cache & Store Setup ---

// --- Helper Function for Poster Cache (Step 1.2) ---
async function handlePosterCache(movie: CombinedMovieData): Promise<string | null> {
  const { filmNameID, posterUrl } = movie;
  if (!filmNameID || !posterUrl) {
    return null; // Cannot process without ID and URL
  }

  const cacheKey = `posterCache.${filmNameID}`;
  const cacheExpiry = 168 * 60 * 60 * 1000; // 168 hours (7 days)
  // @ts-expect-error Property 'get' might not exist on type definition but exists at runtime.
  const cachedData = store.get(cacheKey) as { timestamp: number; filePath: string } | undefined;

  // Check cache validity
  if (cachedData && (Date.now() - cachedData.timestamp < cacheExpiry)) {
    // Check if cached file still exists
    if (fs.existsSync(cachedData.filePath)) {
      console.log(`[Poster Cache] HIT for ${filmNameID}. Using file: ${cachedData.filePath}`);
      // Return custom protocol URL
      return `app://imageCache/${path.basename(cachedData.filePath)}`;
    } else {
      console.warn(`[Poster Cache] File missing for ${filmNameID}, path: ${cachedData.filePath}. Will re-download.`);
      // @ts-expect-error Property 'delete' might not exist on type definition but exists at runtime.
      store.delete(cacheKey); // Delete invalid cache entry
    }
  }

  // Cache miss, expired, or file missing - attempt download
  console.log(`[Poster Cache] MISS for ${filmNameID}. Downloading from ${posterUrl}`);
  try {
    const response = await axios.get(posterUrl, { 
        responseType: 'arraybuffer', 
        timeout: 15000 // 15 second timeout for download
    });

    if (response.status === 200 && response.data) {
      const imageDataBuffer = Buffer.from(response.data);
      // Generate filename (ensure extension is reasonable, default to .jpg if none)
      const extension = path.extname(posterUrl) || '.jpg';
      const filename = `${filmNameID}${extension}`;
      const newFilePath = path.join(imageCachePath, filename);

      // Write file
      fs.writeFileSync(newFilePath, imageDataBuffer);
      console.log(`[Poster Cache] Downloaded and saved ${filename} for ${filmNameID}.`);

      // Update store
      // @ts-expect-error Property 'set' might not exist on type definition but exists at runtime.
      store.set(cacheKey, { timestamp: Date.now(), filePath: newFilePath });

      // Return custom protocol URL
      return `app://imageCache/${filename}`; 
    } else {
      throw new Error(`Download failed with status ${response.status}`);
    }
  } catch (error: any) {
    console.error(`[Poster Cache] FAILED download or save for ${filmNameID} from ${posterUrl}:`, error.message);
    return null; // Download or save failed
  }
}
// --- End Helper Function ---

let mainWindow: BrowserWindow | null = null;

// --- 設置 Playwright 瀏覽器路徑 (關鍵步驟) ---
if (app.isPackaged) {
  // process.resourcesPath 指向打包後應用內的 resources 文件夾
  const browserPath = path.join(process.resourcesPath, 'pw-browsers');
  process.env.PLAYWRIGHT_BROWSERS_PATH = browserPath;
  console.log('[Playwright Path] Set PLAYWRIGHT_BROWSERS_PATH to:', browserPath);
} else {
  // 開發模式下，Playwright 通常能自己找到瀏覽器
  console.log('[Playwright Path] Running in development mode, using default browser path.');
}
// --- Playwright 路徑設置結束 ---

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#141414',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    if (mainWindow) mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    // 自動開啟 DevTools
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // 設定應用程式名稱，這會影響 app.getPath('userData') 等路徑
  app.setName("SKCinema IMDb Rating");

  console.log('[App Name] Set to:', app.getName());
  console.log('[UserData Path] Now using:', app.getPath('userData'));

  console.log('[IPC Main] IPC handlers registered.');

  // IPC handle for initial data
  const handleGetInitialData: GetInitialDataHandler = async () => {
    console.log('[Main Process] Received request for initial data')
    return {
      message: 'Hello from Main Process!',
      timestamp: Date.now()
    }
  }
  ipcMain.handle(IpcChannels.GET_INITIAL_DATA, handleGetInitialData)

  // IPC handle for button click
  const handleButtonClicked: ButtonClickedHandler = async (_event, message) => {
    console.log(`[Main Process] Received button click with message: ${message}`)
    return {
      response: `Main process received: '${message}' at ${new Date().toLocaleTimeString()}`
    }
  }
  ipcMain.handle(IpcChannels.BUTTON_CLICKED, handleButtonClicked)

  // 3. Get SKC Raw Data (新)
  const handleGetSkcRawData: GetSkcRawDataHandler = async () => {
    console.log(`[IPC Main] Received request for channel: ${IpcChannels.GET_SKC_RAW_DATA}`);
    return await fetchRawSkcData();
  }
  ipcMain.handle(IpcChannels.GET_SKC_RAW_DATA, handleGetSkcRawData);

  // 4. Get IMDb Raw Data (新)
  const handleGetImdbRawData: GetImdbRawDataHandler = async (_event, input) => {
    console.log(`[IPC Main] Received request for channel: ${IpcChannels.GET_IMDB_RAW_DATA} with input:`, input);
    return await fetchRawImdbData(input);
  }
  ipcMain.handle(IpcChannels.GET_IMDB_RAW_DATA, handleGetImdbRawData);

  // 5. Get Combined Movie Data (新)
  const handleGetCombinedMovieData: GetCombinedMovieDataHandler = async () => {
    console.log(`[IPC Main] Received request for channel: ${IpcChannels.GET_COMBINED_MOVIE_DATA}`);

    const sendProgress = (payload: Omit<LoadingProgressPayload, 'message'> & { message?: string }) => {
        let finalMessage = payload.message;
        if (!finalMessage) {
            switch (payload.type) {
                case 'initializing': finalMessage = '正在初始化...'; break;
                case 'fetching-skc': finalMessage = '正在讀取新光影城資料...'; break;
                case 'processing-skc': finalMessage = '正在處理新光影城資料...'; break;
                case 'skc-complete': finalMessage = `完成讀取電影資料, 共${payload.totalMoviesWithSessions || 0}部`; break;
                case 'starting-imdb': finalMessage = `正在啟動 IMDb 查詢 (共 ${payload.n || 0} 部電影)...`; break;
                case 'imdb-progress-success': finalMessage = `IMDb查詢中 (${payload.x}/${payload.n}), "${payload.movieName}" 查詢完成`; break;
                case 'imdb-progress-no-rating': finalMessage = `IMDb查詢中 (${payload.x}/${payload.n}), "${payload.movieName}" 沒有評分`; break;
                case 'imdb-progress-failed': finalMessage = `IMDb查詢中 (${payload.x}/${payload.n}), "${payload.movieName}" 獲取IMDb頁面失敗`; break;
                case 'merging-data': finalMessage = '正在合併電影數據...'; break;
                case 'sorting-data': finalMessage = '正在排序電影列表...'; break;
                case 'processing-complete': finalMessage = '電影數據處理完成'; break;
                case 'error': finalMessage = '處理數據時發生錯誤...'; break;
                default: finalMessage = '未知進度...';
            }
        }
        
        const finalPayload: LoadingProgressPayload = {
            ...payload,
            message: finalMessage
        };

        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-loading-progress', finalPayload);
            console.log(`[Progress Update] Sent: ${finalPayload.type} - ${finalPayload.message}`);
        } else {
            console.warn(`[Progress Update] Skipping send (${finalPayload.type}), mainWindow is not available.`);
        }
    }

    let allCombinedMovies: CombinedMovieData[] = [];
    let moviesToQueryImdb: CombinedMovieData[] = [];
    let imdbBrowser: Browser | null = null;
    let imdbContext: BrowserContext | null = null;
    let N = 0; // 電影總數 (有場次)

    // --- 新增: 用於儲存快取命中的 IMDb 資料 ---
    const cachedImdbResults = new Map<string | number, ImdbRawDataPayload>();

    try {
      // P0: 初始化
      sendProgress({ type: 'initializing' });

      // <<< REMOVED: Force clear SKC cache for debugging >>>
      // console.log('[DEBUG] Clearing skcRawDataCache before reading...');
      // store.delete('skcRawDataCache'); 
      // console.log('[DEBUG] skcRawDataCache cleared.');
      // <<< END DEBUG CODE >>>

      // --- SKC Data (移除快取邏輯，強制從網路獲取) --- 
      sendProgress({ type: 'fetching-skc' }); // 直接顯示抓取訊息
      let skcRawData: SkcRawDataPayload | null = null;
      const skcDataSource: 'live' = 'live'; // 來源固定為 live
      
      // --- 移除快取檢查邏輯 ---
      /*
      const skcCacheKey = 'skcRawDataCache';
      const cachedSkc = store.get(skcCacheKey) as { fetchTimestamp: number; data: SkcRawDataPayload } | undefined;
      
      if (cachedSkc) {
          const fetchTimestamp = cachedSkc.fetchTimestamp;
          const fetchDate = new Date(fetchTimestamp);
          
          // 計算隔天凌晨的到期時間戳
          const expiryDate = new Date(fetchDate);
          expiryDate.setDate(fetchDate.getDate() + 1);
          expiryDate.setHours(0, 0, 0, 0);
          const expiryTimestamp = expiryDate.getTime();

          const currentTimestamp = Date.now();

          if (currentTimestamp < expiryTimestamp) {
            // 快取有效
            console.log(`[SKC Cache] HIT (Fetched: ${fetchDate.toLocaleString()}, Valid until: ${expiryDate.toLocaleString()})`);
            skcRawData = cachedSkc.data;
            skcDataSource = 'cache';
          } else {
            // 快取過期
            console.log(`[SKC Cache] EXPIRED (Fetched: ${fetchDate.toLocaleString()}, Expired at: ${expiryDate.toLocaleString()})`);
            skcDataSource = 'live'; // 標記為需要 live data
          }
      } else {
        // 快取未命中
        console.log(`[SKC Cache] MISS`);
        skcDataSource = 'live'; // 標記為需要 live data
      }
      */

      // --- 強制從網路獲取 --- 
      console.log('[Main Process] Step 1: Fetching SKC data from network (Cache disabled)...');
      skcRawData = await fetchRawSkcData();
        
      // --- 移除寫入快取邏輯 --- 
      /*
      if (skcRawData && skcRawData.homePageData && skcRawData.sessionData) { // 確保成功獲取
          const newFetchTimestamp = Date.now();
          store.set(skcCacheKey, { fetchTimestamp: newFetchTimestamp, data: skcRawData });
          console.log(`[SKC Cache] Stored live result (Timestamp: ${newFetchTimestamp})`);
      } else {
           // 維持 skcRawData 為 null 或包含錯誤，後續會拋出錯誤
      }
      */
      
      // 檢查 SKC 資料是否有效 (現在只來自網路)
      if (!skcRawData || !skcRawData.homePageData || !skcRawData.sessionData) {
         throw new Error(`無法獲取新光影城原始資料 (來源: ${skcDataSource})。`);
      }

      // P2: Process SKC
      sendProgress({ type: 'processing-skc' });
      console.log(`[Main Process] Step 2: Processing SKC data (Source: ${skcDataSource})...`);
      allCombinedMovies = processSkcData(skcRawData);
      console.log(`[Main Process] Step 2 Complete: Processed ${allCombinedMovies.length} movies initially from SKC.`);

      // P4: Calculate N and filter movies with sessions
      moviesToQueryImdb = allCombinedMovies.filter(movie => movie.sessions && movie.sessions.length > 0);
      N = moviesToQueryImdb.length;
      console.log(`[Main Process] Step 3: Found ${N} movies with sessions to query IMDb.`);
      sendProgress({ type: 'skc-complete', totalMoviesWithSessions: N });

      if (N === 0) {
         console.warn('[Main Process] No movies with sessions found after SKC processing. Skipping IMDb fetch.');
         // --- 修改: 即使沒有電影，也要處理 poster cache 和 dataStatus --- 
         allCombinedMovies = allCombinedMovies.map(movie => ({ ...movie, imdbStatus: 'failed' as const })); // 將 dataStatus 設為 failed
         // ... (後續的海報快取邏輯仍然需要執行) ...
      } else { // --- 只有 N > 0 時才執行 IMDb 邏輯 --- 
        // --- IMDb Data Fetch (混合快取和網路) ---
        // P3: Starting IMDb (現在需要區分實際要查詢的數量)
        console.log(`[Main Process] Step 4: Checking cache and preparing for IMDb fetch for ${N} movies...`);
        const imdbCacheExpiry = 24 * 60 * 60 * 1000; // 24 小時
        const moviesToFetchFromNetwork: CombinedMovieData[] = [];

        for (const movie of moviesToQueryImdb) {
          const cacheKey = `imdbCache.${movie.filmNameID}`;
          // @ts-expect-error Runtime check for store properties
          const cachedImdb = store.get(cacheKey) as { timestamp: number; data: ImdbRawDataPayload } | undefined;

          if (cachedImdb && (Date.now() - cachedImdb.timestamp < imdbCacheExpiry)) {
            console.log(`[IMDb Cache] HIT for ${movie.filmNameID}`);
            cachedImdbResults.set(movie.filmNameID, cachedImdb.data);
          } else {
            if (cachedImdb) {
              console.log(`[IMDb Cache] EXPIRED for ${movie.filmNameID}`);
            } else {
              console.log(`[IMDb Cache] MISS for ${movie.filmNameID}`);
            }
            moviesToFetchFromNetwork.push(movie);
          }
        }

        const networkFetchCount = moviesToFetchFromNetwork.length;
        console.log(`[Main Process] IMDb Cache Check Complete: ${N - networkFetchCount} hits, ${networkFetchCount} misses/expired.`);

        // --- 計算快取命中數 ---
        const cacheHits = N - networkFetchCount;

        // --- 只有當需要從網路獲取時才啟動瀏覽器和進度條 --- 
        let networkImdbResults: PromiseSettledResult<{ filmNameID: string | number; imdbData: ImdbRawDataPayload; }>[] = [];
        if (networkFetchCount > 0) {
          // --- 修改: N 使用總數 N，而不是 networkFetchCount ---
          // --- 修改: 更新 message 以反映總數和實際查詢數 ---
          sendProgress({ 
            type: 'starting-imdb', 
            n: N, // 使用總數 N
            message: `正在啟動 IMDb 查詢 (快取命中 ${cacheHits} 部, 網路查詢 ${networkFetchCount} 部)...` 
          }); 
          console.log(`[Main Process] Launching shared browser for parallel IMDb fetch for ${networkFetchCount} movies...`);
          imdbBrowser = await chromium.launch({ headless: true });
          imdbContext = await imdbBrowser.newContext({
              userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.88 Safari/537.36',
              locale: 'en-US'
          });
          console.log('[Main Process] Shared browser context created. Starting parallel fetches...');

          let imdbFetchedCount = 0;

          const imdbFetchPromises = moviesToFetchFromNetwork.map((movie) =>
            fetchRawImdbData({
                movieName: movie.movieName,
                englishTitle: movie.englishTitle,
                filmNameID: movie.filmNameID
            })
            .then((imdbResult: ImdbRawDataPayload) => {
               imdbFetchedCount++;
               const movieName = movie.englishTitle || movie.movieName;
               let progressType: LoadingProgressType;

               switch (imdbResult.status) {
                   case 'success':
                       progressType = 'imdb-progress-success';
                       // --- 新增: 寫入快取 --- 
                       const cacheKey = `imdbCache.${movie.filmNameID}`;
                       // @ts-expect-error Runtime check for store properties
                       store.set(cacheKey, { timestamp: Date.now(), data: imdbResult });
                       console.log(`[IMDb Cache] Stored live result for ${movie.filmNameID}`);
                       break;
                   case 'no-rating':
                       progressType = 'imdb-progress-no-rating';
                       // --- 新增: 寫入快取 (即使沒評分也要快取) --- 
                       const noRatingCacheKey = `imdbCache.${movie.filmNameID}`;
                       // @ts-expect-error Runtime check for store properties
                       store.set(noRatingCacheKey, { timestamp: Date.now(), data: imdbResult });
                       console.log(`[IMDb Cache] Stored no-rating result for ${movie.filmNameID}`);
                       break;
                   case 'not-found':
                   case 'fetch-failed':
                   default:
                       progressType = 'imdb-progress-failed';
                       // --- 失敗時不寫入快取 ---
                       break;
               }

               sendProgress({ 
                   type: progressType, 
                   // --- 修改: x = cacheHits + imdbFetchedCount, n = N ---
                   x: cacheHits + imdbFetchedCount, 
                   n: N, // 使用總數 N
                   movieName: movieName 
               });

               return { filmNameID: movie.filmNameID, imdbData: imdbResult };
            })
            .catch(imdbError => {
                imdbFetchedCount++; 
                const movieName = movie.englishTitle || movie.movieName;
                console.error(`[Main Process] UNEXPECTED Error fetching IMDb in parallel for ${movieName}:`, imdbError);
                sendProgress({ 
                    type: 'imdb-progress-failed', 
                    // --- 修改: x = cacheHits + imdbFetchedCount, n = N ---
                    x: cacheHits + imdbFetchedCount, 
                    n: N, // 使用總數 N
                    movieName: movieName, 
                    message: `IMDb查詢中 (${cacheHits + imdbFetchedCount}/${N}), "${movieName}" 查詢時發生意外錯誤`
                });
                // --- 失敗時不寫入快取 ---
                return { 
                    filmNameID: movie.filmNameID, 
                    imdbData: { status: 'fetch-failed', error: imdbError.message || 'Unknown parallel fetch error' } as ImdbRawDataPayload
                };
            })
          );

          networkImdbResults = await Promise.allSettled(imdbFetchPromises);
          console.log(`[Main Process] Parallel IMDb fetching complete. Processed ${networkImdbResults.length} network results.`);

          if (imdbContext) await imdbContext.close();
          if (imdbBrowser) await imdbBrowser.close();
          console.log('[Main Process] Shared browser closed.');
        } // --- 結束 if (networkFetchCount > 0) ---

        // --- Merge IMDb Data (處理快取和網路結果) --- 
        // P7: Merging
        sendProgress({ type: 'merging-data' });
        console.log('[Main Process] Step 7: Merging IMDb data (Cache & Network)...');
        
        allCombinedMovies = allCombinedMovies.map(movie => {
          let imdbDataToMerge: ImdbRawDataPayload | undefined = undefined;
          let dataStatus: 'live' | 'cache' | 'failed' = 'failed'; // 預設為 failed

          // 優先檢查快取結果
          if (cachedImdbResults.has(movie.filmNameID)) {
              imdbDataToMerge = cachedImdbResults.get(movie.filmNameID);
              dataStatus = 'cache';
          } else {
              // 如果不在快取中，則查找網路請求結果
              const networkResult = networkImdbResults.find(r => 
                  r.status === 'fulfilled' && String(r.value.filmNameID) === String(movie.filmNameID)
              );
              if (networkResult && networkResult.status === 'fulfilled') {
                  imdbDataToMerge = networkResult.value.imdbData;
                  // 根據網路請求的 status 決定 dataStatus
                  if (imdbDataToMerge.status === 'success' || imdbDataToMerge.status === 'no-rating') {
                      dataStatus = 'live';
                  } else {
                      dataStatus = 'failed'; // fetch-failed, not-found, or other errors
                  }
              } else {
                  // 如果網路請求也失敗或未找到 (rejected promise or not in the list)
                  console.warn(`[Main Process] No IMDb data found (cache or network) for movie ${movie.filmNameID}. Marking as failed.`);
                  dataStatus = 'failed';
              }
          }

          // --- 開始合併邏輯 --- 
          let mergedMovieData: CombinedMovieData = { 
              ...movie, // 保留 SKC 資料
              imdbStatus: dataStatus, // 設定 imdbStatus
              // 初始化 IMDb 欄位為 null
              imdbRating: null,
              imdbUrl: null,
              plot: null,
              genres: null,
              directors: null,
              cast: null,
              // posterPath 已在 SKC 處理時初始化為 null，稍後會被 poster cache 覆蓋
          };

          if (imdbDataToMerge) {
              const processedImdb = processImdbData(imdbDataToMerge); // 處理原始或快取的 IMDb 資料
              switch (imdbDataToMerge.status) {
                  case 'success':
                      mergedMovieData.imdbRating = processedImdb.imdbRating ?? '-1'; // 成功但無評分視為 -1
                      mergedMovieData.imdbUrl = processedImdb.imdbUrl ?? null;
                      mergedMovieData.plot = processedImdb.plot ?? null;
                      mergedMovieData.genres = processedImdb.genres ?? null;
                      mergedMovieData.directors = processedImdb.directors ?? null;
                      mergedMovieData.cast = processedImdb.cast ?? null;
                      if (mergedMovieData.imdbRating === '-1') {
                          console.log(`[Debug Log - ${dataStatus}] Movie set to No Rating (-1):`, movie.filmNameID);
                      }
                      break;
                  case 'no-rating':
                      mergedMovieData.imdbRating = '-1';
                      mergedMovieData.imdbUrl = processedImdb.imdbUrl ?? null;
                      mergedMovieData.plot = processedImdb.plot ?? null;
                      mergedMovieData.genres = processedImdb.genres ?? null;
                      mergedMovieData.directors = processedImdb.directors ?? null;
                      mergedMovieData.cast = processedImdb.cast ?? null;
                      console.warn(`[Main Process - ${dataStatus}] IMDb data merged for ${movie.englishTitle || movie.movieName} but has no rating (status: ${imdbDataToMerge.status})`);
                      console.log(`[Debug Log - ${dataStatus}] Movie set to No Rating (-1):`, movie.filmNameID);
                      break;
                  case 'not-found':
                  case 'fetch-failed':
                  default: // 將未知狀態也視為失敗
                      console.warn(`[Main Process - ${dataStatus}] IMDb data fetch failed or movie not found for ${movie.englishTitle || movie.movieName}. Status: ${imdbDataToMerge.status}, Error: ${imdbDataToMerge.error}`);
                      mergedMovieData.imdbRating = '-2';
                      mergedMovieData.imdbUrl = null;
                      mergedMovieData.plot = null;
                      mergedMovieData.genres = null;
                      mergedMovieData.directors = null;
                      mergedMovieData.cast = null;
                      console.log(`[Debug Log - ${dataStatus}] Movie set to Failed/Not Found (-2):`, movie.filmNameID);
                      break;
              }
          } else {
              // 如果連 imdbDataToMerge 都沒有 (理論上不應發生，除非 N=0 的處理有誤)
              console.error(`[Main Process] CRITICAL: imdbDataToMerge is undefined for movie ${movie.filmNameID}. Setting status to failed.`);
              mergedMovieData.imdbStatus = 'failed';
              mergedMovieData.imdbRating = '-2'; // 標記為失敗
          }
          
          return mergedMovieData;
        });

        console.log('[Main Process] Step 5 Complete: IMDb data merged.');
      } // --- 結束 else (N > 0 時才執行 IMDb 邏輯) ---

      // --- Sort Movies (by IMDb rating, using the full list) --- 
      // P8: Sorting
      sendProgress({ type: 'sorting-data' });
      console.log('[Main Process] Step 6: Sorting movies by IMDb rating (Custom Logic)...');
      // 修改: 實現新的三層排序邏輯 (配合新的內部值)
      allCombinedMovies.sort((a, b) => {
          const parseRating = (ratingStr: string | null): number => {
              // 修改: 失敗 (-2) 排最下面
              if (ratingStr === '-2') return -Infinity;
              // 修改: 未評分 (-1) 排在失敗之上
              if (ratingStr === '-1') return -1;
              if (ratingStr === null) return -Infinity; // null 也視為失敗
              const num = parseFloat(ratingStr);
              return isNaN(num) ? -Infinity : num; // 無法解析的數字視為失敗
          };

          const ratingA = parseRating(a.imdbRating);
          const ratingB = parseRating(b.imdbRating);

          // 主要按評分值（包括特殊標記的數值表示）降序排列
          if (ratingB !== ratingA) {
              return ratingB - ratingA;
          }
          
          // 如果評分相同（例如都是未評分或都是失敗），可以添加次要排序規則，例如按片名
          // return a.movieName.localeCompare(b.movieName); // (可選)
          return 0; // 保持原始相對順序（如果評分相同）
      });
      console.log('[Main Process] Step 6 Complete: Sorting finished.');

      // P9: Processing Complete (Before this step)
      // --- Add Poster Caching Logic (Step 1.2 Integration) ---
      console.log('[Main Process] Step 7: Handling poster caching...');
      const posterPromises = allCombinedMovies.map(movie => 
          handlePosterCache(movie)
            .then(posterPath => ({ filmNameID: movie.filmNameID, posterPath }))
            .catch(error => {
              console.error(`[Poster Cache] Error in handlePosterCache for ${movie.filmNameID}:`, error);
              return { filmNameID: movie.filmNameID, posterPath: null }; // Ensure it returns null on error
            })
      );
      
      const posterResults = await Promise.allSettled(posterPromises);
      
      allCombinedMovies = allCombinedMovies.map(movie => {
        const result = posterResults.find(r => 
            r.status === 'fulfilled' && r.value.filmNameID === movie.filmNameID
        );
        let finalPosterPath: string | null = null;
        if (result && result.status === 'fulfilled') {
          finalPosterPath = result.value.posterPath;
        } else {
            // Find potential error if promise was rejected for this movie
            const rejectedResult = posterResults.find(r => r.status === 'rejected') as PromiseRejectedResult | undefined;
            // Check if the reason might relate to this movie (best effort)
            if (rejectedResult && rejectedResult.reason) { 
                // Log the reason, but we can't be certain it's for *this* specific movie 
                // unless the error object itself contains the filmNameID.
                // For simplicity, we just log the first rejection reason found.
                // console.error(`[Poster Cache] A poster promise was rejected:`, rejectedResult.reason);
            }
            // Keep posterPath null if fulfilled value wasn't found or promise rejected
        }
        // Add posterPath to the movie object
        return { ...movie, posterPath: finalPosterPath }; 
      });
      console.log('[Main Process] Step 7 Complete: Poster caching handled.');
      // --- End Poster Caching Logic ---

      // P9: Processing Complete
      sendProgress({ type: 'processing-complete' });

      // Log the first movie object before returning
      if (allCombinedMovies && allCombinedMovies.length > 0) {
        console.log('[Main Process] Data for the first movie being sent:', JSON.stringify(allCombinedMovies[0], null, 2));
      } else {
        console.log('[Main Process] No movie data to send.');
      }

      // <<< ADDED LOGGING >>>
      // console.log('---------- [DEBUG] Final Combined Data to Frontend Start ----------');
      // console.log(JSON.stringify(allCombinedMovies, null, 2));
      // console.log('---------- [DEBUG] Final Combined Data to Frontend End ----------');
      // <<< END LOGGING >>>

      return allCombinedMovies;

    } catch (error: any) {
      console.error('[Main Process] Error in handleGetCombinedMovieData:', error);
      sendProgress({ type: 'error', message: `處理數據時發生錯誤: ${error.message}` });
      if (imdbContext) await imdbContext.close().catch(e => console.error('Error closing context on error:', e));
      if (imdbBrowser) await imdbBrowser.close().catch(e => console.error('Error closing browser on error:', e));
      throw error;
    } finally {
       // --- MODIFIED: Try different structure for closing --- 
       const contextToClose = imdbContext; // Assign to local variable
       const browserToClose = imdbBrowser; // Assign to local variable

       if (contextToClose) {
           // --- REMOVED: Unused @ts-expect-error --- 
           await contextToClose.close().catch(e => console.error('Error closing IMDb context in finally:', e));
       }
       if (browserToClose) { 
         await browserToClose.close().catch(e => console.error('Error closing IMDb browser in finally:', e));
       }
    }
  }
  ipcMain.handle(IpcChannels.GET_COMBINED_MOVIE_DATA, handleGetCombinedMovieData);

  // --- 新增: 處理開啟外部連結的請求 ---
  const handleOpenExternalUrl: OpenExternalUrlHandler = async (_event, url) => {
    console.log(`[IPC Main] Received request to open external URL: ${url}`);

    // 更新安全性檢查：允許 SKCinema 訂票頁和 IMDb 電影頁
    const isSkcBookingUrl = url?.startsWith('https://www.skcinemas.com/booking/seats?');
    const isImdbTitleUrl = url?.startsWith('https://www.imdb.com/title/'); // 檢查 IMDb 電影頁

    if (url && typeof url === 'string' && (isSkcBookingUrl || isImdbTitleUrl)) { // 使用 || (或) 邏輯
      try {
        await shell.openExternal(url);
        console.log(`[IPC Main] Successfully opened external URL: ${url}`);
      } catch (error) {
        console.error(`[IPC Main] Failed to open external URL ${url}:`, error);
        throw new Error(`無法開啟外部連結: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      console.warn(`[IPC Main] Refused to open potentially unsafe URL: ${url}`);
      throw new Error('無效或不允許的外部連結。');
    }
  };
  ipcMain.handle(IpcChannels.OPEN_EXTERNAL_URL, handleOpenExternalUrl);

  // --- Register Protocol Handler (Step 1.3 Part 2) ---
  protocol.handle('app', (request) => {
    // Expected URL format: app://imageCache/filename.jpg
    const url = request.url;
    console.log(`[Protocol Handler] Received request for: ${url}`);
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== 'app:') {
        console.error(`[Protocol Handler] Error: Invalid protocol for ${url}`);
        throw new Error('Invalid protocol');
      }
      if (parsedUrl.hostname !== 'imagecache') {
        console.error(`[Protocol Handler] Error: Invalid hostname for ${url}, expected imageCache`);
        throw new Error('Invalid hostname, expected imageCache');
      }

      // IMPORTANT: Sanitize pathname to prevent directory traversal
      const requestedFileName = path.normalize(parsedUrl.pathname).replace(/^\/|\\/, '');
      console.log(`[Protocol Handler] Sanitized requested filename: ${requestedFileName}`);
      if (requestedFileName.includes('..')) {
          console.error(`[Protocol Handler] Error: Attempted directory traversal: ${requestedFileName}`);
          return new Response('Invalid path', { status: 400 });
      }

      const filePath = path.join(imageCachePath, requestedFileName);
      console.log(`[Protocol Handler] Resolved file path: ${filePath}`);

      // Check if file exists *within* the handler
      if (!fs.existsSync(filePath)) {
          console.error(`[Protocol Handler] Error: File not found at path: ${filePath}`);
          return new Response('Not Found', { status: 404 });
      }
      
      // Log success before fetching
      console.log(`[Protocol Handler] File found. Attempting to serve via net.fetch: ${filePath}`);
      return net.fetch(pathToFileURL(filePath).toString());

    } catch (error: any) {
      console.error(`[Protocol Handler] Error handling request ${url}:`, error);
      return new Response('Internal Server Error', { status: 500 });
    }
  });
  console.log('[Protocol Handler] Registered handler for \'app\' protocol.');
  // --- End Register Protocol Handler ---

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  // --- Ensure these are INSIDE whenReady().then() ---
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  app.on('browser-window-created', (_, window) => {
    // optimizer.watchWindowShortcuts(window) // 註解掉此行以禁用自動開啟 DevTools
    optimizer.watchWindowShortcuts(window) // 恢復此行，允許 F12 等快捷鍵
  })

  // IPC test (If you still need this ping handler)
  ipcMain.on('ping', () => console.log('pong')) 
  // --- End ensure inside ---

}) // <<< Correct closing bracket for app.whenReady().then()

// --- These handlers are OUTSIDE whenReady() --- 
// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
