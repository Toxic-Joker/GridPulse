// Estimated car positions when no real positions are available (live, no F1 TV token).
// Each car moves on from its last completed mini-sector at its recent pace, never past
// the next mini-sector timing hasn't confirmed, and in a race never just ahead of the car
// above it in the tower. Labelled "Estimated positions" on air. Mini-sectors are taken as evenly
// spaced round the lap (decision D11). Pure.

const { pointAtLap } = require('./track');

const DEFAULT_LAP_S = 90;
const NEUTRALISED = { sc: 1.45, vsc: 1.35, vsc_ending: 1.2, red: Infinity };
// Keeps a car a whisker short of the mini-sector it hasn't been timed through yet.
const BOUNDARY_MARGIN = 0.0005;
// The smallest gap kept between consecutive cars when the tower forces the order.
const ORDER_GAP = 0.0008;
// In practice and qualifying a car back in the garage can keep its half-finished lap with no
// pit flag. Once it has gone this many expected mini-sectors (and at least PARKED_MIN_S of
// session time) without a new one, it is taken off the radar rather than drawn frozen on
// track, where such cars piled up on the same spots (Las Vegas qualifying, Nov 2026).
const PARKED_SEGMENTS = 4;
const PARKED_MIN_S = 30;

// How far ahead of the car above a car may be drawn before it is taken as a lapped car rather
// than an estimate running ahead. About a mini-sector and a half.
const CLOSE_LAP = 0.06;

// A lap fraction difference brought into -0.5..0.5, so the line is not a cliff.
const wrap = (f) => (((f + 0.5) % 1) + 1) % 1 - 0.5;

function lapSeconds(text) {
  const m = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(String(text || ''));
  if (!m) return null;
  const s = (Number(m[1]) || 0) * 60 + Number(m[2]);
  return s > 30 && s < 300 ? s : null;
}

/**
 * @param {import('./types').SessionSnapshot} snapshot
 * @param {import('./types').Circuit|null} circuit  Without one, cars get lap fractions but no x/y.
 * @param {number} at    Wall-clock time of the frame.
 * @param {number} rate  How fast session time runs against the wall clock (replay speed; 1 live).
 * @returns {import('./types').RadarFrame}
 */
function estimate(snapshot, circuit, at, rate = 1) {
  const slow = NEUTRALISED[snapshot.track.status] ?? 1;
  // Only a race or sprint tower is in track order. Practice and qualifying rank by best lap,
  // so holding cars behind it there stacked them on one spot and threw them round the lap.
  const ordered = ['race', 'sprint'].includes(snapshot.session?.type);
  const cars = [];
  let ahead = null;
  snapshot.drivers.forEach((d) => {
    const car = { number: d.number, code: d.code, colour: d.teamColour, inPit: d.inPit, retired: d.retired || d.stopped, lap: null, x: null, y: null };
    cars.push(car);
    if (car.retired || car.inPit || !d.progress) return;

    const { segment, segmentsPerLap, at: segmentAt } = d.progress;
    const lapTime = (lapSeconds(d.lastLap) ?? lapSeconds(d.bestLap) ?? DEFAULT_LAP_S) * slow;
    const elapsed = segmentAt === null || !Number.isFinite(lapTime) ? 0 : Math.max(0, ((at - segmentAt) / 1000) * rate);
    // A completed lap shows every segment done until the feed resets them: that is the line.
    const done = segment >= segmentsPerLap ? 0 : segment / segmentsPerLap;
    const next = segment >= segmentsPerLap ? 1 / segmentsPerLap : (segment + 1) / segmentsPerLap;
    if (!ordered && elapsed > Math.max(PARKED_MIN_S, (PARKED_SEGMENTS * lapTime) / segmentsPerLap)) return;
    let lap = Math.min(done + elapsed / lapTime, next - BOUNDARY_MARGIN);

    // Never just in front of the car above it in the tower. Compared round the lap rather than
    // on laps run: the feed resets a car's mini-sectors at the line a moment before its lap
    // count goes up, and on laps run that briefly put the leader a lap back and dragged the
    // whole field to the line with it (Las Vegas race, Nov 2026). A car further ahead than
    // CLOSE_LAP is a lapped car or that same lag, not an estimate to correct.
    if (ordered && ahead && d.laps >= ahead.laps) {
      const lead = wrap(lap - ahead.lap);
      if (lead > -ORDER_GAP && lead < CLOSE_LAP) lap = (ahead.lap - ORDER_GAP + 1) % 1;
    }
    ahead = { lap, laps: d.laps };
    const total = d.laps + lap;
    car.lap = Math.round(lap * 100000) / 100000;
    // Laps run including this one's fraction: what the tower order is enforced on.
    car.laps = Math.round(total * 100000) / 100000;
    if (circuit) [car.x, car.y] = pointAtLap(circuit, lap).map(Math.round);
  });
  return { mode: 'estimated', at, cars };
}

module.exports = { estimate, lapSeconds, CLOSE_LAP };
