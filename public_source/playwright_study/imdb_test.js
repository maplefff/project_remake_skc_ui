const { chromium } = require('playwright');

async function testImdbSearchSelectorsHeadless() {
  console.log('Launching browser (headless mode)...');
  // 運行在無頭模式
  const browser = await chromium.launch({ headless: true }); 
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.88 Safari/537.36',
    locale: 'en-US'
  });
  const page = await context.newPage();

  const searchQuery = 'hello ghost';
  const searchUrl = `https://www.imdb.com/find/?q=${encodeURIComponent(searchQuery)}&s=tt`;
  
  // 選擇器列表
  const selectorsToTest = [
    {
      name: 'Current App Selector',
      value: 'section[data-testid="find-results-section-title"] .find-title-result a.ipc-link'
    },
    {
      name: 'Old imdbService.js Selector',
      value: 'ul[class^="ipc-metadata-list"] li a[href^="/title/tt"]' // 來自舊專案
    }
    // 可以添加更多候選選擇器
  ];

  let foundWorkingSelector = false;
  let pageHtmlContent = ''; // 用於存儲 HTML

  console.log(`Navigating to: ${searchUrl}`);
  try {
    // 等待網絡空閒可能更可靠
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 45000 });
    console.log('Page loaded (network idle). Testing selectors...');

    for (const selectorInfo of selectorsToTest) {
      console.log(`\n--- Testing Selector: ${selectorInfo.name} ---`);
      console.log(`   Selector Value: ${selectorInfo.value}`);
      try {
         // 使用 locator().first() 查找第一個匹配項
        const locator = page.locator(selectorInfo.value).first();
        // 短暫等待元素可見，增加穩定性
        await locator.waitFor({ state: 'visible', timeout: 5000 }); 
        const firstLinkHref = await locator.getAttribute('href');

        if (firstLinkHref) {
          const fullUrl = `https://www.imdb.com${firstLinkHref.split('?')[0]}`;
          console.log(`✅ SUCCESS: Found the link!`);
          console.log(`   URL: ${fullUrl}`);
          foundWorkingSelector = true;
          // 找到一個可用的就可以停止測試
          break; 
        } else {
          console.log(`⚠️ WARNING: Selector located, but failed to get href attribute.`);
        }
      } catch (error) {
        console.log(`❌ FAILURE: Could not find element or timed out.`);
        // console.log(`   Error: ${error.message.split('\n')[0]}`);
      }
    }

    // 如果所有選擇器都失敗，獲取 HTML
    if (!foundWorkingSelector) {
        console.log('\nAll tested selectors failed. Fetching page HTML content...');
        pageHtmlContent = await page.content();
        console.log('Page HTML content fetched (will be printed if needed).')
    }

  } catch (error) {
    console.error(`\n❌ ERROR: An error occurred during navigation or testing.`);
    console.error(`   Error: ${error.message.split('\n')[0]}`);
    try {
       pageHtmlContent = await page.content(); // 嘗試獲取 HTML 以供調試
    } catch { /* ignore */} 
  } finally {
    console.log('\nClosing browser...');
    await browser.close();
  }

  // 如果需要，打印 HTML (可能會很長)
  if (!foundWorkingSelector && pageHtmlContent) {
      console.log('\n--- Start of Page HTML Content ---');
      // 打印前 5000 個字符作為預覽
      console.log(pageHtmlContent.substring(0, 5000) + '...'); 
      console.log('--- End of Page HTML Content Preview ---');
      console.log('(Full HTML was fetched but only a preview is shown here)')
  } else if (!foundWorkingSelector) {
      console.log('\nNo working selector found and failed to fetch HTML.')
  }
}

// 執行測試函數
testImdbSearchSelectorsHeadless(); 