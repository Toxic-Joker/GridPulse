const test = require('node:test');
const assert = require('node:assert');
const { generateSession, ENTRIES } = require('../../server/providers/rehearsalQualifying');
const { TimingState } = require('../../server/domain/state');
const { normalizeSession } = require('../../server/domain/normalize');
const { SessionEngine } = require('../../server/domain/engine');

function play(kind) {
  const lines = generateSession(kind);
  const state = new TimingState();
  const engine = new SessionEngine();
  const events = [];
  let outLapsPastSector1 = 0;
  let next = lines[0].at;
  lines.forEach((l) => {
    if (l.kind === 'truth') return;
    state.apply(l.kind === 'state' ? { topic: '*', data: l.data, at: l.at } : { topic: l.topic, data: l.data, at: l.at });
    while (l.at >= next) {
      const snapshot = normalizeSession(state.topics, state.segmentAt, next, { outLap: state.outLap });
      outLapsPastSector1 += snapshot.drivers.filter((d) => d.run === 'out' && !d.pitOut).length;
      events.push(...engine.ingest(snapshot, next).events);
      next += 250;
    }
  });
  return { lines, events, outLapsPastSector1, final: normalizeSession(state.topics, state.segmentAt, lines.at(-1).at) };
}

const quali = play('qualifying');
const practice = play('practice');
const ofType = (events, t) => events.filter((e) => e.type === t);

test('qualifying is read as Q1, Q2, Q3 with the cut after the last safe place', () => {
  const s = quali.final;
  assert.strictEqual(s.session.type, 'qualifying');
  assert.strictEqual(s.session.part, 3);
  assert.deepStrictEqual(s.qualifying, { part: 3, entries: ENTRIES, cut: null });
  assert.strictEqual(s.drivers.filter((d) => d.knockedOut).length, 12);
  assert.ok(s.drivers.slice(0, 10).every((d) => !d.knockedOut && d.bestLaps.length === 3 && d.partBest));
  assert.ok(s.drivers.slice(10).every((d) => d.knockedOut), 'the knocked-out cars are at the bottom');
});

test('six cars go out in Q1 and six in Q2, reported as one moment per part', () => {
  const moments = ofType(quali.events, 'knockouts');
  assert.deepStrictEqual(moments.map((e) => [e.part, e.cars.length]), [[1, 6], [2, 6]]);
  const ko = moments.flatMap((e) => e.cars);
  assert.deepStrictEqual(ko.filter((e) => e.part === 1).map((e) => e.position).sort((a, b) => a - b), [17, 18, 19, 20, 21, 22]);
  assert.deepStrictEqual(ko.filter((e) => e.part === 2).map((e) => e.position).sort((a, b) => a - b), [11, 12, 13, 14, 15, 16]);
  assert.deepStrictEqual(ofType(quali.events, 'quali_part').map((e) => [e.part, e.cut]), [[2, 10], [3, null]]);
});

test('pole goes to the fastest car in Q3, and only Q3 times count as pole', () => {
  const fastest = ofType(quali.events, 'session_fastest');
  const poles = fastest.filter((e) => e.pole);
  assert.ok(poles.length >= 1);
  assert.ok(poles.every((e) => e.part === 3));
  assert.strictEqual(poles.at(-1).code, quali.final.drivers[0].code);
  assert.strictEqual(poles.at(-1).time, quali.final.drivers[0].partBest);
});

test('escaping the drop zone needs an improved lap, not a first one, and names who drops in', () => {
  const escapes = ofType(quali.events, 'escape');
  assert.ok(escapes.length >= 1, 'the rehearsal has at least one escape');
  escapes.forEach((e) => {
    const cut = ENTRIES[e.part];
    assert.ok(e.position <= cut, `${e.code} escaped to P${e.position}`);
    assert.ok(e.pushed && e.pushed.code !== e.code);
  });
});

test('a deleted lap is reported, and a deleted lap never becomes a best', () => {
  const deleted = ofType(quali.events, 'lap_deleted');
  assert.strictEqual(deleted.length, 1);
  assert.ok(deleted[0].code);
  assert.match(deleted[0].text, /DELETED - TRACK LIMITS/);
});

test('practice orders by best lap and reports new fastest times without knockouts', () => {
  const s = practice.final;
  assert.strictEqual(s.session.type, 'practice');
  assert.strictEqual(s.qualifying, null);
  assert.strictEqual(s.drivers[0].gapToFastest, '');
  assert.ok(s.drivers.slice(1).every((d) => /^\+\d+\.\d{3}$/.test(d.gapToFastest)));
  assert.ok(ofType(practice.events, 'session_fastest').length >= 1);
  assert.ok(ofType(practice.events, 'session_fastest').every((e) => !e.pole));
  assert.strictEqual(ofType(practice.events, 'knockouts').length, 0);
  assert.strictEqual(ofType(practice.events, 'overtake').length, 0, 'no race moments in practice');
});

test('cars stay on their out lap after PitOut clears, as in the real feed', () => {
  assert.ok(quali.outLapsPastSector1 > 0);
  assert.ok(practice.outLapsPastSector1 > 0);
});
