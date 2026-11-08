const test = require('node:test');
const assert = require('node:assert');
const { generateRehearsal, LAPS } = require('../../server/providers/rehearsal');
const { TimingState } = require('../../server/domain/state');
const { normalizeSession } = require('../../server/domain/normalize');

const lines = generateRehearsal();

// Plays the rehearsal through the real state merger and normalizer, calling back at every truth line.
function play(onTruth) {
  const state = new TimingState();
  let snapshot = null;
  lines.forEach((l) => {
    if (l.kind === 'state') state.apply({ topic: '*', data: l.data, at: l.at });
    else if (l.kind === 'msg') state.apply({ topic: l.topic, data: l.data, at: l.at });
    else if (l.kind === 'truth' && onTruth) onTruth(normalizeSession(state.topics, state.segmentAt, l.at), l);
  });
  snapshot = normalizeSession(state.topics, state.segmentAt, lines.at(-1).at);
  return { state, snapshot };
}

test('the rehearsal is the same race every time', () => {
  assert.deepStrictEqual(generateRehearsal().slice(-50), lines.slice(-50));
});

test('the tower always matches where the cars really are', () => {
  let checked = 0;
  play((snap, truth) => {
    if (snap.status !== 'running') return;
    const running = Object.entries(truth.cars).filter(([, c]) => !c.retired && !c.finished && !c.inPit);
    if (running.some(([, c]) => c.d < 0)) return; // still on the grid
    // Every pair of cars more than a metre apart must be in the right order (nose to tail is a tie).
    const towerIndex = Object.fromEntries(snap.drivers.map((d, i) => [d.number, i]));
    running.forEach(([a, ca]) => running.forEach(([b, cb]) => {
      if (ca.d - cb.d > 1) assert.ok(towerIndex[a] < towerIndex[b], `${a} is ahead of ${b} but not on the tower at ${new Date(truth.at).toISOString()}`);
    }));
    checked += 1;
  });
  assert.ok(checked > 1000, `only ${checked} seconds checked`);
});

test('nobody on the lead lap is shown a lap down to the car ahead', () => {
  const firstLap = lines.filter((l) => l.kind === 'msg' && l.topic === 'TimingData' && l.at < Date.parse('2026-06-01T14:03:00Z'));
  const lapped = firstLap.filter((l) => Object.values(l.data.Lines).some((v) => / L$/.test(v.IntervalToPositionAhead?.Value || '') || / L$/.test(v.GapToLeader || '')));
  assert.strictEqual(lapped.length, 0);
});

test('the race has the moments a rehearsal needs', () => {
  const { state, snapshot } = play();
  assert.strictEqual(snapshot.status, 'ended');
  assert.deepStrictEqual(snapshot.laps, { current: LAPS, total: LAPS });
  assert.strictEqual(snapshot.drivers.length, 22);

  const retired = snapshot.drivers.filter((d) => d.retired);
  assert.strictEqual(retired.length, 1);
  assert.strictEqual(snapshot.drivers.at(-1).retired, true, 'the retired car is at the bottom');

  const finishers = snapshot.drivers.filter((d) => !d.retired);
  assert.ok(finishers.every((d) => d.pitStops === 1), 'every finisher made its stop');
  assert.ok(finishers.every((d) => d.laps >= LAPS - 1), 'everyone took the flag');
  assert.strictEqual(finishers[0].laps, LAPS);
  assert.ok(finishers.slice(1).every((d) => /^\+\d+\.\d{3}$|^\d+ L$/.test(d.gapToLeader)), 'only the winner shows the lap count');
  assert.ok(new Set(finishers.slice(1).map((d) => d.gapToLeader.slice(-1))).size > 1, 'gaps are not all on the same fraction');
  assert.ok(snapshot.fastestLap?.time, 'a fastest lap is set');

  const track = state.topics.SessionData.StatusSeries.map((e) => e.TrackStatus).filter(Boolean);
  assert.deepStrictEqual(track, ['AllClear', 'Yellow', 'SCDeployed', 'AllClear']);
  const messages = snapshot.raceControl.map((m) => m.message);
  ['SAFETY CAR DEPLOYED', 'SAFETY CAR IN THIS LAP', 'CHEQUERED FLAG'].forEach((m) => assert.ok(messages.includes(m), m));
  assert.ok(messages.some((m) => /5 SECOND TIME PENALTY/.test(m)));
  assert.ok(messages.some((m) => /DELETED - TRACK LIMITS/.test(m)));
});
