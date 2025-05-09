const { chromium } = require('playwright'); // Import chromium for compare.js to manage browser
const { getMovieDataByTitleSearchAndJsonLd } = require('./IMDb_study_playwright.js');
const { getMovieDataWithAxios } = require('./IMDb_study_without_playwright.js');
const { performance } = require('perf_hooks');

// 
// IMPORTANT: Please expand this list to at least 100 diverse movie titles for a comprehensive comparison.
// You can find lists of popular/top-rated movies from various sources to populate this.
// 
const FULL_MOVIE_TITLES_LIST = [
  "The Shawshank Redemption",
  "The Godfather",
  "The Dark Knight",
  "The Godfather Part II",
  "12 Angry Men",
  "Schindler's List",
  "The Lord of the Rings: The Return of the King",
  "Pulp Fiction",
  "The Lord of the Rings: The Fellowship of the Ring",
  "The Good, the Bad and the Ugly",
  "Forrest Gump",
  "Fight Club",
  "Inception",
  "The Lord of the Rings: The Two Towers",
  "Star Wars: Episode V - The Empire Strikes Back",
  "The Matrix",
  "Goodfellas",
  "One Flew Over the Cuckoo's Nest",
  "Se7en",
  "Seven Samurai",
  "It's a Wonderful Life",
  "The Silence of the Lambs",
  "Saving Private Ryan",
  "City of God",
  "Life Is Beautiful",
  "The Green Mile",
  "Interstellar",
  "Terminator 2: Judgment Day",
  "Back to the Future",
  "Spirited Away",
  "Psycho",
  "The Pianist",
  "Parasite",
  "Léon: The Professional",
  "The Lion King",
  "Gladiator",
  "American History X",
  "The Departed",
  "The Usual Suspects",
  "The Prestige",
  "Whiplash",
  "Casablanca",
  "The Intouchables",
  "Modern Times",
  "Once Upon a Time in the West",
  "Rear Window",
  "Cinema Paradiso",
  "Grave of the Fireflies",
  "Alien",
  "City Lights",
  "Apocalypse Now",
  "Memento",
  "Raiders of the Lost Ark",
  "The Lives of Others",
  "Django Unchained",
  "WALL·E",
  "Sunset Blvd.",
  "Paths of Glory",
  "The Shining",
  "Avengers: Infinity War",
  "Witness for the Prosecution",
  "The Great Dictator",
  "Aliens",
  "American Beauty",
  "Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb",
  "The Dark Knight Rises",
  "Oldboy",
  "Amadeus",
  "Coco",
  "Toy Story",
  "Braveheart",
  "Das Boot",
  "Inglourious Basterds",
  "Princess Mononoke",
  "Joker",
  "Your Name.",
  "Avengers: Endgame",
  "Good Will Hunting",
  "Requiem for a Dream",
  "3 Idiots",
  "Toy Story 3",
  "Once Upon a Time in America",
  "High and Low",
  "Singin' in the Rain",
  "Capernaum",
  "Come and See",
  "Eternal Sunshine of the Spotless Mind",
  "2001: A Space Odyssey",
  "Reservoir Dogs",
  "Lawrence of Arabia",
  "The Hunt",
  "Ikiru",
  "Vertigo",
  "Citizen Kane",
  "North by Northwest",
  "M",
  "Full Metal Jacket",
  "Double Indemnity",
  "Bicycle Thieves",
  "The Apartment",
  "Scarface",
  "A Clockwork Orange"
];

const DELAY_BETWEEN_METHODS_MS = 3000; // 3 seconds delay between playwright and axios for the SAME movie
const DELAY_BETWEEN_MOVIES_MS = 5000;  // 5 seconds delay between DIFFERENT movies

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runComparison(numMoviesToTestArg) {
  let moviesToProcess = FULL_MOVIE_TITLES_LIST;
  if (numMoviesToTestArg !== undefined) {
    const count = parseInt(numMoviesToTestArg, 10);
    if (!isNaN(count) && count > 0) {
      moviesToProcess = FULL_MOVIE_TITLES_LIST.slice(0, count);
      console.log(`Processing the first ${moviesToProcess.length} movies from the list based on argument.`);
    } else {
      console.warn(`Invalid number provided ("${numMoviesToTestArg}"). Processing the default number of movies (first 10).`);
      moviesToProcess = FULL_MOVIE_TITLES_LIST.slice(0, 10);
    }
  } else {
    console.log(`No movie count argument provided. Processing the default number of movies (first 10).`);
    moviesToProcess = FULL_MOVIE_TITLES_LIST.slice(0, 10); // Default to 10 if no arg
  }

  if (moviesToProcess.length === 0) {
    console.log("No movies to process. Exiting.");
    return;
  }

  console.log(`Starting comparison for ${moviesToProcess.length} movies...\n`);
  console.warn("This process can take a long time. Estimated delays alone: " + 
               `${(moviesToProcess.length * (DELAY_BETWEEN_METHODS_MS + DELAY_BETWEEN_MOVIES_MS)) / 1000} seconds.`);

  const results = [];
  let playwrightBrowser = null;
  let playwrightContext = null;

  try {
    console.log("\nInitializing shared Playwright browser instance for benchmark...");
    playwrightBrowser = await chromium.launch();
    playwrightContext = await playwrightBrowser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' }
    });
    console.log("Shared Playwright browser instance initialized.\n");

    for (let i = 0; i < moviesToProcess.length; i++) {
      const title = moviesToProcess[i];
      console.log(`------------------------------------------------------------------`);
      console.log(`Processing movie ${i + 1}/${moviesToProcess.length}: "${title}"`);
      console.log(`------------------------------------------------------------------`);
      const movieResult = { title, playwright: {}, axios: {} };

      // --- Test Playwright Method ---
      console.log(`\n[Compare] Testing Playwright for "${title}"...`);
      let startTime = performance.now();
      const playwrightResult = await getMovieDataByTitleSearchAndJsonLd(title, true, playwrightContext);
      let endTime = performance.now();
      movieResult.playwright.timeMs = parseFloat((endTime - startTime).toFixed(2));
      movieResult.playwright.success = !playwrightResult.error && !!playwrightResult.aggregateRating;
      movieResult.playwright.rating = playwrightResult.aggregateRating ? playwrightResult.aggregateRating.ratingValue : null;
      movieResult.playwright.ratingCount = playwrightResult.aggregateRating ? playwrightResult.aggregateRating.ratingCount : null;
      movieResult.playwright.error = playwrightResult.error;
      console.log(`[Compare] Playwright for "${title}": ${movieResult.playwright.success ? 'SUCCESS' : 'FAILED'} in ${movieResult.playwright.timeMs} ms. Rating: ${movieResult.playwright.rating}, Count: ${movieResult.playwright.ratingCount}${movieResult.playwright.error ? ', Error: ' + movieResult.playwright.error : ''}`);
      
      await sleep(DELAY_BETWEEN_METHODS_MS);

      // --- Test Axios/Cheerio Method ---
      console.log(`\n[Compare] Testing Axios/Cheerio for "${title}"...`);
      startTime = performance.now();
      const axiosResult = await getMovieDataWithAxios(title, true);
      endTime = performance.now();
      movieResult.axios.timeMs = parseFloat((endTime - startTime).toFixed(2));
      movieResult.axios.success = !axiosResult.error && !!axiosResult.aggregateRating;
      movieResult.axios.rating = axiosResult.aggregateRating ? axiosResult.aggregateRating.ratingValue : null;
      movieResult.axios.ratingCount = axiosResult.aggregateRating ? axiosResult.aggregateRating.ratingCount : null;
      movieResult.axios.error = axiosResult.error;
      console.log(`[Compare] Axios/Cheerio for "${title}": ${movieResult.axios.success ? 'SUCCESS' : 'FAILED'} in ${movieResult.axios.timeMs} ms. Rating: ${movieResult.axios.rating}, Count: ${movieResult.axios.ratingCount}${movieResult.axios.error ? ', Error: ' + movieResult.axios.error : ''}`);
      
      results.push(movieResult);

      if (i < moviesToProcess.length - 1) {
          await sleep(DELAY_BETWEEN_MOVIES_MS);
      }
    }
  } catch (e) {
    console.error("\nA critical error occurred during the comparison benchmark:", e);
  } finally {
    if (playwrightBrowser) {
      console.log("\nClosing shared Playwright browser instance...");
      await playwrightBrowser.close();
      console.log("Shared Playwright browser instance closed.");
    }
  }

  console.log(`\n\n==================================================================`);
  console.log(`Comparison Complete. Processed ${moviesToProcess.length} movies.`);
  console.log(`==================================================================\n`);

  const playwrightStats = { successes: 0, totalTime: 0, times: [] };
  const axiosStats = { successes: 0, totalTime: 0, times: [] };

  results.forEach(r => {
    if (r.playwright.timeMs > 0) { 
        if (r.playwright.success) {
            playwrightStats.successes++;
            playwrightStats.totalTime += r.playwright.timeMs;
            playwrightStats.times.push(r.playwright.timeMs);
        }
    }
    if (r.axios.timeMs > 0) { 
        if (r.axios.success) {
            axiosStats.successes++;
            axiosStats.totalTime += r.axios.timeMs;
            axiosStats.times.push(r.axios.timeMs);
        }
    }
  });

  const calculateMetrics = (stats, totalProcessed) => {
    if (stats.times.length === 0) return { avg: 0, min: 0, max: 0, median: 0, successRate: 0 };
    stats.times.sort((a, b) => a - b);
    const mid = Math.floor(stats.times.length / 2);
    const median = stats.times.length % 2 !== 0 ? stats.times[mid] : (stats.times[mid - 1] + stats.times[mid]) / 2;
    return {
      avg: parseFloat((stats.totalTime / stats.times.length).toFixed(2)),
      min: stats.times[0],
      max: stats.times[stats.times.length - 1],
      median: parseFloat(median.toFixed(2)),
      successRate: parseFloat(((stats.successes / totalProcessed) * 100).toFixed(2))
    };
  };

  const playwrightMetrics = calculateMetrics(playwrightStats, moviesToProcess.length);
  const axiosMetrics = calculateMetrics(axiosStats, moviesToProcess.length);

  console.log("--- Playwright Method Statistics ---");
  console.log(`Successful fetches: ${playwrightStats.successes} / ${moviesToProcess.length} (${playwrightMetrics.successRate}%)`);
  if (playwrightStats.successes > 0) {
    console.log(`Total time for successes (Playwright): ${playwrightStats.totalTime.toFixed(2)} ms`);
    console.log(`Average time (Playwright): ${playwrightMetrics.avg} ms`);
    console.log(`Min time (Playwright): ${playwrightMetrics.min} ms`);
    console.log(`Max time (Playwright): ${playwrightMetrics.max} ms`);
    console.log(`Median time (Playwright): ${playwrightMetrics.median} ms`);
  }

  console.log("\n--- Axios/Cheerio Method Statistics ---");
  console.log(`Successful fetches: ${axiosStats.successes} / ${moviesToProcess.length} (${axiosMetrics.successRate}%)`);
  if (axiosStats.successes > 0) {
    console.log(`Total time for successes (Axios/Cheerio): ${axiosStats.totalTime.toFixed(2)} ms`);
    console.log(`Average time (Axios/Cheerio): ${axiosMetrics.avg} ms`);
    console.log(`Min time (Axios/Cheerio): ${axiosMetrics.min} ms`);
    console.log(`Max time (Axios/Cheerio): ${axiosMetrics.max} ms`);
    console.log(`Median time (Axios/Cheerio): ${axiosMetrics.median} ms`);
  }
  console.log("\nNote: Playwright browser instance was reused across all its tests.");
}

// Get the number of movies to test from command line argument
const numMoviesToTest = process.argv[2]; 
runComparison(numMoviesToTest).catch(console.error); 