// The rehearsal race: a fictional 20-lap "Harbour Grand Prix" written as a recording,
// so a first-time user can rehearse offline before GridPulse has recorded a live session.
// Like MatchRoom's simulator, it produces the feed's own payload shapes, so it runs
// through exactly the code a real race does. Drivers and teams are fictional.
//
// Each car has a true distance along the lap, saved as {"kind":"truth"} lines once a
// second. Replay ignores them; tests use them to check the tower, and later to measure
// how close the estimated radar gets.

const fs = require('fs');
const path = require('path');

const VERSION = 1;
const REHEARSAL_ID = `rehearsal-harbour-gp-v${VERSION}.jsonl`;

const LAPS = 20;
const TRACK_M = 4800;
const SECTOR_SEGMENTS = [7, 8, 7];
const SEGMENTS = SECTOR_SEGMENTS.reduce((a, b) => a + b, 0);
const SEGMENT_M = TRACK_M / SEGMENTS;
const DT = 0.25;
const PRE_START_S = 60;
const T0 = Date.parse('2026-06-01T14:00:00.000Z');
const SC_LAP_TIME = 118;
const PIT_LOSS_S = 21;
const FOLLOW_M = 14;
const PASS_ADVANTAGE_S = 0.35;
const COMPOUND = { SOFT: -0.8, MEDIUM: 0, HARD: 0.6 };
const DEGRADATION = { SOFT: 0.09, MEDIUM: 0.05, HARD: 0.03 };

const TEAMS = [
  ['Comet', 'E8002D'], ['Nova', '3671C6'], ['Halcyon', '27F4D2'], ['Pinecrest', '229971'], ['Arcadia', 'FF8000'],
  ['Meridian', 'FF87BC'], ['Vantage', '64C4FF'], ['Ironclad', 'B6BABD'], ['Solstice', '52E252'], ['Kestrel', '6692FF'], ['Tundra', 'C8A2C8'],
];
const DRIVERS = [
  ['4', 'ALV', 'Ada', 'ALVES'], ['5', 'BRK', 'Ben', 'BRANDT'], ['6', 'CAS', 'Cy', 'CASTRO'], ['8', 'DUV', 'Dara', 'DUVAL'],
  ['9', 'EKL', 'Erik', 'EKLUND'], ['13', 'FAR', 'Fen', 'FARRELL'], ['15', 'GIL', 'Gia', 'GILL'], ['17', 'HOS', 'Hugo', 'HOSHI'],
  ['19', 'IVE', 'Ines', 'IVERS'], ['21', 'JAN', 'Jon', 'JANSEN'], ['25', 'KOV', 'Kit', 'KOVAC'], ['26', 'LUN', 'Lia', 'LUNDQVIST'],
  ['28', 'MAR', 'Milo', 'MARIN'], ['29', 'NAK', 'Nia', 'NAKATA'], ['32', 'OKO', 'Ola', 'OKONJO'], ['34', 'PRA', 'Pip', 'PRADO'],
  ['36', 'QUI', 'Quin', 'QUILL'], ['39', 'ROS', 'Rae', 'ROSSI'], ['42', 'SVE', 'Sol', 'SVENSSON'], ['46', 'TAL', 'Tao', 'TALBOT'],
  ['48', 'UDO', 'Uma', 'UDOH'], ['50', 'VEG', 'Vic', 'VEGA'],
];

// Deterministic, so the rehearsal and its tests are the same on every machine.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fmtLap = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, '0')}`;
const fmtGap = (s) => `+${s.toFixed(3)}`;
const iso = (ms) => new Date(ms).toISOString();
const rcmUtc = (ms) => iso(ms).slice(0, 19);

function emptySectors() {
  return SECTOR_SEGMENTS.map((n) => ({ Value: '', PreviousValue: '', Status: 0, Stopped: false, OverallFastest: false, PersonalFastest: false, Segments: Array.from({ length: n }, () => ({ Status: 0 })) }));
}

function generateRehearsal({ seed = 2026 } = {}) {
  const random = rng(seed);
  const lines = [];
  const ms = (t) => T0 + Math.round(t * 1000);
  const msg = (t, topic, data) => lines.push({ kind: 'msg', at: ms(t), topic, data, utc: iso(ms(t)) });
  const line = (t, number, data) => msg(t, 'TimingData', { Lines: { [number]: data } });

  // ── The field ───────────────────────────────────────────────────
  const cars = DRIVERS.map(([number, code, first, last], i) => {
    const team = TEAMS[Math.floor(i / 2)];
    return {
      number, code, first, last, team: team[0], colour: team[1],
      pace: 79 + Math.floor(i / 2) * 0.22 + random() * 0.5,
      compound: random() < 0.6 ? 'MEDIUM' : 'SOFT',
      pitLap: 7 + Math.floor(random() * 7),
    };
  });
  const grid = cars.slice().sort((a, b) => a.pace + random() * 0.4 - (b.pace + random() * 0.4));
  grid.forEach((c, i) => Object.assign(c, {
    grid: i + 1, d: -i * 8, laps: 0, segmentsDone: 0, lapStart: PRE_START_S, sectorStart: PRE_START_S, tyreAge: 0, stint: 0,
    stops: 0, inPit: false, pitUntil: 0, pitOut: false, retired: false, stopped: false, finished: false, finishRank: 0,
    best: null, lastLap: null, lapNoise: 0, crossings: [], position: i + 1,
  }));
  const byNumber = Object.fromEntries(grid.map((c) => [c.number, c]));
  const retiree = grid[14];
  const penalised = grid[6];

  // ── The opening state, as a Subscribe reply would carry it ─────
  const state = {
    SessionInfo: {
      Meeting: { Key: 9001, Name: 'Harbour Grand Prix', OfficialName: 'HARBOUR GRAND PRIX (REHEARSAL)', Location: 'Harbour', Country: { Key: 901, Code: 'HBR', Name: 'Harbourland' }, Circuit: { Key: 9001, ShortName: 'Harbour Park' } },
      SessionStatus: 'Inactive', ArchiveStatus: { Status: 'None' }, Key: 90001, Type: 'Race', Name: 'Race',
      StartDate: '2026-06-01T14:01:00', EndDate: '2026-06-01T16:00:00', GmtOffset: '00:00:00', Path: '2026/2026-06-01_Harbour_Grand_Prix/2026-06-01_Race/', _kf: true,
    },
    SessionStatus: { Status: 'Inactive', _kf: true },
    SessionData: { Series: [], StatusSeries: [{ Utc: iso(T0), TrackStatus: 'AllClear' }], _kf: true },
    TrackStatus: { Status: '1', Message: 'AllClear', _kf: true },
    LapCount: { CurrentLap: 1, TotalLaps: LAPS, _kf: true },
    ExtrapolatedClock: { Utc: iso(T0), Remaining: '02:00:00', Extrapolating: false, _kf: true },
    DriverList: { _kf: true },
    TimingData: { Lines: {}, Withheld: false, _kf: true },
    TimingAppData: { Lines: {}, _kf: true },
    TimingStats: { Lines: {}, Withheld: false, SessionType: 'Race', _kf: true },
    RaceControlMessages: { Messages: [], _kf: true },
    WeatherData: { AirTemp: '23.4', Humidity: '48.0', Pressure: '1013.2', Rainfall: '0', TrackTemp: '36.8', WindDirection: '120', WindSpeed: '1.6', _kf: true },
  };
  grid.forEach((c) => {
    state.DriverList[c.number] = { RacingNumber: c.number, BroadcastName: `${c.first[0]} ${c.last}`, FullName: `${c.first} ${c.last}`, Tla: c.code, Line: c.grid, TeamName: c.team, TeamColour: c.colour, FirstName: c.first, LastName: c.last };
    state.TimingData.Lines[c.number] = {
      RacingNumber: c.number, Line: c.grid, Position: String(c.grid), ShowPosition: true, GapToLeader: '', IntervalToPositionAhead: { Value: '', Catching: false },
      Retired: false, InPit: false, PitOut: false, Stopped: false, Status: 0, NumberOfLaps: 0, NumberOfPitStops: 0, Sectors: emptySectors(),
      BestLapTime: { Value: '' }, LastLapTime: { Value: '', Status: 0, OverallFastest: false, PersonalFastest: false },
    };
    state.TimingAppData.Lines[c.number] = { RacingNumber: c.number, GridPos: String(c.grid), Line: c.grid, Stints: [{ Compound: c.compound, New: 'true', TyresNotChanged: '0', TotalLaps: 0, StartLaps: 0 }] };
  });
  lines.push({ kind: 'state', at: T0, data: state });

  // ── Race control and session state helpers ──────────────────────
  let rcmIndex = 0;
  const rcm = (t, fields) => msg(t, 'RaceControlMessages', { Messages: { [rcmIndex++]: { Utc: rcmUtc(ms(t)), ...fields } } });
  let statusIndex = 1;
  const trackStatus = (t, code, name) => {
    msg(t, 'TrackStatus', { Status: String(code), Message: name });
    msg(t, 'SessionData', { StatusSeries: { [statusIndex++]: { Utc: iso(ms(t)), TrackStatus: name } } });
  };
  const sessionStatus = (t, status) => {
    msg(t, 'SessionStatus', { Status: status, Started: status });
    msg(t, 'SessionData', { StatusSeries: { [statusIndex++]: { Utc: iso(ms(t)), SessionStatus: status } } });
  };

  rcm(5, { Category: 'Flag', Flag: 'GREEN', Scope: 'Track', Message: 'GREEN LIGHT - PIT EXIT OPEN' });
  rcm(40, { Category: 'Other', Message: 'PIT EXIT CLOSED' });

  // ── The race ────────────────────────────────────────────────────
  let t = 0;
  let started = false;
  let leaderLap = 1;
  let sc = 'none'; // none | yellow | deployed | in_this_lap
  let scAt = 0;
  let scEndLap = 0;
  let chequered = false;
  let finishCount = 0;
  let finalisedAt = null;
  let fastest = null;
  let lastTruth = -1;
  let lastWeather = 0;

  const lapTime = (c) => {
    if (sc === 'deployed' || sc === 'in_this_lap') return SC_LAP_TIME;
    return c.pace + COMPOUND[c.compound] + DEGRADATION[c.compound] * c.tyreAge + c.lapNoise;
  };
  const running = (c) => !c.retired && !c.finished;
  const order = () => grid.slice().sort((a, b) => {
    if (a.retired !== b.retired) return a.retired ? 1 : -1;
    // A car that has taken the flag stays ahead of every car still on its last lap.
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    if (a.finished && b.finished) return a.finishRank - b.finishRank;
    return b.d - a.d;
  });

  const pbRanking = (now) => {
    const ranked = grid.filter((c) => c.best).sort((a, b) => a.best.time - b.best.time);
    const lines2 = {};
    ranked.forEach((c, i) => { lines2[c.number] = { PersonalBestLapTime: { Value: fmtLap(c.best.time), Lap: c.best.lap, Position: i + 1 } }; });
    msg(now, 'TimingStats', { Lines: lines2 });
  };

  while (t < PRE_START_S + 3600) {
    t = Math.round((t + DT) * 100) / 100;

    if (!started && t >= PRE_START_S) {
      started = true;
      sessionStatus(t, 'Started');
      msg(t, 'ExtrapolatedClock', { Utc: iso(ms(t)), Remaining: '02:00:00', Extrapolating: true });
    }
    if (!started) continue;

    // Move every car, holding station behind a car it can't pass.
    const ranked = order();
    ranked.forEach((c, i) => {
      if (!running(c)) return;
      if (c.stopped) return;
      if (c.inPit) {
        if (t >= c.pitUntil) {
          c.inPit = false;
          c.pitOut = true;
          c.stops += 1;
          c.stint += 1;
          c.compound = c.compound === 'HARD' ? 'MEDIUM' : 'HARD';
          c.tyreAge = 0;
          line(t, c.number, { InPit: false, PitOut: true, NumberOfPitStops: c.stops });
          msg(t, 'TimingAppData', { Lines: { [c.number]: { Stints: { [c.stint]: { Compound: c.compound, New: 'true', TyresNotChanged: '0', TotalLaps: 0, StartLaps: 0 } } } } });
        }
        return;
      }
      let speed = TRACK_M / lapTime(c);
      const ahead = ranked[i - 1];
      // Behind the safety car the field closes up: cars far from the one ahead keep racing speed.
      if (sc !== 'none' && sc !== 'yellow' && i > 0 && ahead && ahead.d - c.d > FOLLOW_M * 2) speed = TRACK_M / (c.pace + 4);
      if (ahead && running(ahead) && !ahead.inPit) {
        const gap = ahead.d - c.d;
        const holding = sc !== 'none' || lapTime(ahead) - lapTime(c) < PASS_ADVANTAGE_S;
        if (gap > 0 && gap < FOLLOW_M && holding) speed = Math.min(speed, TRACK_M / lapTime(ahead) * (gap / FOLLOW_M));
      }
      c.d += speed * DT;
      c.speed = speed;
    });

    // Timing: first record every timing point crossed in this step, then report them in
    // the order they happened, so a car's interval can always see the car ahead's crossing.
    const crossed = [];
    grid.forEach((c) => {
      if (!running(c) || c.stopped || c.inPit || c.d < 0) return;
      const totalSegments = Math.floor(c.d / SEGMENT_M);
      for (let k = c.segmentsDone + 1; k <= totalSegments; k += 1) {
        // When the car actually crossed the timing point inside this step, not the end of the step.
        const crossedAt = c.speed ? Math.max(t - DT, t - (c.d - k * SEGMENT_M) / c.speed) : t;
        c.crossings[k] = crossedAt;
        crossed.push({ c, k, crossedAt });
      }
    });
    crossed.sort((a, b) => a.crossedAt - b.crossedAt).forEach(({ c, k, crossedAt }) => {
      if (!running(c)) return;
      c.segmentsDone = k;
      const inLap = ((k - 1) % SEGMENTS) + 1;
      let sector = 0;
      let index = inLap - 1;
      while (index >= SECTOR_SEGMENTS[sector]) { index -= SECTOR_SEGMENTS[sector]; sector += 1; }
      const patch = { Sectors: { [sector]: { Segments: { [index]: { Status: c.pitOut && k % SEGMENTS === 1 ? 2064 : 2048 } } } } };
      if (c.pitOut) { patch.PitOut = false; c.pitOut = false; }

      // Gap and interval at this timing point, against whoever crossed it first.
      const leaderK = Math.max(...grid.filter((x) => !x.retired).map((x) => x.segmentsDone));
      const ranked2 = order();
      const pos = ranked2.indexOf(c);
      if (pos === 0) {
        patch.GapToLeader = `LAP ${Math.min(LAPS, c.laps + 1)}`;
        patch.IntervalToPositionAhead = { Value: `LAP ${Math.min(LAPS, c.laps + 1)}` };
      } else {
        const lapsDown = Math.floor((leaderK - k) / SEGMENTS);
        const first = grid.map((x) => x.crossings[k]).filter((v) => v !== undefined).reduce((a, b) => Math.min(a, b), crossedAt);
        const ahead = ranked2[pos - 1];
        const aheadT = ahead.crossings[k];
        patch.GapToLeader = lapsDown >= 1 ? `${lapsDown} L` : fmtGap(crossedAt - first);
        patch.IntervalToPositionAhead = { Value: aheadT !== undefined ? fmtGap(crossedAt - aheadT) : `${Math.max(1, Math.floor((ahead.segmentsDone - k) / SEGMENTS))} L`, Catching: false };
      }

      const sectorEnd = index === SECTOR_SEGMENTS[sector] - 1;
      if (sectorEnd) {
        patch.Sectors[sector].Value = (crossedAt - c.sectorStart).toFixed(3);
        c.sectorStart = crossedAt;
      }
      line(t, c.number, patch);

      if (inLap === SEGMENTS) completeLap(c, crossedAt);
    });

    function completeLap(c, crossedAt) {
      const time = crossedAt - c.lapStart;
      c.lapStart = crossedAt;
      c.laps += 1;
      c.tyreAge += 1;
      c.lastLap = time;
      c.lapNoise = (random() - 0.5) * 0.6;
      const lap = { NumberOfLaps: c.laps, LastLapTime: { Value: fmtLap(time), PersonalFastest: false, OverallFastest: false } };
      let newPb = false;
      if (c.laps > 1 && (!c.best || time < c.best.time) && sc === 'none') {
        c.best = { time, lap: c.laps };
        lap.BestLapTime = { Value: fmtLap(time), Lap: c.laps };
        lap.LastLapTime.PersonalFastest = true;
        newPb = true;
        if (!fastest || time < fastest.time) {
          fastest = { time, number: c.number };
          lap.LastLapTime.OverallFastest = true;
        }
      }
      // A new lap starts with clean sectors.
      lap.Sectors = Object.fromEntries(SECTOR_SEGMENTS.map((n, s) => [s, { Value: '', Segments: Object.fromEntries(Array.from({ length: n }, (_, i) => [i, { Status: 0 }])) }]));
      line(t, c.number, lap);
      msg(t, 'TimingAppData', { Lines: { [c.number]: { Stints: { [c.stint]: { TotalLaps: c.tyreAge } } } } });
      if (newPb) pbRanking(t);

      if (chequered) {
        c.finished = true;
        finishCount += 1;
        c.finishRank = finishCount;
        return;
      }
      // The first car to complete the distance is the winner, and the flag is out for everyone after it.
      if (c.laps >= LAPS) {
        chequered = true;
        c.finished = true;
        finishCount = 1;
        c.finishRank = 1;
        sessionStatus(t, 'Finished');
        msg(t, 'ExtrapolatedClock', { Utc: iso(ms(t)), Remaining: '00:00:00', Extrapolating: false });
        rcm(t, { Lap: LAPS, Category: 'Flag', Flag: 'CHEQUERED', Scope: 'Track', Message: 'CHEQUERED FLAG' });
        return;
      }
      if (c.laps === c.pitLap && !c.inPit) {
        c.inPit = true;
        c.pitUntil = t + PIT_LOSS_S * (sc === 'none' ? 1 : 0.6) + random() * 3;
        line(t, c.number, { InPit: true });
      }
    }

    // Positions: tell the feed about every car whose place changed.
    const now = order();
    const moved = {};
    now.forEach((c, i) => {
      if (c.position !== i + 1) {
        c.position = i + 1;
        moved[c.number] = { Position: String(i + 1), Line: i + 1 };
      }
    });
    if (Object.keys(moved).length) msg(t, 'TimingData', { Lines: moved });

    // Lap count, the scripted incidents, and the flag.
    const leader = now[0];
    const lapNow = Math.min(LAPS, leader.laps + 1);
    if (!chequered && lapNow !== leaderLap) {
      leaderLap = lapNow;
      msg(t, 'LapCount', { CurrentLap: leaderLap });
      if (leaderLap === 5) rcm(t, { Lap: 5, Category: 'Other', Message: `CAR ${penalised.number} (${penalised.code}) TIME 1:20.441 DELETED - TRACK LIMITS AT TURN 4 LAP 4` });
      if (leaderLap === 7) rcm(t, { Lap: 7, Category: 'Other', Message: `FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR ${penalised.number} (${penalised.code}) - CAUSING A COLLISION` });
      if (sc === 'deployed' && leaderLap === scEndLap) {
        sc = 'in_this_lap';
        rcm(t, { Lap: leaderLap, Category: 'SafetyCar', Status: 'IN THIS LAP', Mode: 'SAFETY CAR', Message: 'SAFETY CAR IN THIS LAP' });
      } else if (sc === 'in_this_lap') {
        sc = 'none';
        trackStatus(t, 1, 'AllClear');
        rcm(t, { Lap: leaderLap, Category: 'Flag', Flag: 'GREEN', Scope: 'Track', Message: 'TRACK CLEAR' });
      }
    }
    if (sc === 'none' && !retiree.stopped && retiree.laps === 8 && retiree.segmentsDone % SEGMENTS === 10) {
      retiree.stopped = true;
      sc = 'yellow';
      scAt = t;
      line(t, retiree.number, { Stopped: true });
      trackStatus(t, 2, 'Yellow');
      rcm(t, { Lap: leaderLap, Category: 'Flag', Flag: 'DOUBLE YELLOW', Scope: 'Sector', Sector: 5, Message: 'DOUBLE YELLOW IN TRACK SECTOR 5' });
    }
    if (sc === 'yellow' && t - scAt >= 8) {
      sc = 'deployed';
      scEndLap = leaderLap + 2;
      retiree.retired = true;
      line(t, retiree.number, { Retired: true, Stopped: true });
      trackStatus(t, 4, 'SCDeployed');
      rcm(t, { Lap: leaderLap, Category: 'SafetyCar', Status: 'DEPLOYED', Mode: 'SAFETY CAR', Message: 'SAFETY CAR DEPLOYED' });
    }
    // Cars still in the pits at the flag, or lapped, finish when they next cross the line.
    if (chequered && finalisedAt === null && grid.every((c) => !running(c) || c.inPit)) {
      grid.filter((c) => c.inPit).forEach((c) => { c.finished = true; finishCount += 1; c.finishRank = finishCount; });
      finalisedAt = t + 60;
    }
    if (finalisedAt !== null && t >= finalisedAt) {
      sessionStatus(t, 'Finalised');
      break;
    }

    if (t - lastWeather >= 60) {
      lastWeather = t;
      msg(t, 'WeatherData', { AirTemp: (23.4 + t / 3600).toFixed(1), TrackTemp: (36.8 - t / 1800).toFixed(1) });
    }
    if (Math.floor(t) !== lastTruth) {
      lastTruth = Math.floor(t);
      lines.push({ kind: 'truth', at: ms(t), cars: Object.fromEntries(grid.map((c) => [c.number, { d: Math.round(c.d * 10) / 10, laps: c.laps, inPit: c.inPit, retired: c.retired, finished: c.finished }])) });
    }
  }
  return lines;
}

// Harbour Park, the rehearsal's fictional circuit, in MultiViewer's shape and units
// (decimetres), starting at the start line. Corners sit where the outline bends most.
function rehearsalCircuit() {
  const N = 240;
  const raw = Array.from({ length: N }, (_, i) => {
    const a = (i / N) * Math.PI * 2;
    const r = 1 + 0.22 * Math.sin(3 * a + 0.4) + 0.1 * Math.cos(5 * a) + 0.05 * Math.sin(7 * a + 1);
    return [r * Math.cos(a) * 1.7, r * Math.sin(a)];
  });
  let perimeter = 0;
  raw.forEach((p, i) => { const q = raw[(i + 1) % N]; perimeter += Math.hypot(q[0] - p[0], q[1] - p[1]); });
  const scale = (TRACK_M * 10) / perimeter;
  const pts = raw.map(([x, y]) => [Math.round(x * scale), Math.round(y * scale)]);
  const along = [0];
  for (let i = 1; i < N; i += 1) along.push(along[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const turn = pts.map((p, i) => {
    const a = pts[(i - 3 + N) % N];
    const b = pts[(i + 3) % N];
    const h1 = Math.atan2(p[1] - a[1], p[0] - a[0]);
    const h2 = Math.atan2(b[1] - p[1], b[0] - p[0]);
    return Math.abs(Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1)));
  });
  const picked = [];
  turn.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => {
    if (picked.length < 11 && i > 6 && picked.every((j) => Math.min(Math.abs(i - j), N - Math.abs(i - j)) > 12)) picked.push(i);
  });
  picked.sort((a, b) => a - b);
  return {
    circuitKey: 9001, circuitName: 'Harbour Park', year: 2026, rotation: 0,
    x: pts.map((p) => p[0]), y: pts.map((p) => p[1]),
    corners: picked.map((i, n) => ({ number: n + 1, length: along[i], trackPosition: { x: pts[i][0], y: pts[i][1] } })),
  };
}

// Standings and calendar for the rehearsal's fictional season: the Harbour Grand Prix is
// round 10, and these are the standings after round 9.
function rehearsalStandings() {
  const random = rng(77);
  const drivers = DRIVERS.map(([, code, first, last], i) => ({ code, name: `${first} ${last}`, team: TEAMS[Math.floor(i / 2)][0], points: Math.round(170 - i * 7.5 + random() * 12) }))
    .sort((a, b) => b.points - a.points).map((d, i) => ({ ...d, position: i + 1 }));
  const teams = new Map();
  drivers.forEach((d) => teams.set(d.team, (teams.get(d.team) || 0) + d.points));
  const constructors = [...teams.entries()].sort((a, b) => b[1] - a[1]).map(([team, points], i) => ({ team, points, position: i + 1 }));
  return { season: 2026, round: 9, drivers, constructors };
}

function rehearsalCalendar() {
  return { season: 2026, rounds: [{ round: 10, name: 'Harbour Grand Prix', circuitId: 'harbour', country: 'Harbourland', sessions: [{ type: 'race', name: 'Race', startsAt: '2026-06-01T14:01:00Z' }] }] };
}

// Writes the rehearsal into the recordings folder once; a new VERSION writes a new file.
function ensureRehearsal(recordingsDir) {
  const file = path.join(recordingsDir, REHEARSAL_ID);
  if (fs.existsSync(file)) return REHEARSAL_ID;
  fs.mkdirSync(recordingsDir, { recursive: true });
  const text = generateRehearsal().map((l) => JSON.stringify(l)).join('\n');
  fs.writeFileSync(`${file}.tmp`, `${text}\n`);
  fs.renameSync(`${file}.tmp`, file);
  return REHEARSAL_ID;
}

module.exports = { generateRehearsal, ensureRehearsal, rehearsalCircuit, rehearsalStandings, rehearsalCalendar, REHEARSAL_ID, LAPS, TRACK_M, SEGMENTS,
  // Shared with the qualifying and practice rehearsals.
  shared: { DRIVERS, TEAMS, rng, fmtLap, iso, rcmUtc, emptySectors, SECTOR_SEGMENTS, SEGMENT_M, DT, T0 } };
