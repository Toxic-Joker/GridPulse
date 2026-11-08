// Jolpica (Ergast successor): calendar, standings, sprint results. Free and
// rate-limited, so every call goes through the file cache and calls are made one
// at a time. Raw shapes are normalised here into Calendar and Standings.

const path = require('path');
const { FileCache } = require('./cache');

const BASE_URL = 'https://api.jolpi.ca/ergast/f1/';
const TTL = { calendar: 24 * 3600e3, standings: 3600e3, results: 3600e3 };
const TIMEOUT_MS = 10000;
const MAX_BYTES = 4 * 1024 * 1024;
const SESSIONS = [
  ['FirstPractice', 'practice', 'Practice 1'], ['SecondPractice', 'practice', 'Practice 2'], ['ThirdPractice', 'practice', 'Practice 3'],
  ['SprintQualifying', 'sprint_qualifying', 'Sprint Qualifying'], ['SprintShootout', 'sprint_qualifying', 'Sprint Shootout'],
  ['Sprint', 'sprint', 'Sprint'], ['Qualifying', 'qualifying', 'Qualifying'],
];

const iso = (s) => (s?.date ? `${s.date}T${s.time || '00:00:00Z'}` : null);

function normalizeCalendar(data) {
  const races = data?.MRData?.RaceTable?.Races || [];
  return {
    season: Number(data?.MRData?.RaceTable?.season) || null,
    rounds: races.map((r) => ({
      round: Number(r.round),
      name: r.raceName,
      circuitId: r.Circuit?.circuitId ?? '',
      country: r.Circuit?.Location?.country ?? '',
      sessions: [
        ...SESSIONS.filter(([k]) => r[k]).map(([k, type, name]) => ({ type, name, startsAt: iso(r[k]) })),
        { type: 'race', name: 'Race', startsAt: iso(r) },
      ].sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt))),
    })),
  };
}

function normalizeStandings(drivers, constructors) {
  const dl = drivers?.MRData?.StandingsTable?.StandingsLists?.[0];
  const cl = constructors?.MRData?.StandingsTable?.StandingsLists?.[0];
  return {
    season: Number(dl?.season) || null,
    round: Number(dl?.round) || 0,
    drivers: (dl?.DriverStandings || []).map((s) => ({
      code: s.Driver?.code ?? '',
      name: `${s.Driver?.givenName ?? ''} ${s.Driver?.familyName ?? ''}`.trim(),
      team: s.Constructors?.at(-1)?.name ?? '',
      points: Number(s.points) || 0,
      position: Number(s.position) || null,
    })),
    constructors: (cl?.ConstructorStandings || []).map((s) => ({
      team: s.Constructor?.name ?? '',
      points: Number(s.points) || 0,
      position: Number(s.position) || null,
    })),
  };
}

function normalizeSprint(data) {
  const race = data?.MRData?.RaceTable?.Races?.[0];
  return (race?.SprintResults || []).map((r) => ({ code: r.Driver?.code ?? '', team: r.Constructor?.name ?? '', points: Number(r.points) || 0 }));
}

class JolpicaProvider {
  constructor({ dataDir, fetchImpl = globalThis.fetch }) {
    this.cache = new FileCache(path.join(dataDir, 'cache'));
    this.fetchImpl = fetchImpl;
    this.queue = Promise.resolve();
  }

  // One request at a time; a fresh cache entry never touches the network.
  get(url, ttl) {
    const cached = this.cache.get(url, ttl);
    if (cached) return Promise.resolve(cached);
    const run = this.queue.then(async () => {
      const again = this.cache.get(url, ttl);
      if (again) return again;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await this.fetchImpl(url, { signal: controller.signal, headers: { 'User-Agent': 'GridPulse' } });
        if (!res.ok) throw new Error(`Jolpica answered ${res.status}`);
        const text = await res.text();
        if (text.length > MAX_BYTES) throw new Error('Jolpica answer is too large');
        const data = JSON.parse(text);
        this.cache.set(url, data);
        return data;
      } finally {
        clearTimeout(timer);
      }
    });
    this.queue = run.catch(() => {});
    return run;
  }

  async calendar(season) {
    return normalizeCalendar(await this.get(`${BASE_URL}${Number(season)}.json`, TTL.calendar));
  }

  async standings(season) {
    const drivers = await this.get(`${BASE_URL}${Number(season)}/driverStandings.json?limit=50`, TTL.standings);
    const constructors = await this.get(`${BASE_URL}${Number(season)}/constructorStandings.json?limit=30`, TTL.standings);
    return normalizeStandings(drivers, constructors);
  }

  async sprintResults(season, round) {
    return normalizeSprint(await this.get(`${BASE_URL}${Number(season)}/${Number(round)}/sprint.json`, TTL.results));
  }
}

module.exports = { JolpicaProvider, normalizeCalendar, normalizeStandings, normalizeSprint, BASE_URL, TTL };
