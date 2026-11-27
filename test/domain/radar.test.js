const test = require('node:test');
const assert = require('node:assert');
const zlib = require('node:zlib');
const { buildCircuit, pointAtLap, lapFractionAt, circuitForOverlay } = require('../../server/domain/track');
const { estimate, lapSeconds, CLOSE_LAP } = require('../../server/domain/estimator');
const { toRadarFrame } = require('../../server/domain/positions');
const { TimingState } = require('../../server/domain/state');
const { normalizeSession } = require('../../server/domain/normalize');
const { generateRehearsal, rehearsalCircuit, TRACK_M, SEGMENTS } = require('../../server/providers/rehearsal');

test('a lap fraction maps to a point on the outline and back', () => {
  const circuit = buildCircuit(rehearsalCircuit());
  [0, 0.1, 0.5, 0.999].forEach((f) => {
    const [x, y] = pointAtLap(circuit, f);
    assert.ok(Math.abs(lapFractionAt(circuit, x, y) - f) < 0.001, `fraction ${f}`);
  });
  const overlay = circuitForOverlay(circuit);
  assert.strictEqual(overlay.outline.length, 240);
  assert.strictEqual(overlay.corners.length, 11);
});

test('the start line is found from the corners even when the outline starts elsewhere', () => {
  const payload = rehearsalCircuit();
  const shift = 60;
  const rotated = { ...payload, x: [...payload.x.slice(shift), ...payload.x.slice(0, shift)], y: [...payload.y.slice(shift), ...payload.y.slice(0, shift)] };
  const a = buildCircuit(payload);
  const b = buildCircuit(rotated);
  const [ax, ay] = pointAtLap(a, 0.3);
  const [bx, by] = pointAtLap(b, 0.3);
  assert.ok(Math.hypot(ax - bx, ay - by) < 50, 'same point 30% round the lap');
});

test('lap times are read from the tower', () => {
  assert.strictEqual(lapSeconds('1:18.630'), 78.63);
  assert.strictEqual(lapSeconds(''), null);
  assert.strictEqual(lapSeconds('LAP 3'), null);
});

test('real positions become a radar frame, and stale ones are refused', () => {
  const snapshot = { drivers: [{ number: '7', code: 'ALP', teamColour: 'E8002D', inPit: false, retired: false, stopped: false }] };
  const position = { Timestamp: 't', Entries: { 7: { Status: 'OnTrack', X: 120, Y: -40, Z: 0 } } };
  assert.deepStrictEqual(toRadarFrame(position, 1000, snapshot, 2000).cars[0].x, 120);
  assert.strictEqual(toRadarFrame(position, 1000, snapshot, 20000), null);
  const state = new TimingState();
  state.apply({ topic: 'Position.z', data: zlib.deflateRawSync(Buffer.from(JSON.stringify({ Position: [position] }))).toString('base64'), at: 5 });
  assert.strictEqual(state.positionAt, 5);
});

// ── Accuracy against the rehearsal's true positions (PRD open question 3) ──
test('estimated positions stay within one mini-sector of the truth, in tower order', (t) => {
  const lines = generateRehearsal();
  const state = new TimingState();
  const errors = [];
  lines.forEach((l) => {
    if (l.kind === 'state') state.apply({ topic: '*', data: l.data, at: l.at });
    else if (l.kind === 'msg') state.apply({ topic: l.topic, data: l.data, at: l.at });
    else if (l.kind === 'truth') {
      const snap = normalizeSession(state.topics, state.segmentAt, l.at);
      if (snap.status !== 'running' || snap.track.status !== 'green') return;
      const frame = estimate(snap, null, l.at, 1);
      let above = null;
      frame.cars.forEach((car) => {
        const truth = l.cars[car.number];
        const driver = snap.drivers.find((d) => d.number === car.number);
        if (car.lap === null || truth.d < 0 || truth.inPit || truth.finished || truth.retired) return;
        const trueLap = (truth.d / TRACK_M) % 1;
        const diff = Math.abs(car.lap - trueLap);
        errors.push(Math.min(diff, 1 - diff) * TRACK_M);
        // Compared round the lap: a car may only be further ahead than CLOSE_LAP (lapped, or the
        // lap count lagging at the line), never just ahead of the car above it.
        const lead = (((car.lap - (above?.lap ?? 0) + 0.5) % 1) + 1) % 1 - 0.5;
        assert.ok(driver && !(above && driver.laps >= above.laps && lead > 1e-6 && lead < CLOSE_LAP), `${car.code} drawn just ahead of the car above it`);
        above = { lap: car.lap, laps: driver.laps };
      });
    }
  });
  const segment = TRACK_M / SEGMENTS;
  const within = errors.filter((e) => e <= segment).length / errors.length;
  const sorted = errors.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  assert.ok(errors.length > 10000, `${errors.length} samples`);
  assert.ok(within >= 0.9, `only ${(within * 100).toFixed(1)}% within one mini-sector (${segment.toFixed(0)} m)`);
  assert.ok(median < segment / 2, `median error ${median.toFixed(0)} m`);
  t.diagnostic(`estimator: ${(within * 100).toFixed(1)}% within ${segment.toFixed(0)} m, median ${median.toFixed(0)} m, p95 ${sorted[Math.floor(sorted.length * 0.95)].toFixed(0)} m`);
});

// ── Estimated radar regressions seen at Las Vegas, Nov 2026 (synthetic data) ──
const car = (number, laps, segment, at, extra = {}) => ({
  number, code: `C${number}`, teamColour: '888888', inPit: false, retired: false, stopped: false,
  laps, lastLap: '1:40.000', progress: { segment, segmentsPerLap: 20, at }, ...extra,
});
const snap = (type, drivers) => ({ session: { type }, track: { status: 'green' }, drivers });

test('qualifying cars are drawn where they are, not held behind the tower order', () => {
  // P1 by best lap is at the start of its lap; P2 is three quarters round.
  const frame = estimate(snap('qualifying', [car('1', 4, 1, 0), car('2', 7, 15, 0)]), null, 1000, 1);
  assert.ok(frame.cars[1].lap > 0.7, `P2 drawn at ${frame.cars[1].lap}`);
});

test('in a race a car is still kept just behind the car above it', () => {
  // P2's estimate has run a little ahead of P1 in the same mini-sector.
  const frame = estimate(snap('race', [car('1', 5, 10, 0), car('2', 5, 10, -3000)]), null, 1000, 1);
  assert.ok(frame.cars[1].lap < frame.cars[0].lap, 'P2 behind P1');
});

test('the leader crossing the line before its lap count goes up does not drag the field back', () => {
  // P1's mini-sectors have reset (segment 1) but its lap count still says 5; P2 is near the end of lap 6.
  const frame = estimate(snap('race', [car('1', 5, 1, 0), car('2', 5, 19, 0)]), null, 1000, 1);
  assert.ok(frame.cars[1].lap > 0.9, `P2 drawn at ${frame.cars[1].lap}`);
});

test('a practice car with no new mini-sector for minutes is off the radar, not frozen on track', () => {
  const frame = estimate(snap('practice', [car('1', 3, 8, 0), car('2', 3, 8, 170000)]), null, 180000, 1);
  assert.strictEqual(frame.cars[0].lap, null);
  assert.ok(frame.cars[1].lap > 0.4);
});

test('a recoloured mini-sector does not restart the clock; a new one does', () => {
  const state = new TimingState();
  const sectors = (statuses) => ({ 0: { Segments: Object.fromEntries(statuses.map((s, i) => [i, { Status: s }])) } });
  state.apply({ topic: 'TimingData', data: { Lines: { 1: { Sectors: sectors([2049, 2049, 0, 0]) } } }, at: 1000 });
  state.apply({ topic: 'TimingData', data: { Lines: { 1: { Sectors: { 0: { Segments: { 1: { Status: 2051 } } } } } } }, at: 4000 });
  assert.strictEqual(state.segmentAt['1'], 1000);
  state.apply({ topic: 'TimingData', data: { Lines: { 1: { Sectors: { 0: { Segments: { 2: { Status: 2049 } } } } } } }, at: 6000 });
  assert.strictEqual(state.segmentAt['1'], 6000);
});
