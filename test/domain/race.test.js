const test = require('node:test');
const assert = require('node:assert');
const { SessionEngine } = require('../../server/domain/engine');
const { TimingState } = require('../../server/domain/state');
const { normalizeSession } = require('../../server/domain/normalize');
const { generateRehearsal, LAPS } = require('../../server/providers/rehearsal');

// ── Unit cases on hand-built snapshots ─────────────────────────────
function driver(number, position, extra = {}) {
  return { number, code: `C${number}`, team: 'T', teamColour: '888888', position, gridPosition: position, gapToLeader: position === 1 ? 'LAP 5' : `+${position}.000`, interval: '+1.000', laps: 4, pitStops: 0, inPit: false, pitOut: false, retired: false, stopped: false, ...extra };
}
function snap(at, order, over = {}) {
  return {
    at, session: { key: 1, type: 'race' }, status: 'running', track: { status: 'green', since: 0 }, laps: { current: 5, total: 50 },
    drivers: order.map((n, i) => driver(n, i + 1, (over.drivers || {})[n])), fastestLap: null, raceControl: [], ...over, ...{ drivers: order.map((n, i) => driver(n, i + 1, (over.drivers || {})[n])) },
  };
}
function run(snapshots) {
  const engine = new SessionEngine();
  return snapshots.flatMap((s) => engine.ingest(s, s.at).events);
}
const types = (events) => events.map((e) => e.type);

test('an overtake is announced once it holds for two snapshots', () => {
  const events = run([snap(0, ['1', '2', '3']), snap(250, ['1', '3', '2']), snap(500, ['1', '3', '2']), snap(750, ['1', '3', '2'])]);
  const passes = events.filter((e) => e.type === 'overtake');
  assert.deepStrictEqual(passes.map((e) => [e.number, e.on.number, e.forPosition]), [['3', '2', 2]]);
});

test('a one-snapshot flicker is not an overtake', () => {
  assert.deepStrictEqual(types(run([snap(0, ['1', '2']), snap(250, ['2', '1']), snap(500, ['1', '2']), snap(750, ['1', '2'])])), []);
});

test('places gained from a pit stop are not overtakes', () => {
  const inPit = { drivers: { 1: { inPit: true } } };
  const events = run([snap(0, ['1', '2', '3']), snap(250, ['2', '3', '1'], inPit), snap(500, ['2', '3', '1'], inPit)]);
  assert.ok(!types(events).includes('overtake'));
  assert.ok(types(events).includes('new_leader'), 'the leader still changed');
});

test('no overtakes under the safety car, on lap 1, or after the flag', () => {
  const under = (over) => run([snap(0, ['1', '2'], over), snap(250, ['2', '1'], over), snap(500, ['2', '1'], over)]).filter((e) => e.type === 'overtake');
  assert.deepStrictEqual(under({ track: { status: 'sc', since: 0 } }), []);
  assert.deepStrictEqual(under({ laps: { current: 1, total: 50 } }), []);
  assert.deepStrictEqual(under({ status: 'finished' }), []);
});

test('a leader lapping a backmarker is not an overtake', () => {
  const lapped = { drivers: { 3: { gapToLeader: '1 L' } } };
  const events = run([snap(0, ['1', '2', '3'], lapped), snap(250, ['1', '3', '2'], lapped), snap(500, ['1', '3', '2'], lapped)]);
  assert.ok(!types(events).includes('overtake'));
});

test('pit stops, retirements, penalties and fastest laps are reported once', () => {
  const base = snap(0, ['1', '2']);
  const later = snap(250, ['1', '2'], { drivers: { 2: { pitStops: 1 }, 1: {} } });
  later.drivers[0].retired = true;
  later.fastestLap = { number: '2', time: '1:20.000', lap: 4 };
  later.raceControl = [{ at: 100, lap: 5, category: 'Other', message: 'FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 2 (C2) - UNSAFE RELEASE', flag: null, number: null }];
  const again = { ...later, at: 500 };
  const events = run([base, later, again]);
  assert.deepStrictEqual(types(events).sort(), ['fastest_lap', 'penalty', 'pit', 'retirement']);
  assert.strictEqual(events.find((e) => e.type === 'penalty').code, 'C2');
});

test('a fastest lap set on the last lap, after the leader took the flag, is still reported', () => {
  const flag = snap(0, ['1', '2'], { status: 'finished', fastestLap: { number: '1', time: '1:29.000', lap: 51 } });
  const last = snap(250, ['1', '2'], { status: 'finished', fastestLap: { number: '2', time: '1:28.500', lap: 52 } });
  const events = run([snap(-250, ['1', '2'], { fastestLap: flag.fastestLap }), flag, last]);
  assert.deepStrictEqual(events.filter((e) => e.type === 'fastest_lap').map((e) => [e.code, e.time]), [['C2', '1:28.500']]);
});

test('when the feed moves from qualifying to the race, the race starts from its own baseline', () => {
  const quali = { ...snap(0, ['1', '2']), session: { key: 1, type: 'qualifying', part: 3 }, qualifying: { part: 3, entries: [20, 15, 10], cut: null } };
  const engine = new SessionEngine();
  engine.ingest(quali, 0);
  engine.ingest({ ...quali, at: 250 }, 250);
  const pitting = snap(500, ['1', '2'], { session: { key: 2, type: 'race' }, status: 'pre', drivers: { 2: { inPit: true } } });
  assert.deepStrictEqual(engine.ingest(pitting, 500).events, [], 'the first race snapshot is a baseline');
  const events = engine.ingest(snap(750, ['1', '2'], { session: { key: 2, type: 'race' } }), 750).events;
  assert.deepStrictEqual(types(events), ['session_status', 'lights_out']);
});

test('"no further action" is not a penalty', () => {
  const later = snap(250, ['1', '2']);
  later.raceControl = [{ at: 100, message: 'FIA STEWARDS: TIME PENALTY INVESTIGATION - NO FURTHER ACTION', number: null }];
  assert.deepStrictEqual(types(run([snap(0, ['1', '2']), later])), []);
});

// ── The rehearsal race, end to end ─────────────────────────────────
const lines = generateRehearsal();

function playRace() {
  const state = new TimingState();
  const engine = new SessionEngine();
  const events = [];
  const truths = [];
  let next = lines[0].at;
  lines.forEach((l) => {
    if (l.kind === 'truth') { truths.push(l); return; }
    state.apply(l.kind === 'state' ? { topic: '*', data: l.data, at: l.at } : { topic: l.topic, data: l.data, at: l.at });
    while (l.at >= next) {
      events.push(...engine.ingest(normalizeSession(state.topics, state.segmentAt, next), next).events);
      next += 250;
    }
  });
  return { events, truths };
}
const { events, truths } = playRace();
const ofType = (t) => events.filter((e) => e.type === t);

test('the rehearsal race produces each moment the right number of times', () => {
  assert.strictEqual(ofType('lights_out').length, 1);
  assert.strictEqual(ofType('chequered').length, 1);
  assert.strictEqual(ofType('lap1_summary').length, 1);
  assert.strictEqual(ofType('retirement').length, 1);
  assert.strictEqual(ofType('penalty').length, 1);
  assert.strictEqual(ofType('pit').length, 21);
  assert.ok(ofType('fastest_lap').length >= 1);
  assert.ok(ofType('overtake').length >= 1, 'the race has overtakes');
  assert.strictEqual(new Set(events.map((e) => e.key)).size, events.length, 'every moment has its own key');
});

test('every overtake in the rehearsal really happened on track', () => {
  ofType('overtake').forEach((e) => {
    const truth = truths.filter((t) => t.at <= e.at).at(-1);
    const by = truth.cars[e.number];
    const on = truth.cars[e.on.number];
    assert.ok(by.d >= on.d - 1, `${e.code} on ${e.on.code} at ${new Date(e.at).toISOString()}: ${by.d} vs ${on.d}`);
    assert.ok(!by.inPit && !on.inPit, `${e.code} on ${e.on.code}: a car was in the pits`);
  });
});

test('no overtakes are announced under the safety car or after the flag', () => {
  const sc = events.find((e) => e.type === 'track_status' && e.status === 'sc');
  const green = events.find((e) => e.type === 'track_status' && e.status === 'green' && e.from === 'sc');
  const flag = ofType('chequered')[0];
  assert.ok(sc && green && flag);
  const bad = ofType('overtake').filter((e) => (e.at > sc.at && e.at < green.at) || e.at > flag.at);
  assert.deepStrictEqual(bad, []);
  assert.strictEqual(flag.podium.length, 3);
  assert.strictEqual(ofType('lap1_summary')[0].gains.length > 0, true);
  assert.ok(LAPS > 0);
});

test('a red flag restart through Inactive is a restart, not a second lights out', () => {
  const { raceState } = require('../fixtures/race');
  const state = new TimingState();
  const engine = new SessionEngine();
  const t0 = Date.parse('2026-06-01T14:20:30.000Z');
  state.apply({ topic: '*', data: raceState(), at: t0 });
  const steps = [
    { Status: 'Started', Started: 'Started' },
    { Status: 'Aborted', Started: 'Started' },
    { Status: 'Inactive', Started: 'Started' },
    { Status: 'Started', Started: 'Started' },
  ];
  const events = steps.flatMap((data, i) => {
    const at = t0 + i * 1000;
    state.apply({ topic: 'SessionStatus', data, at });
    return engine.ingest(normalizeSession(state.topics, state.segmentAt, at), at).events;
  });
  assert.strictEqual(events.filter((e) => e.type === 'lights_out').length, 0);
  assert.strictEqual(events.filter((e) => e.type === 'restart').length, 1);
});
