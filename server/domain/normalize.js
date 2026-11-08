// Turns the merged F1 state into one clean SessionSnapshot. Pure. This is the
// only place besides state.js that knows raw topic shapes.

const { COMPOUNDS } = require('./types');

const TRACK = { 1: 'green', 2: 'yellow', 4: 'sc', 5: 'red', 6: 'vsc', 7: 'vsc_ending' };
const TRACK_BY_NAME = { AllClear: 'green', Yellow: 'yellow', SCDeployed: 'sc', Red: 'red', VSCDeployed: 'vsc', VSCEnding: 'vsc_ending' };
const STATUS = { Inactive: 'pre', Started: 'running', Aborted: 'suspended', Finished: 'finished', Finalised: 'ended', Ends: 'ended' };
const RACE_CONTROL_KEEP = 50;

const values = (v) => (Array.isArray(v) ? v : Object.entries(v || {}).filter(([k]) => k !== '_kf').map(([, x]) => x));
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const utcMs = (s) => { if (!s) return null; const t = Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : `${s}Z`); return Number.isFinite(t) ? t : null; };

function sessionType(info) {
  const type = String(info?.Type || '');
  const name = String(info?.Name || '');
  if (type === 'Race') return /sprint/i.test(name) ? 'sprint' : 'race';
  if (type === 'Qualifying') return /sprint|shootout/i.test(name) ? 'sprint_qualifying' : 'qualifying';
  return 'practice';
}

// SessionInfo gives local time plus an offset; the calendar speaks UTC.
function startsAt(info) {
  const local = Date.parse(`${info?.StartDate}Z`);
  const m = /^(-?)(\d\d):(\d\d)/.exec(String(info?.GmtOffset || '00:00'));
  if (!Number.isFinite(local) || !m) return null;
  const offset = (Number(m[2]) * 60 + Number(m[3])) * 60000 * (m[1] === '-' ? -1 : 1);
  return new Date(local - offset).toISOString();
}

function session(info) {
  const year = num(String(info?.Path || '').slice(0, 4)) ?? num(String(info?.StartDate || '').slice(0, 4));
  return {
    key: info?.Key ?? null,
    year,
    meetingName: info?.Meeting?.Name ?? '',
    circuitKey: info?.Meeting?.Circuit?.Key ?? null,
    circuitName: info?.Meeting?.Circuit?.ShortName ?? '',
    country: info?.Meeting?.Country?.Name ?? '',
    type: sessionType(info),
    name: info?.Name ?? '',
    path: info?.Path ?? '',
    startsAt: startsAt(info),
  };
}

// The time of the last track status change, from the session's status history.
function trackSince(sessionData, fallback) {
  const series = values(sessionData?.StatusSeries).filter((e) => e && e.TrackStatus);
  return series.length ? utcMs(series[series.length - 1].Utc) ?? fallback : fallback;
}

function parseDuration(text) {
  const m = /^(\d+):(\d\d):(\d\d)$/.exec(String(text || ''));
  return m ? ((Number(m[1]) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000 : null;
}

// The feed keeps "Extrapolating" on after the flag, so the clock only runs in a running session.
function clock(extrapolated, at, sessionRunning) {
  const remaining = parseDuration(extrapolated?.Remaining);
  const running = sessionRunning && Boolean(extrapolated?.Extrapolating);
  if (remaining === null) return { remainingMs: null, running: false, rate: 1 };
  const from = utcMs(extrapolated.Utc);
  const passed = running && from !== null ? Math.max(0, at - from) : 0;
  return { remainingMs: Math.max(0, remaining - passed), running, rate: 1 };
}

function tyre(appLine) {
  const stints = values(appLine?.Stints);
  const last = stints[stints.length - 1];
  if (!last) return { compound: 'UNKNOWN', age: 0, isNew: false };
  const compound = COMPOUNDS.includes(last.Compound) ? last.Compound : 'UNKNOWN';
  return { compound, age: num(last.TotalLaps) ?? 0, isNew: last.New === true || last.New === 'true' };
}

// The last mini-sector completed on this lap, counted across sectors in order.
function progress(timingLine, segmentAt) {
  const sectors = values(timingLine?.Sectors);
  let segmentsPerLap = 0;
  let segment = 0;
  let sector = 0;
  sectors.forEach((s, i) => {
    values(s?.Segments).forEach((seg) => {
      segmentsPerLap += 1;
      if (seg && seg.Status) { segment = segmentsPerLap; sector = i; }
    });
  });
  if (!segmentsPerLap) return null;
  return { sector, segment, segmentsPerLap, at: segmentAt ?? null };
}

function driverRow(number, driver, timing, app, segmentAt) {
  return {
    number,
    code: driver?.Tla ?? number,
    name: driver?.FullName ?? driver?.BroadcastName ?? '',
    team: driver?.TeamName ?? '',
    teamColour: /^[0-9a-f]{6}$/i.test(driver?.TeamColour || '') ? driver.TeamColour : '888888',
    position: num(timing?.Position) ?? num(timing?.Line),
    gridPosition: num(app?.GridPos),
    gapToLeader: timing?.GapToLeader ?? '',
    interval: timing?.IntervalToPositionAhead?.Value ?? '',
    lastLap: timing?.LastLapTime?.Value ?? '',
    bestLap: timing?.BestLapTime?.Value ?? '',
    laps: num(timing?.NumberOfLaps) ?? 0,
    pitStops: num(timing?.NumberOfPitStops) ?? 0,
    inPit: Boolean(timing?.InPit),
    pitOut: Boolean(timing?.PitOut),
    retired: Boolean(timing?.Retired),
    stopped: Boolean(timing?.Stopped),
    knockedOut: Boolean(timing?.KnockedOut),
    tyre: tyre(app),
    stints: values(app?.Stints).map((s) => ({ compound: COMPOUNDS.includes(s.Compound) ? s.Compound : 'UNKNOWN', laps: num(s.TotalLaps) ?? 0, isNew: s.New === true || s.New === 'true' })),
    progress: progress(timing, segmentAt),
  };
}

function drivers(topics, segmentAt) {
  const list = topics.DriverList || {};
  const lines = topics.TimingData?.Lines || {};
  const app = topics.TimingAppData?.Lines || {};
  const numbers = new Set([...Object.keys(list), ...Object.keys(lines)].filter((k) => k !== '_kf'));
  const rows = [...numbers].map((n) => driverRow(n, list[n], lines[n], app[n], segmentAt[n]));
  // Cars without a position (before the session) keep the feed's driver list order.
  return rows.sort((a, b) => (a.position ?? 999) - (b.position ?? 999) || (num(list[a.number]?.Line) ?? 999) - (num(list[b.number]?.Line) ?? 999));
}

function fastestLap(timingStats) {
  const entry = Object.entries(timingStats?.Lines || {}).find(([, l]) => num(l?.PersonalBestLapTime?.Position) === 1);
  if (!entry || !entry[1].PersonalBestLapTime.Value) return null;
  return { number: entry[0], time: entry[1].PersonalBestLapTime.Value, lap: num(entry[1].PersonalBestLapTime.Lap) };
}

function raceControl(rcm) {
  return values(rcm?.Messages).slice(-RACE_CONTROL_KEEP).map((m) => ({
    at: utcMs(m.Utc),
    lap: num(m.Lap),
    category: m.Category ?? '',
    message: m.Message ?? '',
    flag: m.Flag ?? null,
    number: m.RacingNumber ?? null,
  }));
}

function weather(w) {
  if (!w) return null;
  return {
    airTemp: num(w.AirTemp),
    trackTemp: num(w.TrackTemp),
    humidity: num(w.Humidity),
    rainfall: num(w.Rainfall) > 0,
    windSpeed: num(w.WindSpeed),
  };
}

/**
 * @param {Record<string, any>} topics   TimingState.topics
 * @param {Record<string, number>} segmentAt TimingState.segmentAt
 * @param {number} at
 * @returns {import('./types').SessionSnapshot}
 */
function normalizeSession(topics, segmentAt, at) {
  const trackCode = topics.TrackStatus?.Status;
  const status = STATUS[topics.SessionStatus?.Status] ?? 'pre';
  return {
    at,
    session: session(topics.SessionInfo),
    status,
    track: {
      status: TRACK[trackCode] ?? TRACK_BY_NAME[topics.TrackStatus?.Message] ?? 'green',
      since: trackSince(topics.SessionData, at),
    },
    laps: { current: num(topics.LapCount?.CurrentLap) ?? 0, total: num(topics.LapCount?.TotalLaps) },
    clock: clock(topics.ExtrapolatedClock, at, status === 'running'),
    drivers: drivers(topics, segmentAt || {}),
    fastestLap: fastestLap(topics.TimingStats),
    raceControl: raceControl(topics.RaceControlMessages),
    weather: weather(topics.WeatherData),
  };
}

module.exports = { normalizeSession, sessionType, parseDuration };
