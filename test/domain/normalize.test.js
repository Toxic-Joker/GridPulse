const test = require('node:test');
const assert = require('node:assert');
const { TimingState } = require('../../server/domain/state');
const { normalizeSession, sessionType } = require('../../server/domain/normalize');
const { raceState } = require('../fixtures/race');

const AT = Date.parse('2026-06-01T14:20:30.000Z');

function snapshotOf(patches = []) {
  const state = new TimingState();
  state.apply({ topic: '*', data: raceState(), at: AT });
  patches.forEach((p) => state.apply({ at: AT, ...p }));
  return normalizeSession(state.topics, state.segmentAt, AT);
}

test('session details and type come from SessionInfo', () => {
  const s = snapshotOf();
  assert.deepStrictEqual(
    [s.session.meetingName, s.session.type, s.session.year, s.session.circuitKey, s.status, s.track.status],
    ['Harbour Grand Prix', 'race', 2026, 777, 'running', 'green'],
  );
  assert.strictEqual(sessionType({ Type: 'Race', Name: 'Sprint' }), 'sprint');
  assert.strictEqual(sessionType({ Type: 'Qualifying', Name: 'Sprint Qualifying' }), 'sprint_qualifying');
  assert.strictEqual(sessionType({ Type: 'Qualifying', Name: 'Qualifying' }), 'qualifying');
  assert.strictEqual(sessionType({ Type: 'Practice', Name: 'Practice 2' }), 'practice');
});

test('drivers are sorted by position with tyres, grid and progress', () => {
  const s = snapshotOf();
  assert.deepStrictEqual(s.drivers.map((d) => d.code), ['ALP', 'BRV', 'CHL']);
  const brv = s.drivers[1];
  assert.deepStrictEqual(brv.tyre, { compound: 'SOFT', age: 14, isNew: false });
  assert.deepStrictEqual(brv.stints, [{ compound: 'SOFT', laps: 14, isNew: false }]);
  assert.strictEqual(brv.gridPosition, 1);
  assert.strictEqual(brv.teamColour, '3671C6');
  assert.deepStrictEqual(brv.progress, { sector: 1, segment: 10, segmentsPerLap: 24, at: null });
});

test('a position change in the feed reorders the tower', () => {
  const s = snapshotOf([{ topic: 'TimingData', data: { Lines: { 8: { Position: '1', Line: 1 }, 7: { Position: '2', Line: 2 } } } }]);
  assert.deepStrictEqual(s.drivers.map((d) => d.code), ['BRV', 'ALP', 'CHL']);
});

test('track status codes map to flags, with the time of the change', () => {
  const s = snapshotOf([
    { topic: 'TrackStatus', data: { Status: '4', Message: 'SCDeployed' } },
    { topic: 'SessionData', data: { StatusSeries: { 2: { Utc: '2026-06-01T14:20:10.000Z', TrackStatus: 'SCDeployed' } } } },
  ]);
  assert.strictEqual(s.track.status, 'sc');
  assert.strictEqual(s.track.since, Date.parse('2026-06-01T14:20:10.000Z'));
  assert.strictEqual(snapshotOf([{ topic: 'TrackStatus', data: { Status: '6' } }]).track.status, 'vsc');
  assert.strictEqual(snapshotOf([{ topic: 'TrackStatus', data: { Status: '5' } }]).track.status, 'red');
});

test('a replayed clock counts from when its message arrived, at the replay speed', () => {
  const state = new TimingState();
  state.apply({ topic: '*', data: raceState(), at: 1000 });
  const s = normalizeSession(state.topics, state.segmentAt, 11000, { clockAt: state.clockAt, rate: 20 });
  assert.strictEqual(s.clock.remainingMs, 100 * 60000 - 10000 * 20);
  assert.strictEqual(s.clock.rate, 20);
});

test('the session clock runs down from its last update, and stops at the flag', () => {
  assert.strictEqual(snapshotOf().clock.remainingMs, 100 * 60000 - 30000);
  const finished = snapshotOf([{ topic: 'SessionStatus', data: { Status: 'Finished' } }]);
  assert.deepStrictEqual([finished.status, finished.clock.running, finished.clock.remainingMs], ['finished', false, 100 * 60000]);
});

test('fastest lap, race control and weather are read', () => {
  const s = snapshotOf([{ topic: 'RaceControlMessages', data: { Messages: { 1: { Utc: '2026-06-01T14:15:00', Lap: 9, Category: 'Other', Message: 'CAR 9 TIME 1:13.1 DELETED - TRACK LIMITS' } } } }]);
  assert.deepStrictEqual(s.fastestLap, { number: '7', time: '1:12.000', lap: 9 });
  assert.strictEqual(s.raceControl.length, 2);
  assert.strictEqual(s.raceControl[1].at, Date.parse('2026-06-01T14:15:00Z'));
  assert.strictEqual(s.weather.trackTemp, 38.5);
  assert.strictEqual(s.weather.rainfall, false);
});

test('unknown team colours and missing data do not break the snapshot', () => {
  const s = snapshotOf([{ topic: 'DriverList', data: { 7: { TeamColour: '<script>' } } }]);
  assert.strictEqual(s.drivers[0].teamColour, '888888');
  const empty = normalizeSession({}, {}, AT);
  assert.deepStrictEqual([empty.drivers, empty.status, empty.track.status, empty.fastestLap], [[], 'pre', 'green', null]);
});

test('an out lap lasts from pit exit to the line, though PitOut clears after the first sector', () => {
  const state = new TimingState();
  state.apply({ topic: '*', data: raceState(), at: AT });
  const run = () => normalizeSession(state.topics, state.segmentAt, AT, { outLap: state.outLap }).drivers.find((d) => d.number === '9').run;
  const send = (line) => state.apply({ topic: 'TimingData', data: { Lines: { 9: line } }, at: AT });

  send({ InPit: true });
  assert.strictEqual(run(), 'garage');
  send({ InPit: false, PitOut: true, Sectors: { 0: { Segments: { 0: { Status: 2064 } } } } });
  assert.strictEqual(run(), 'out');
  // The feed clears PitOut at the end of the first sector (Las Vegas FP1, 2026).
  send({ PitOut: false, Sectors: { 0: { Segments: { 6: { Status: 2049 } } } } });
  assert.strictEqual(run(), 'out', 'still on the out lap');
  // A new lap's reset to Status 0 touches the last segment too; that is not the line.
  send({ Sectors: { 2: { Segments: { 8: { Status: 0 } } } } });
  assert.strictEqual(run(), 'out');
  send({ Sectors: { 2: { Segments: { 8: { Status: 2049 } } } } });
  assert.strictEqual(run(), 'track', 'crossing the line starts the first flying lap');

  send({ InPit: false, PitOut: true });
  send({ PitOut: false });
  send({ InPit: true });
  assert.strictEqual(run(), 'garage');
  send({ InPit: false });
  assert.strictEqual(run(), 'track', 'going back in ends the out lap');
});

test('after a red flag the feed goes Inactive again, which is still the red flag', () => {
  const status = (data) => snapshotOf([{ topic: 'SessionStatus', data }]).status;
  assert.strictEqual(status({ Status: 'Aborted', Started: 'Started' }), 'suspended');
  assert.strictEqual(status({ Status: 'Inactive', Started: 'Started' }), 'suspended');
  assert.strictEqual(status({ Status: 'Inactive', Started: 'Inactive' }), 'pre');
});

test('the clock keeps running through a red flag while the feed extrapolates', () => {
  const s = snapshotOf([{ topic: 'SessionStatus', data: { Status: 'Inactive', Started: 'Started' } }]);
  assert.deepStrictEqual([s.clock.running, s.clock.remainingMs], [true, 100 * 60000 - 30000]);
});
