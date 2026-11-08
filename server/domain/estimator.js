// Estimated car positions when no real positions are available (live, no F1 TV token).
// Each car moves on from its last completed mini-sector at its recent pace, never past
// the next mini-sector timing hasn't confirmed, and never ahead of a car above it in
// the tower. Labelled "Estimated positions" on air. Mini-sectors are taken as evenly
// spaced round the lap (decision D11). Pure.

const { pointAtLap } = require('./track');

const DEFAULT_LAP_S = 90;
const NEUTRALISED = { sc: 1.45, vsc: 1.35, vsc_ending: 1.2, red: Infinity };
// Keeps a car a whisker short of the mini-sector it hasn't been timed through yet.
const BOUNDARY_MARGIN = 0.0005;
// The smallest gap kept between consecutive cars when the tower forces the order.
const ORDER_GAP = 0.0008;

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
    let lap = Math.min(done + elapsed / lapTime, next - BOUNDARY_MARGIN);
    let total = d.laps + lap;

    // Never in front of the car above it in the tower.
    if (ahead && total > ahead.total - ORDER_GAP) {
      total = ahead.total - ORDER_GAP;
      lap = ((total % 1) + 1) % 1;
    }
    ahead = { total };
    car.lap = Math.round(lap * 100000) / 100000;
    // Laps run including this one's fraction: what the tower order is enforced on.
    car.laps = Math.round(total * 100000) / 100000;
    if (circuit) [car.x, car.y] = pointAtLap(circuit, lap).map(Math.round);
  });
  return { mode: 'estimated', at, cars };
}

module.exports = { estimate, lapSeconds };
