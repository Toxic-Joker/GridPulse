const test = require('node:test');
const assert = require('node:assert');
const zlib = require('node:zlib');
const { buildCircuit, pointAtLap, lapFractionAt, circuitForOverlay } = require('../../server/domain/track');
const { estimate, lapSeconds } = require('../../server/domain/estimator');
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
      let previousTotal = Infinity;
      frame.cars.forEach((car) => {
        const truth = l.cars[car.number];
        const driver = snap.drivers.find((d) => d.number === car.number);
        if (car.lap === null || truth.d < 0 || truth.inPit || truth.finished || truth.retired) return;
        const trueLap = (truth.d / TRACK_M) % 1;
        const diff = Math.abs(car.lap - trueLap);
        errors.push(Math.min(diff, 1 - diff) * TRACK_M);
        assert.ok(driver && car.laps < previousTotal + 1e-9, `${car.code} drawn ahead of the car above it`);
        previousTotal = car.laps;
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
