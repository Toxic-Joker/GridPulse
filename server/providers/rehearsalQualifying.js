// Rehearsal qualifying and practice at the fictional Harbour Grand Prix, written as
// recordings like the rehearsal race. Cars leave the garage, do an out lap, one or more
// flying laps and an in lap. Qualifying runs Q1/Q2/Q3 with the knockouts the feed
// reports through SessionPart, NoEntries, BestLapTimes and KnockedOut.
// Shapes follow community knowledge of the feed; check against Las Vegas (Nov 2026).

const fs = require('fs');
const path = require('path');
const { shared, TRACK_M } = require('./rehearsal');

const { DRIVERS, TEAMS, rng, fmtLap, iso, rcmUtc, emptySectors, SECTOR_SEGMENTS, SEGMENT_M, DT, T0 } = shared;
const VERSION = 1;
const QUALIFYING_ID = `rehearsal-harbour-gp-quali-v${VERSION}.jsonl`;
const PRACTICE_ID = `rehearsal-harbour-gp-fp1-v${VERSION}.jsonl`;
const SEGMENTS = SECTOR_SEGMENTS.reduce((a, b) => a + b, 0);
const ENTRIES = [22, 16, 10];
const PRE_S = 60;
const PART_GAP_S = 150;
const KIND = {
  qualifying: { key: 90002, type: 'Qualifying', name: 'Qualifying', parts: [480, 420, 360], runs: 2, flying: [1, 1], day: '2026-05-31' },
  practice: { key: 90003, type: 'Practice', name: 'Practice 1', parts: [1200], runs: 4, flying: [2, 3], day: '2026-05-30' },
};

function generateSession(kind = 'qualifying', { seed = 2027 } = {}) {
  const k = KIND[kind];
  const qualifying = kind === 'qualifying';
  const random = rng(seed);
  const lines = [];
  const ms = (t) => T0 + Math.round(t * 1000);
  const msg = (t, topic, data) => lines.push({ kind: 'msg', at: ms(t), topic, data, utc: iso(ms(t)) });
  const line = (t, number, data) => msg(t, 'TimingData', { Lines: { [number]: data } });

  const cars = DRIVERS.map(([number, code, first, last], i) => ({
    number, code, first, last, team: TEAMS[Math.floor(i / 2)][0], colour: TEAMS[Math.floor(i / 2)][1],
    pace: 77.6 + Math.floor(i / 2) * 0.2 + random() * 0.45,
    mode: 'garage', d: 0, segmentsDone: 0, lapStart: 0, sectorStart: 0, laps: 0, flyingLeft: 0,
    runs: [], best: [], knockedOut: false, koRank: 0, position: i + 1, crossings: [], speed: 0, lastLap: null, deleteNext: false,
  }));
  const byNumber = Object.fromEntries(cars.map((c) => [c.number, c]));
  const deleter = cars[9];

  // ── Opening state ───────────────────────────────────────────────
  const state = {
    SessionInfo: {
      Meeting: { Key: 9001, Name: 'Harbour Grand Prix', OfficialName: 'HARBOUR GRAND PRIX (REHEARSAL)', Location: 'Harbour', Country: { Key: 901, Code: 'HBR', Name: 'Harbourland' }, Circuit: { Key: 9001, ShortName: 'Harbour Park' } },
      ArchiveStatus: { Status: 'None' }, Key: k.key, Type: k.type, Name: k.name,
      StartDate: `${k.day}T14:01:00`, EndDate: `${k.day}T15:00:00`, GmtOffset: '00:00:00', Path: `2026/2026-06-01_Harbour_Grand_Prix/${k.day}_${k.name.replace(' ', '_')}/`, _kf: true,
    },
    SessionStatus: { Status: 'Inactive', _kf: true },
    SessionData: { Series: [], StatusSeries: [{ Utc: iso(T0), TrackStatus: 'AllClear' }], _kf: true },
    TrackStatus: { Status: '1', Message: 'AllClear', _kf: true },
    ExtrapolatedClock: { Utc: iso(T0), Remaining: fmtClock(k.parts[0]), Extrapolating: false, _kf: true },
    DriverList: { _kf: true },
    TimingData: { Lines: {}, Withheld: false, _kf: true, ...(qualifying ? { NoEntries: ENTRIES, SessionPart: 1, CutOffTime: '', CutOffPercentage: '107' } : {}) },
    TimingAppData: { Lines: {}, _kf: true },
    TimingStats: { Lines: {}, Withheld: false, SessionType: k.type, _kf: true },
    RaceControlMessages: { Messages: [], _kf: true },
    WeatherData: { AirTemp: '22.8', Humidity: '50.0', Pressure: '1013.0', Rainfall: '0', TrackTemp: '35.1', WindDirection: '110', WindSpeed: '1.4', _kf: true },
  };
  cars.forEach((c) => {
    state.DriverList[c.number] = { RacingNumber: c.number, BroadcastName: `${c.first[0]} ${c.last}`, FullName: `${c.first} ${c.last}`, Tla: c.code, Line: c.position, TeamName: c.team, TeamColour: c.colour, FirstName: c.first, LastName: c.last };
    state.TimingData.Lines[c.number] = {
      RacingNumber: c.number, Line: c.position, Position: String(c.position), ShowPosition: false, InPit: true, PitOut: false, Stopped: false, Retired: false, KnockedOut: false,
      NumberOfLaps: 0, Sectors: emptySectors(), BestLapTime: { Value: '' }, LastLapTime: { Value: '', PersonalFastest: false, OverallFastest: false },
      ...(qualifying ? { BestLapTimes: [{ Value: '' }, {}, {}], Stats: [{ TimeDiffToFastest: '' }, { TimeDiffToFastest: '' }, { TimeDiffToFastest: '' }], Cutoff: false } : { TimeDiffToFastest: '' }),
    };
    state.TimingAppData.Lines[c.number] = { RacingNumber: c.number, Line: c.position, Stints: [{ Compound: 'SOFT', New: 'true', TyresNotChanged: '0', TotalLaps: 0, StartLaps: 0 }] };
  });
  lines.push({ kind: 'state', at: T0, data: state });

  let rcmIndex = 0;
  const rcm = (t, fields) => msg(t, 'RaceControlMessages', { Messages: { [rcmIndex++]: { Utc: rcmUtc(ms(t)), ...fields } } });
  let statusIndex = 1;
  let seriesIndex = 0;
  const sessionStatus = (t, status) => {
    msg(t, 'SessionStatus', { Status: status, Started: status });
    msg(t, 'SessionData', { StatusSeries: { [statusIndex++]: { Utc: iso(ms(t)), SessionStatus: status } } });
  };

  // ── Order: timed cars by their best in this part, then untimed, then those knocked out ──
  const order = (part) => {
    const active = cars.filter((c) => !c.knockedOut);
    const timed = active.filter((c) => c.best[part - 1]).sort((a, b) => a.best[part - 1] - b.best[part - 1]);
    const untimed = active.filter((c) => !c.best[part - 1]).sort((a, b) => a.position - b.position);
    const out = cars.filter((c) => c.knockedOut).sort((a, b) => a.koRank - b.koRank);
    return [...timed, ...untimed, ...out];
  };
  const publishOrder = (t, part) => {
    const moved = {};
    const ranked = order(part);
    ranked.forEach((c, i) => {
      if (c.position !== i + 1) { c.position = i + 1; moved[c.number] = { Position: String(i + 1), Line: i + 1, ShowPosition: true }; }
    });
    if (Object.keys(moved).length) msg(t, 'TimingData', { Lines: moved });
    // Gaps to the fastest in this part.
    const timed = ranked.filter((c) => !c.knockedOut && c.best[part - 1]);
    const fastest = timed[0]?.best[part - 1];
    const gaps = {};
    timed.forEach((c, i) => {
      const value = i === 0 ? '' : `+${(c.best[part - 1] - fastest).toFixed(3)}`;
      gaps[c.number] = qualifying ? { Stats: { [part - 1]: { TimeDiffToFastest: value } } } : { TimeDiffToFastest: value };
    });
    if (timed.length) msg(t, 'TimingData', { Lines: gaps });
    const stats = {};
    ranked.filter((c) => Math.min(...c.best.filter(Boolean))).forEach((c) => {
      const b = Math.min(...c.best.filter(Boolean));
      if (Number.isFinite(b)) stats[c.number] = { PersonalBestLapTime: { Value: fmtLap(b), Position: 0 } };
    });
    Object.entries(stats).sort((a, b) => Math.min(...byNumber[a[0]].best.filter(Boolean)) - Math.min(...byNumber[b[0]].best.filter(Boolean)))
      .forEach(([, v], i) => { v.PersonalBestLapTime.Position = i + 1; });
    if (Object.keys(stats).length) msg(t, 'TimingStats', { Lines: stats });
  };

  // ── The session, part by part ───────────────────────────────────
  let t = 0;
  let lastTruth = -1;
  const step = () => { t = Math.round((t + DT) * 100) / 100; };
  rcm(5, { Category: 'Flag', Flag: 'GREEN', Scope: 'Track', Message: 'GREEN LIGHT - PIT EXIT OPEN' });

  k.parts.forEach((duration, p) => {
    const part = p + 1;
    const start = p === 0 ? PRE_S : t + PART_GAP_S;
    while (t < start) step();
    if (qualifying) {
      msg(t, 'TimingData', { SessionPart: part });
      msg(t, 'SessionData', { Series: { [seriesIndex++]: { Utc: iso(ms(t)), QualifyingPart: part } } });
    }
    sessionStatus(t, 'Started');
    msg(t, 'ExtrapolatedClock', { Utc: iso(ms(t)), Remaining: fmtClock(duration), Extrapolating: true });
    const end = t + duration;
    cars.filter((c) => !c.knockedOut).forEach((c) => {
      c.runs = Array.from({ length: k.runs }, (_, r) => start + duration * ((r + 0.15 + random() * 0.4) / k.runs) * (r === k.runs - 1 && qualifying ? 1 : 0.95));
    });
    if (p === 0) deleter.deleteNext = qualifying ? true : false;

    while (true) {
      step();
      const open = t < end;
      cars.forEach((c) => {
        if (c.knockedOut) return;
        if (c.mode === 'garage') {
          if (open && c.runs.length && t >= c.runs[0]) {
            c.runs.shift();
            c.mode = 'out';
            c.flyingLeft = k.flying[0] + Math.floor(random() * (k.flying[1] - k.flying[0] + 1));
            c.d = Math.ceil(c.d / TRACK_M) * TRACK_M;
            c.segmentsDone = Math.floor(c.d / SEGMENT_M);
            c.lapStart = t;
            c.sectorStart = t;
            line(t, c.number, { InPit: false, PitOut: true });
          }
          return;
        }
        // The track gets faster through each part, so late runs can lift a car out of the drop zone.
        if (c.mode === 'flying' && c.lapNoise === undefined) c.lapNoise = (random() - 0.5) * 0.7;
        const evolution = 0.35 * Math.min(1, (t - start) / duration);
        const lapTime = c.mode === 'flying' ? c.pace - part * 0.12 - evolution + c.lapNoise : c.pace * 1.32;
        c.speed = TRACK_M / lapTime;
        c.d += c.speed * DT;
      });

      // Timing points, reported in the order they were crossed.
      const crossed = [];
      cars.forEach((c) => {
        if (c.mode === 'garage') return;
        for (let s = c.segmentsDone + 1; s <= Math.floor(c.d / SEGMENT_M); s += 1) {
          crossed.push({ c, s, at: Math.max(t - DT, t - (c.d - s * SEGMENT_M) / c.speed) });
        }
      });
      crossed.sort((a, b) => a.at - b.at).forEach(({ c, s, at }) => {
        c.segmentsDone = s;
        const inLap = ((s - 1) % SEGMENTS) + 1;
        let sector = 0;
        let index = inLap - 1;
        while (index >= SECTOR_SEGMENTS[sector]) { index -= SECTOR_SEGMENTS[sector]; sector += 1; }
        const patch = { Sectors: { [sector]: { Segments: { [index]: { Status: c.mode === 'flying' ? 2049 : 2064 } } } } };
        if (inLap === 1 && c.mode === 'out') patch.PitOut = false;
        if (index === SECTOR_SEGMENTS[sector] - 1) {
          patch.Sectors[sector].Value = (at - c.sectorStart).toFixed(3);
          c.sectorStart = at;
        }
        line(t, c.number, patch);
        if (inLap === SEGMENTS) completeLap(c, at, part, open);
      });

      if (!open && cars.every((c) => c.mode === 'garage' || c.knockedOut)) break;
      if (Math.floor(t) !== lastTruth) {
        lastTruth = Math.floor(t);
        lines.push({ kind: 'truth', at: ms(t), cars: Object.fromEntries(cars.map((c) => [c.number, { d: Math.round(c.d * 10) / 10, inPit: c.mode === 'garage', retired: c.knockedOut, finished: false }])) });
      }
    }

    // The part is over: the slowest cars are out.
    msg(t, 'ExtrapolatedClock', { Utc: iso(ms(t)), Remaining: '00:00:00', Extrapolating: false });
    sessionStatus(t, 'Finished');
    if (qualifying && ENTRIES[part]) {
      const ranked = order(part);
      const out = ranked.filter((c) => !c.knockedOut).slice(ENTRIES[part]);
      out.forEach((c, i) => {
        c.knockedOut = true;
        c.koRank = (3 - part) * 100 + i;
        line(t, c.number, { KnockedOut: true });
      });
      publishOrder(t, part + 1);
    }
  });

  rcm(t + 1, { Category: 'Flag', Flag: 'CHEQUERED', Scope: 'Track', Message: 'CHEQUERED FLAG' });
  t += 60;
  sessionStatus(t, 'Finalised');
  return lines;

  function completeLap(c, at, part, open) {
    const time = at - c.lapStart;
    c.lapStart = at;
    c.laps += 1;
    c.lapNoise = undefined;
    const patch = { NumberOfLaps: c.laps, LastLapTime: { Value: fmtLap(time), PersonalFastest: false, OverallFastest: false } };
    if (c.mode === 'flying') {
      if (c.deleteNext) {
        c.deleteNext = false;
        rcm(at, { Lap: c.laps, Category: 'Other', Message: `CAR ${c.number} (${c.code}) TIME ${fmtLap(time)} DELETED - TRACK LIMITS AT TURN 9 LAP ${c.laps} ${rcmUtc(ms(at)).slice(11, 19)}` });
      } else if (!c.best[part - 1] || time < c.best[part - 1]) {
        c.best[part - 1] = time;
        patch.LastLapTime.PersonalFastest = true;
        patch.BestLapTime = { Value: fmtLap(time), Lap: c.laps };
        if (qualifying) patch.BestLapTimes = { [part - 1]: { Value: fmtLap(time), Lap: c.laps } };
      }
      c.flyingLeft -= 1;
      c.mode = c.flyingLeft > 0 && open ? 'flying' : 'in';
    } else if (c.mode === 'out') {
      c.mode = open ? 'flying' : 'in';
    } else if (c.mode === 'in') {
      c.mode = 'garage';
      patch.InPit = true;
    }
    patch.Sectors = Object.fromEntries(SECTOR_SEGMENTS.map((n, s) => [s, { Value: '', Segments: Object.fromEntries(Array.from({ length: n }, (_, i) => [i, { Status: 0 }])) }]));
    line(t, c.number, patch);
    msg(t, 'TimingAppData', { Lines: { [c.number]: { Stints: { 0: { TotalLaps: c.laps } } } } });
    if (patch.BestLapTime) publishOrder(t, part);
  }
}

function fmtClock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((v) => String(v).padStart(2, '0')).join(':');
}

function ensureSessionRehearsals(recordingsDir) {
  fs.mkdirSync(recordingsDir, { recursive: true });
  [[QUALIFYING_ID, 'qualifying'], [PRACTICE_ID, 'practice']].forEach(([id, kind]) => {
    const file = path.join(recordingsDir, id);
    if (fs.existsSync(file)) return;
    fs.writeFileSync(`${file}.tmp`, `${generateSession(kind).map((l) => JSON.stringify(l)).join('\n')}\n`);
    fs.renameSync(`${file}.tmp`, file);
  });
}

module.exports = { generateSession, ensureSessionRehearsals, QUALIFYING_ID, PRACTICE_ID, ENTRIES };
