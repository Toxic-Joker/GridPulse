const test = require('node:test');
const assert = require('node:assert');
const { dueSession, nextSession } = require('../../server/domain/schedule');

const calendar = { rounds: [{ round: 21, name: 'Las Vegas Grand Prix', sessions: [
  { type: 'qualifying', name: 'Qualifying', startsAt: '2026-11-21T04:00:00Z' },
  { type: 'race', name: 'Race', startsAt: '2026-11-22T04:00:00Z' },
] }] };
const at = (iso) => Date.parse(iso);

test('a session is due from 15 minutes before its start until 5 hours after', () => {
  assert.strictEqual(dueSession(calendar, at('2026-11-21T03:44:00Z')), null);
  assert.strictEqual(dueSession(calendar, at('2026-11-21T03:46:00Z')).name, 'Qualifying');
  assert.strictEqual(dueSession(calendar, at('2026-11-21T08:59:00Z')).name, 'Qualifying');
  assert.strictEqual(dueSession(calendar, at('2026-11-21T09:01:00Z')), null);
});

test('the next session is the first one still to start', () => {
  assert.strictEqual(nextSession(calendar, at('2026-11-20T00:00:00Z')).name, 'Qualifying');
  assert.strictEqual(nextSession(calendar, at('2026-11-21T05:00:00Z')).meeting, 'Las Vegas Grand Prix');
  assert.strictEqual(nextSession(calendar, at('2026-11-23T00:00:00Z')), null);
  assert.strictEqual(nextSession(null, 0), null);
});
