const { getMovieDataWithAxios } = require('./IMDb_study_without_playwright.js');
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

async function runAxiosTest(title) {
  const startTime = performance.now();
  const result = await getMovieDataWithAxios(title, true);
  const endTime = performance.now();
  const timeMs = parseFloat((endTime - startTime).toFixed(2));
  const success = !result.error && !!result.aggregateRating;
  
  let errorLog = '';
  if (result.error) {
    errorLog = `, Error: ${result.error}`;
  }
  console.log(`[Axios] Movie "${title}": ${success ? 'SUCCESS' : 'FAILED'} in ${timeMs} ms. Rating: ${result.aggregateRating?.ratingValue || 'N/A'}, Count: ${result.aggregateRating?.ratingCount || 'N/A'}${errorLog}`);
  return { title, timeMs, success, rating: result.aggregateRating?.ratingValue, ratingCount: result.aggregateRating?.ratingCount, error: result.error };
}

async function main(numMoviesToTestArg) {
  let moviesToProcess = FULL_MOVIE_TITLES_LIST;
  const defaultNum = 10;

  if (numMoviesToTestArg !== undefined) {
    const count = parseInt(numMoviesToTestArg, 10);
    if (!isNaN(count) && count > 0) {
      moviesToProcess = FULL_MOVIE_TITLES_LIST.slice(0, count);
      console.log(`Processing the first ${moviesToProcess.length} movies for Axios concurrent test.`);
    } else {
      console.warn(`Invalid number provided ("${numMoviesToTestArg}"). Processing default (${defaultNum}) movies.`);
      moviesToProcess = FULL_MOVIE_TITLES_LIST.slice(0, defaultNum);
    }
  } else {
    console.log(`No movie count argument. Processing default (${defaultNum}) movies for Axios concurrent test.`);
    moviesToProcess = FULL_MOVIE_TITLES_LIST.slice(0, defaultNum);
  }

  if (moviesToProcess.length === 0) {
    console.log("No movies to process. Exiting.");
    return;
  }

  console.log(`\nStarting Axios concurrent test for ${moviesToProcess.length} movies...`);
  console.warn("This will send multiple HTTP requests concurrently. Be mindful of rate limits.");

  const overallStartTime = performance.now();
  const testPromises = [];
  let successes = 0;

  try {
    for (const title of moviesToProcess) {
      testPromises.push(runAxiosTest(title));
    }

    const results = await Promise.allSettled(testPromises);

    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value.success) {
        successes++;
      } else if (result.status === 'rejected') {
        console.error(`[Axios] Critical error for a movie task: ${result.reason}`);
      }
      // Individual movie logs are already printed in runAxiosTest
    });

  } catch (e) {
    console.error("\nAn critical error occurred during the Axios concurrent benchmark:", e);
  }

  const overallEndTime = performance.now();
  const totalExecutionTimeMs = parseFloat((overallEndTime - overallStartTime).toFixed(2));

  console.log(`\n\n--- Axios Concurrent Test Summary ---`);
  console.log(`Processed ${moviesToProcess.length} movies.`);
  console.log(`Successful fetches: ${successes} / ${moviesToProcess.length}.`);
  console.log(`Total execution time for Axios tests: ${totalExecutionTimeMs} ms.`);
}

const numMoviesToTest = process.argv[2];
main(numMoviesToTest).catch(console.error); 