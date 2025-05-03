const { chromium } = require('playwright');

(async () => {
  // 啟動瀏覽器，headless: false 表示要顯示瀏覽器視窗
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  const targetUrl = 'https://www.skcinemas.com/sessions?c=1004';
  console.log(`Navigating to ${targetUrl}...`);

  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('Page loaded. URL:', page.url());
    console.log('Page title:', await page.title());

    // --- 監聽並打印網路請求 (用於觀察點擊後的跳轉) ---
    page.on('request', request => {
      // 只顯示主要的導航請求或特定 API 請求（可選）
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
         console.log('>> NAV REQUEST:', request.method(), request.url());
      }
      // 可以添加其他過濾條件，例如只看包含 'Booking' 或 'SeatSelection' 的 URL
      // if (request.url().includes('Booking')) {
      //    console.log('>> BOOKING RELATED:', request.method(), request.url());
      // }
    });

    // --- 監聽並打印瀏覽器 console 訊息 (用於觀察前端 JS 行為) ---
    // page.on('console', msg => console.log(`PAGE LOG [${msg.type()}]: ${msg.text()}`));

    console.log('\nBrowser is open. You can now manually interact with the page and use DevTools.');
    console.log('Press Ctrl+C in the terminal to close the browser and exit the script.\n');
    
    // 使用 page.pause() 會在瀏覽器中打開 Playwright Inspector，提供更強大的調試功能
    // await page.pause(); 

    // 或者，讓腳本一直運行，直到手動關閉終端 (Ctrl+C)
    await new Promise(() => {}); 

  } catch (error) {
    console.error('Error during navigation or interaction:', error);
  } finally {
    // 確保瀏覽器在腳本結束時關閉 (雖然上面的 Promise 不會結束，除非 Ctrl+C)
    // 如果使用 pause()，則 pause 結束後會執行這裡
    console.log('Closing browser...');
    await browser.close();
  }
})();
