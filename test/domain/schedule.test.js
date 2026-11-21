const test = require('node:test');
const assert = require('node:assert');
const { dueSession, nextSession, isSessionFor, scheduleAction } = require('../../server/domain/schedule');

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

// A Friday like Las Vegas 2026: FP2 starts 3.5 hours after FP1, inside FP1's 5-hour window.
const weekend = { rounds: [{ round: 21, name: 'Las Vegas Grand Prix', sessions: [
  { type: 'practice', name: 'Practice 1', startsAt: '2026-11-20T00:30:00Z' },
  { type: 'practice', name: 'Practice 2', startsAt: '2026-11-20T04:00:00Z' },
] }] };
const FP1_START = '2026-11-20T00:30:00.000Z';
const FP2_START = '2026-11-20T04:00:00.000Z';
const keyOf = (due) => `${due.round}-${due.type}-${due.at}`;

test('the feed is matched to the due session by its start time', () => {
  const fp2 = dueSession(weekend, at('2026-11-20T03:50:00Z'));
  assert.strictEqual(fp2.name, 'Practice 2');
  assert.strictEqual(isSessionFor(fp2, FP2_START), true);
  assert.strictEqual(isSessionFor(fp2, FP1_START), false);
  assert.strictEqual(isSessionFor(fp2, null), false);
  assert.strictEqual(isSessionFor(null, FP2_START), false);
});

test('still live on FP1 when FP2 is due: reconnect so FP2 gets its own recording', () => {
  const fp1 = dueSession(weekend, at('2026-11-20T01:00:00Z'));
  const fp2 = dueSession(weekend, at('2026-11-20T03:46:00Z'));
  const base = { autoLive: true, source: 'live', liveStartsAt: FP1_START };
  assert.strictEqual(scheduleAction({ ...base, due: fp1, key: keyOf(fp1), autoStarted: keyOf(fp1) }), null, 'FP1 carries on');
  assert.strictEqual(scheduleAction({ ...base, due: fp2, key: keyOf(fp2), autoStarted: keyOf(fp1) }), 'follow');
  assert.strictEqual(scheduleAction({ ...base, due: fp2, key: keyOf(fp2), autoStarted: keyOf(fp2), liveStartsAt: FP2_START }), null, 'and then stays on FP2');
});

test('live on the due session already (followed by hand): keep the connection', () => {
  const fp2 = dueSession(weekend, at('2026-11-20T04:10:00Z'));
  assert.strictEqual(scheduleAction({ due: fp2, key: keyOf(fp2), autoStarted: null, autoLive: true, source: 'live', liveStartsAt: FP2_START }), 'adopt');
  assert.strictEqual(scheduleAction({ due: fp2, key: keyOf(fp2), autoStarted: null, autoLive: false, source: 'live', liveStartsAt: FP2_START }), 'adopt');
});

test('live on the due session but not recording it (it looked finished when joined): reconnect', () => {
  const fp2 = dueSession(weekend, at('2026-11-20T03:46:00Z'));
  const live = { due: fp2, key: keyOf(fp2), autoLive: true, source: 'live', liveStartsAt: FP2_START, recording: false };
  assert.strictEqual(scheduleAction({ ...live, autoStarted: null }), 'follow');
  assert.strictEqual(scheduleAction({ ...live, autoStarted: keyOf(fp2) }), null, 'once per session, not every minute');
  assert.strictEqual(scheduleAction({ ...live, autoStarted: null, autoLive: false }), 'adopt');
});

test('replaying when a session is due follows it; automatic following off does not; the window closing lets go', () => {
  const fp2 = dueSession(weekend, at('2026-11-20T03:46:00Z'));
  assert.strictEqual(scheduleAction({ due: fp2, key: keyOf(fp2), autoStarted: null, autoLive: true, source: 'replay' }), 'follow');
  assert.strictEqual(scheduleAction({ due: fp2, key: keyOf(fp2), autoStarted: null, autoLive: false, source: 'replay' }), null);
  assert.strictEqual(scheduleAction({ due: null, key: null, autoStarted: keyOf(fp2), autoLive: true, source: 'live', liveStartsAt: FP2_START }), 'close');
  assert.strictEqual(scheduleAction({ due: null, key: null, autoStarted: null, autoLive: true, source: 'replay' }), null);
});
