const test = require('node:test');
const assert = require('node:assert');
const { pointsFor } = require('../../server/domain/points');
const { SessionEngine } = require('../../server/domain/engine');
const { isArchivePath, archiveUrl } = require('../../server/providers/archive');

const snap = (over = {}) => ({
  at: 0,
  session: { key: 1, type: 'race' },
  status: 'running',
  track: { status: 'green', since: 0 },
  laps: { current: 5, total: 50 },
  drivers: [],
  fastestLap: null,
  raceControl: [],
  ...over,
});

test('race and sprint points, no fastest-lap point', () => {
  assert.strictEqual(pointsFor('race', 1), 25);
  assert.strictEqual(pointsFor('race', 10), 1);
  assert.strictEqual(pointsFor('race', 11), 0);
  assert.strictEqual(pointsFor('sprint', 1), 8);
  assert.strictEqual(pointsFor('sprint', 9), 0);
  assert.strictEqual(pointsFor('qualifying', 1), 0);
});

test('joining a session in progress announces nothing, then flag changes are reported', () => {
  const engine = new SessionEngine();
  assert.deepStrictEqual(engine.ingest(snap({ track: { status: 'sc', since: 5 } }), 10).events, []);
  const { events } = engine.ingest(snap({ track: { status: 'green', since: 20 } }), 20);
  assert.deepStrictEqual(events.map((e) => [e.type, e.status, e.from]), [['track_status', 'green', 'sc']]);
});

test('archive paths are validated and URL-encoded per segment', () => {
  const p = '2026/2026-11-08_São_Paulo_Grand_Prix/2026-11-08_Race/';
  assert.ok(isArchivePath(p));
  assert.ok(!isArchivePath('../../etc/'));
  assert.ok(!isArchivePath('2026/x/'));
  assert.strictEqual(archiveUrl(p, 'SessionInfo.json'), 'https://livetiming.formula1.com/static/2026/2026-11-08_S%C3%A3o_Paulo_Grand_Prix/2026-11-08_Race/SessionInfo.json');
});
