const { chromium } = require('playwright');

async function getMovieDataByTitleSearchAndJsonLd(movieTitle, isBenchmark = false, existingContext = null) {
  let browser; // Only used if existingContext is null
  let context; // Will be existingContext or a new one
  let page;
  let createdNewBrowser = false;

  try {
    if (existingContext) {
      context = existingContext;
    } else {
      browser = await chromium.launch();
      context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' }
      });
      createdNewBrowser = true;
    }
    page = await context.newPage();

    const searchUrl = `https://www.imdb.com/find/?q=${encodeURIComponent(movieTitle)}&s=tt`;
    if (!isBenchmark) console.log(`[Search & JSON-LD] Searching for "${movieTitle}" at: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: 'networkidle' });

    const firstMovieLinkSelector = 'section[data-testid="find-results-section-title"] ul li:first-child a[href^="/title/tt"]';
    let movieDetailUrl = null;
    try {
      await page.waitForSelector(firstMovieLinkSelector, { timeout: 10000 });
      const hrefAttribute = await page.locator(firstMovieLinkSelector).first().getAttribute('href');
      if (hrefAttribute) {
        movieDetailUrl = `https://www.imdb.com${hrefAttribute.split('?')[0]}`;
        if (!isBenchmark) console.log(`[Search & JSON-LD] Found movie detail page link: ${movieDetailUrl}`);
      }
    } catch (e) {
      if (!isBenchmark) console.error(`[Search & JSON-LD] Could not find the first movie link for "${movieTitle}". Trying general selector.`);
      const generalLinkSelector = 'ul[class^="ipc-metadata-list"] li a[href^="/title/tt"]';
      try {
        await page.waitForSelector(generalLinkSelector, { timeout: 5000 });
        const hrefAttribute = await page.locator(generalLinkSelector).first().getAttribute('href');
        if (hrefAttribute) {
          movieDetailUrl = `https://www.imdb.com${hrefAttribute.split('?')[0]}`;
          if (!isBenchmark) console.log(`[Search & JSON-LD] Found movie detail page link (general selector): ${movieDetailUrl}`);
        }
      } catch (e2) {
        if (!isBenchmark) console.error(`[Search & JSON-LD] All movie link selectors failed for "${movieTitle}".`);
        // No browser/context to close here if it was passed in
        if (page && !page.isClosed()) await page.close();
        if (createdNewBrowser && browser) await browser.close();
        return { error: `Selectors failed for "${movieTitle}"`, aggregateRating: null, fullJsonLd: null };
      }
    }
    
    if (!movieDetailUrl) {
      if (!isBenchmark) console.error(`[Search & JSON-LD] No movie detail URL found for "${movieTitle}". Aborting.`);
      if (page && !page.isClosed()) await page.close();
      if (createdNewBrowser && browser) await browser.close();
      return { error: `No detail URL for "${movieTitle}"`, aggregateRating: null, fullJsonLd: null };
    }

    if (!isBenchmark) console.log(`[Search & JSON-LD] Navigating to detail page: ${movieDetailUrl}`);
    await page.goto(movieDetailUrl, { waitUntil: 'networkidle' });

    if (!isBenchmark) console.log(`[Search & JSON-LD] Detail page loaded. Attempting to extract JSON-LD...`);
    const jsonLdScripts = await page.$$('script[type="application/ld+json"]');
    let movieJsonLd = null;

    for (const scriptElement of jsonLdScripts) {
      const jsonLdText = await scriptElement.textContent();
      if (jsonLdText) {
        try {
          const jsonData = JSON.parse(jsonLdText);
          if (jsonData['@type'] === 'Movie') {
            movieJsonLd = jsonData;
            break;
          } else if (Array.isArray(jsonData)) {
            for (const item of jsonData) {
              if (item['@type'] === 'Movie') {
                movieJsonLd = item;
                break;
              }
            }
            if (movieJsonLd) break;
          }
        } catch (e) {
          if (!isBenchmark) console.warn('[Search & JSON-LD] Error parsing a JSON-LD script:', e.message);
        }
      }
    }

    if (page && !page.isClosed()) await page.close();
    if (createdNewBrowser && browser) await browser.close();

    if (movieJsonLd && movieJsonLd.aggregateRating) {
      if (!isBenchmark) {
        console.log("\n[Search & JSON-LD] Successfully found Movie type JSON-LD data:");
        // Keep full JSON-LD printout for direct CLI use if desired, or remove for brevity
        // console.log("---------- Entire Original JSON-LD Start ----------");
        // console.log(JSON.stringify(movieJsonLd, null, 2));
        // console.log("----------- Entire Original JSON-LD End -----------");
        console.log("\n---------- AggregateRating Object Start ----------");
        console.log(JSON.stringify(movieJsonLd.aggregateRating, null, 2));
        console.log("----------- AggregateRating Object End -----------");
      }
      return { error: null, aggregateRating: movieJsonLd.aggregateRating, fullJsonLd: movieJsonLd };
    } else if (movieJsonLd) {
      if (!isBenchmark) console.warn("\n[Search & JSON-LD] Movie JSON-LD does not contain 'aggregateRating' property.");
      return { error: 'No aggregateRating in JSON-LD', aggregateRating: null, fullJsonLd: movieJsonLd };
    } else {
      if (!isBenchmark) console.warn("\n[Search & JSON-LD] Could not find Movie type JSON-LD data on the detail page.");
      return { error: 'No Movie JSON-LD found', aggregateRating: null, fullJsonLd: null };
    }

  } catch (error) {
    if (page && !page.isClosed()) await page.close();
    if (createdNewBrowser && browser) await browser.close();
    if (!isBenchmark) console.error(`[Search & JSON-LD] Main error while processing "${movieTitle}":`, error);
    return { error: error.message, aggregateRating: null, fullJsonLd: null };
  } 
}

// Main execution logic (for direct CLI use)
if (require.main === module) {
  const defaultMovieTitle = "Inception";
  const movieTitleToSearch = process.argv[2] || defaultMovieTitle;
  
  if (!process.argv[2]) {
    console.log(`[Search & JSON-LD] No movie title provided, using default: "${defaultMovieTitle}"`);
  }
  getMovieDataByTitleSearchAndJsonLd(movieTitleToSearch, false, null).then(result => { // Pass null for existingContext
    if (result.error) {
      console.error("[CLI Execution] Error reported:", result.error);
    }
    // When not in benchmark mode, the function itself prints details.
  }).catch(err => {
    console.error("[CLI Execution] Unhandled error:", err);
  });
}

module.exports = { getMovieDataByTitleSearchAndJsonLd }; 