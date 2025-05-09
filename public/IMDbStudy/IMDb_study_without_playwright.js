const axios = require('axios');
const cheerio = require('cheerio');

async function getMovieDataWithAxios(movieTitle, isBenchmark = false) {
  if (!isBenchmark) console.log(`[Axios Attempt] Searching for movie: "${movieTitle}"`);

  let movieDetailUrl = null;
  try {
    const searchUrl = `https://www.imdb.com/find/?q=${encodeURIComponent(movieTitle)}&s=tt`;
    if (!isBenchmark) console.log(`[Axios Attempt] Requesting search page: ${searchUrl}`);

    const searchResponse = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    const $search = cheerio.load(searchResponse.data);
    let firstResultHref = null;
    firstResultHref = $search('ul.ipc-metadata-list li.ipc-metadata-list-summary-item:first-child a[href^="/title/tt"]').first().attr('href');
    if (!firstResultHref) {
      if (!isBenchmark) console.log("[Axios Attempt] First link selector (ipc-metadata-list) didn't find anything. Trying another...");
      firstResultHref = $search('section[data-testid="find-results-section-title"] ul li:first-child a[href^="/title/tt"]').first().attr('href');
    }
    if (!firstResultHref) {
      if (!isBenchmark) console.log("[Axios Attempt] Second link selector (section data-testid) didn't find anything. Trying older table structure...");
      firstResultHref = $search('table.findList tr.findResult:first-child td.result_text a[href^="/title/tt"]').first().attr('href');
    }
    if (!firstResultHref) {
      if (!isBenchmark) {
        console.log("[Axios Attempt] All attempted link selectors failed to find a movie link.");
        console.log("-------------------- RAW SEARCH HTML (first 2000 chars) --------------------");
        console.log(searchResponse.data.substring(0,2000));
        console.log("---------------------------------------------------------------------------");
      }
      return { error: 'Could not find movie link in search results.', aggregateRating: null, fullJsonLd: null };
    }
    movieDetailUrl = `https://www.imdb.com${firstResultHref.split('?')[0]}`;
    if (!isBenchmark) console.log(`[Axios Attempt] Found movie detail page link: ${movieDetailUrl}`);
  } catch (error) {
    if (!isBenchmark) {
      console.error(`[Axios Attempt] Error during movie search for "${movieTitle}":`, error.message);
      if (error.response) console.error('[Axios Attempt] Server responded with status:', error.response.status);
    }
    return { error: error.message, aggregateRating: null, fullJsonLd: null };
  }

  try {
    if (!isBenchmark) console.log(`[Axios Attempt] Requesting detail page: ${movieDetailUrl}`);
    const detailResponse = await axios.get(movieDetailUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    const $detail = cheerio.load(detailResponse.data);
    let movieJsonLd = null;
    $detail('script[type="application/ld+json"]').each((index, element) => {
      const scriptContent = $detail(element).html();
      if (scriptContent) {
        try {
          const jsonData = JSON.parse(scriptContent);
          if (jsonData['@type'] === 'Movie') {
            movieJsonLd = jsonData;
            return false;
          } else if (Array.isArray(jsonData)) {
            for (const item of jsonData) {
              if (item['@type'] === 'Movie') {
                movieJsonLd = item;
                return false;
              }
            }
            if (movieJsonLd) return false;
          }
        } catch (e) {
          if (!isBenchmark) console.warn('[Axios Attempt] Error parsing a JSON-LD script on detail page:', e.message);
        }
      }
    });

    if (movieJsonLd && movieJsonLd.aggregateRating) {
      if (!isBenchmark) {
        console.log("\n[Axios Attempt] Successfully found Movie type JSON-LD data:");
        console.log("---------- Entire Original JSON-LD Start ----------");
        console.log(JSON.stringify(movieJsonLd, null, 2));
        console.log("----------- Entire Original JSON-LD End -----------");
        console.log("\n---------- AggregateRating Object Start ----------");
        console.log(JSON.stringify(movieJsonLd.aggregateRating, null, 2));
        console.log("----------- AggregateRating Object End -----------");
      }
      return { error: null, aggregateRating: movieJsonLd.aggregateRating, fullJsonLd: movieJsonLd };
    } else if (movieJsonLd) {
      if (!isBenchmark) console.warn("\n[Axios Attempt] Movie JSON-LD does not contain 'aggregateRating' property.");
      return { error: 'No aggregateRating in JSON-LD', aggregateRating: null, fullJsonLd: movieJsonLd };
    } else {
      if (!isBenchmark) {
        console.warn("\n[Axios Attempt] Could not find Movie type JSON-LD data on the detail page.");
        console.log("-------------------- RAW DETAIL HTML (first 2000 chars) --------------------");
        console.log(detailResponse.data.substring(0,2000));
        console.log("-----------------------------------------------------------------------------");
      }
      return { error: 'No Movie JSON-LD found', aggregateRating: null, fullJsonLd: null };
    }
  } catch (error) {
    if (!isBenchmark) {
      console.error(`[Axios Attempt] Error fetching/processing detail page for "${movieTitle}":`, error.message);
      if (error.response) console.error('[Axios Attempt] Server responded with status:', error.response.status);
    }
    return { error: error.message, aggregateRating: null, fullJsonLd: null };
  }
}

// Main execution logic
if (require.main === module) {
  const defaultMovieTitle = "Inception";
  const movieTitleToSearch = process.argv[2] || defaultMovieTitle;

  if (!process.argv[2]) {
    console.log(`[Axios Attempt] No movie title provided, using default: "${defaultMovieTitle}"`);
  }
  console.log("IMPORTANT: This script uses axios and cheerio and might fail if IMDb's structure changes or if anti-scraping measures are too strong.");
  console.log("Make sure you have run: npm install axios cheerio");
  
  getMovieDataWithAxios(movieTitleToSearch, false).then(result => {
    if (result.error) {
      console.error("[CLI Execution] Error reported:", result.error);
    }
    // The function already prints details when not in benchmark mode.
  }).catch(err => {
    console.error("[CLI Execution] Unhandled error:", err);
  });
}

module.exports = { getMovieDataWithAxios }; 