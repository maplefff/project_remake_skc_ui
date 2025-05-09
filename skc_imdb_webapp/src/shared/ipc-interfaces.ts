import type { IpcMainInvokeEvent } from 'electron';
import type { FetchImdbStatus } from '../main/scraper/imdbScraper';

// --- Basic Data Structures ---

/** SK Cinema 場次資訊 (格式化後) */
export interface SKCSession {
  date: string; // 格式化後: MM-DD
  weekday: string; // 格式化後: 週一, 週二, ...
  showtime: string; // 格式化後: HH:mm
  endTime: string; // 格式化後: HH:mm
  filmType: string; // 影片類型 (例如: 數位, LUXE, Dolby Cinema)
  screenName: string; // 影廳名稱 (例如: 7廳, 12廳)
  sessionId: string;
}

/** 包含 SKC 和 IMDb 資訊的完整電影資料結構 (格式化後) */
export interface CombinedMovieData {
  // --- SKC Data ---
  filmNameID: string | number;
  movieName: string; // 中文片名
  englishTitle: string; // 英文片名
  posterUrl: string | null; // 海報圖檔名或完整URL
  skRating: string; // SK 電影分級 (e.g., "輔12")
  ratingDescription: string; // 分級描述
  runtimeMinutes: number; // 片長 (分鐘)
  sessions: SKCSession[]; // 場次列表

  // --- 新增: 本地快取的海報路徑 ---
  posterPath: string | null;

  // --- IMDb Data (optional) ---
  imdbRating: string | null;
  imdbUrl: string | null; // IMDb 頁面連結
  plot: string | null; // 劇情簡介
  genres: string[] | null; // 類型 (e.g., ["Action", "Sci-Fi"])
  directors: string[] | null; // 導演列表
  cast: string[] | null; // 主要演員列表

  // --- MODIFIED: Rename dataStatus to imdbStatus ---
  imdbStatus: 'live' | 'cache' | 'failed' | 'cache-no-rating' | 'live-no-rating' | 'cache-failed' | 'live-failed';
}

// --- IPC Channel Definitions ---

export const IpcChannels = {
  GET_INITIAL_DATA: 'get-initial-data',
  BUTTON_CLICKED: 'button-clicked',
  GET_SKC_RAW_DATA: 'get-skc-raw-data',
  GET_IMDB_RAW_DATA: 'get-imdb-raw-data',
  GET_COMBINED_MOVIE_DATA: 'get-combined-movie-data',
  OPEN_EXTERNAL_URL: 'open-external-url'
} as const;

type ChannelKey = keyof typeof IpcChannels;
export type ChannelName = typeof IpcChannels[ChannelKey];

// --- IPC Payload and Handler Types ---

// 1. GET_INITIAL_DATA
export interface GetInitialDataPayload {
  message: string;
  timestamp: number;
}
export type GetInitialDataHandler = (event: IpcMainInvokeEvent) => Promise<GetInitialDataPayload>;
export type GetInitialDataRenderer = () => Promise<GetInitialDataPayload>;

// 2. BUTTON_CLICKED
export interface ButtonClickedPayload {
  response: string;
}
export type ButtonClickedHandler = (event: IpcMainInvokeEvent, message: string) => Promise<ButtonClickedPayload>;
export type ButtonClickedRenderer = (message: string) => Promise<ButtonClickedPayload>;

// 3. GET_SKC_RAW_DATA (新增)
export interface SkcRawDataPayload {
  homePageData: any | null; // 原始 GetHomePageListForApps JSON
  sessionData: any | null; // 原始 GetSessionByCinemasIDForApp JSON
}
export type GetSkcRawDataHandler = (event: IpcMainInvokeEvent) => Promise<SkcRawDataPayload>;
export type GetSkcRawDataRenderer = () => Promise<SkcRawDataPayload>;

// 4. GET_IMDB_RAW_DATA (新增)
// 輸入參數：需要電影標識符
export interface GetImdbRawDataInput {
  movieName: string;
  englishTitle?: string;
  filmNameID?: string | number;
}

// 返回值：原始或半處理的 IMDb 資料
export interface ImdbRawDataPayload {
  status?: FetchImdbStatus;
  imdbUrl?: string | null;
  imdbRating?: string | null;
  plot?: string | null;
  genres?: string[] | null;
  directors?: string[] | null;
  cast?: string[] | null;
  jsonLd?: any | null; // 儲存原始 JSON-LD
  imdbPageTitle?: string | null; // 新增：從 IMDb 頁面抓取的標題，用於驗證
  error?: string | null;
  // 可在此添加其他從 IMDb 直接獲取的原始欄位
}
export type GetImdbRawDataHandler = (event: IpcMainInvokeEvent, input: GetImdbRawDataInput) => Promise<ImdbRawDataPayload>;
export type GetImdbRawDataRenderer = (input: GetImdbRawDataInput) => Promise<ImdbRawDataPayload>;

// 5. GET_COMBINED_MOVIE_DATA (修改)
export type GetCombinedMovieDataPayload = CombinedMovieData[];
export type GetCombinedMovieDataHandler = (event: IpcMainInvokeEvent) => Promise<GetCombinedMovieDataPayload>;
export type GetCombinedMovieDataRenderer = () => Promise<GetCombinedMovieDataPayload>;

// 6. OPEN_EXTERNAL_URL
export type OpenExternalUrlHandler = (event: IpcMainInvokeEvent, url: string) => Promise<void>;
export type OpenExternalUrlRenderer = (url: string) => Promise<void>;

// --- Context Bridge API Structure ---

// 新增: 定義進度更新的負載結構
export type LoadingProgressType = 
  | 'initializing'        // P0
  | 'fetching-skc'        // P1
  | 'processing-skc'      // P2
  | 'skc-complete'        // P4
  | 'starting-imdb'       // P3
  | 'imdb-progress-success' // P6.1
  | 'imdb-progress-no-rating' // P6.2
  | 'imdb-progress-failed'  // P6.3
  | 'merging-data'        // P7
  | 'sorting-data'        // P8
  | 'processing-complete' // P9
  | 'error';              // PZ

export interface LoadingProgressPayload {
  type: LoadingProgressType;
  message: string; // 核心訊息文字
  x?: number;      // 目前進度 (for IMDb)
  n?: number;      // 總數 (for IMDb)
  movieName?: string; // 當前處理的電影名稱 (for IMDb)
  totalMoviesWithSessions?: number; // SKC 完成時的 N 值
}

// 定義通過 contextBridge 暴露給渲染行程的 API 結構
export interface IpcApi {
  getInitialData: GetInitialDataRenderer;
  sendButtonClickMessage: ButtonClickedRenderer;
  getSkcRawData: GetSkcRawDataRenderer;
  getImdbRawData: GetImdbRawDataRenderer;
  getCombinedMovieData: GetCombinedMovieDataRenderer;
  onUpdateLoadingProgress: (callback: (payload: LoadingProgressPayload) => void) => void;
  openExternalUrl: OpenExternalUrlRenderer;
} 