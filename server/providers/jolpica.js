// Jolpica (Ergast successor): calendar, standings, results. Free and rate-limited,
// so every call goes through the file cache and calls are made one at a time.

const BASE_URL = 'https://api.jolpi.ca/ergast/f1/';
const TTL = { calendar: 24 * 3600e3, standings: 3600e3, results: 3600e3 };

// TODO(standings): calendar(season) → Calendar (FirstPractice, SecondPractice, ThirdPractice,
//   SprintQualifying, Sprint, Qualifying and the race mapped to SessionType).
// TODO(standings): standings(season) → Standings; results(season, round) incl. sprint results.

module.exports = { BASE_URL, TTL };
