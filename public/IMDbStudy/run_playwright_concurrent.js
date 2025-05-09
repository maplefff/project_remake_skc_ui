const { chromium } = require('playwright');
const { getMovieDataByTitleSearchAndJsonLd } = require('./IMDb_study_playwright.js');
const { performance } = require('perf_hooks');

const FULL_MOVIE_TITLES_LIST = [
  "The Shawshank Redemption", "The Godfather", "The Dark Knight", "The Godfather Part II", "12 Angry Men",
  "Schindler's List", "The Lord of the Rings: The Return of the King", "Pulp Fiction",
  "The Lord of the Rings: The Fellowship of the Ring", "The Good, the Bad and the Ugly", "Forrest Gump",
  "Fight Club", "Inception", "The Lord of the Rings: The Two Towers", "Star Wars: Episode V - The Empire Strikes Back",
  "The Matrix", "Goodfellas", "One Flew Over the Cuckoo's Nest", "Se7en", "Seven Samurai",
  "It's a Wonderful Life", "The Silence of the Lambs", "Saving Private Ryan", "City of God", "Life Is Beautiful",
  "The Green Mile", "Interstellar", "Terminator 2: Judgment Day", "Back to the Future", "Spirited Away",
  "Psycho", "The Pianist", "Parasite", "Léon: The Professional", "The Lion King", "Gladiator",
  "American History X", "The Departed", "The Usual Suspects", "The Prestige", "Whiplash", "Casablanca",
  "The Intouchables", "Modern Times", "Once Upon a Time in the West", "Rear Window", "Cinema Paradiso",
  "Grave of the Fireflies", "Alien", "City Lights", "Apocalypse Now", "Memento", "Raiders of the Lost Ark",
  "The Lives of Others", "Django Unchained", "WALL·E", "Sunset Blvd.", "Paths of Glory", "The Shining",
  "Avengers: Infinity War", "Witness for the Prosecution", "The Great Dictator", "Aliens", "American Beauty",
  "Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb", "The Dark Knight Rises", "Oldboy",
  "Amadeus", "Coco", "Toy Story", "Braveheart", "Das Boot", "Inglourious Basterds", "Princess Mononoke",
  "Joker", "Your Name.", "Avengers: Endgame", "Good Will Hunting", "Requiem for a Dream", "3 Idiots",
  "Toy Story 3", "Once Upon a Time in America", "High and Low", "Singin' in the Rain", "Capernaum",
  "Come and See", "Eternal Sunshine of the Spotless Mind", "2001: A Space Odyssey", "Reservoir Dogs",
  "Lawrence of Arabia", "The Hunt", "Ikiru", "Vertigo", "Citizen Kane", "North by Northwest", "M",
  "Full Metal Jacket", "Double Indemnity", "Bicycle Thieves", "The Apartment", "Scarface", "A Clockwork Orange"
];

async function runPlaywrightTest(title, browserContext) {
  const startTime = performance.now();
  const result = await getMovieDataByTitleSearchAndJsonLd(title, true, browserContext);
  const endTime = performance.now();
  const timeMs = parseFloat((endTime - startTime).toFixed(2));
  const success = !result.error && !!result.aggregateRating;

  let errorLog = '';
  if (result.error) {
    errorLog = `, Error: ${result.error}`;
  }
  console.log(`[Playwright] Movie "${title}": ${success ? 'SUCCESS' : 'FAILED'} in ${timeMs} ms. Rating: ${result.aggregateRating?.ratingValue || 'N/A'}, Count: ${result.aggregateRating?.ratingCount || 'N/A'}${errorLog}`);
  return { title, timeMs, success, rating: result.aggregateRating?.ratingValue, ratingCount: result.aggregateRating?.ratingCount, error: result.error };
}

async function main(numMoviesToTestArg) {
  let moviesToProcess = FULL_MOVIE_TITLES_LIST;
  const defaultNum = 10;

  if (numMoviesToTestArg !== undefined) {
    const count = parseInt(numMoviesToTestArg, 10);
    if (!isNaN(count) && count > 0) {
      moviesToProcess = FULL_MOVIE_TITLES_LIST.slice(0, count);
      console.log(`Processing the first ${moviesToProcess.length} movies for Playwright concurrent test.`);
    } else {
      console.warn(`Invalid number provided ("${numMoviesToTestArg}"). Processing default (${defaultNum}) movies.`);
      moviesToProcess = FULL_MOVIE_TITLES_LIST.slice(0, defaultNum);
    }
  } else {
    console.log(`No movie count argument. Processing default (${defaultNum}) movies for Playwright concurrent test.`);
    moviesToProcess = FULL_MOVIE_TITLES_LIST.slice(0, defaultNum);
  }

  if (moviesToProcess.length === 0) {
    console.log("No movies to process. Exiting.");
    return;
  }
  
  console.log(`\nStarting Playwright concurrent test for ${moviesToProcess.length} movies...`);
  console.warn("This will launch multiple browser contexts and can be resource-intensive.");

  const overallStartTime = performance.now();
  let playwrightBrowser = null;
  const testPromises = [];
  let successes = 0;

  try {
    playwrightBrowser = await chromium.launch();
    
    for (const title of moviesToProcess) {
      // Create a new context for each movie to ensure isolation and allow concurrency
      const context = await playwrightBrowser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' }
      });
      testPromises.push(runPlaywrightTest(title, context).finally(async () => {
        // Ensure context is closed after the test, regardless of outcome
        if (context) await context.close();
      }));
    }

    const results = await Promise.allSettled(testPromises);

    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value.success) {
        successes++;
      } else if (result.status === 'rejected') {
        console.error(`[Playwright] Critical error for a movie task: ${result.reason}`);
      }
    });

  } catch (e) {
    console.error("\nAn critical error occurred during the Playwright concurrent benchmark setup:", e);
  } finally {
    if (playwrightBrowser) {
      console.log("\nClosing Playwright browser instance...");
      await playwrightBrowser.close();
      console.log("Playwright browser instance closed.");
    }
  }

  const overallEndTime = performance.now();
  const totalExecutionTimeMs = parseFloat((overallEndTime - overallStartTime).toFixed(2));

  console.log(`\n\n--- Playwright Concurrent Test Summary ---`);
  console.log(`Processed ${moviesToProcess.length} movies.`);
  console.log(`Successful fetches: ${successes} / ${moviesToProcess.length}.`);
  console.log(`Total execution time for Playwright tests: ${totalExecutionTimeMs} ms.`);
}

const numMoviesToTest = process.argv[2];
main(numMoviesToTest).catch(console.error); 