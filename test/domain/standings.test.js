const test = require('node:test');
const assert = require('node:assert');
const { projectChampionship, roundFor } = require('../../server/domain/points');
const { normalizeCalendar, normalizeStandings, normalizeSprint } = require('../../server/providers/jolpica');
const { rehearsalStandings } = require('../../server/providers/rehearsal');

const base = {
  season: 2026, round: 9,
  drivers: [
    { code: 'AAA', name: 'Al A', team: 'Red', points: 100, position: 1 },
    { code: 'BBB', name: 'Bo B', team: 'Blue', points: 90, position: 2 },
    { code: 'CCC', name: 'Cy C', team: 'Red', points: 80, position: 3 },
  ],
  constructors: [{ team: 'Red', points: 180, position: 1 }, { team: 'Blue', points: 90, position: 2 }],
};
const snap = (type, order, retired = []) => ({
  session: { type },
  drivers: order.map((code, i) => ({ code, name: code, team: 'X', position: i + 1, retired: retired.includes(code) })),
});

test('the projection adds this race\'s points in the current order', () => {
  const p = projectChampionship(base, snap('race', ['BBB', 'CCC', 'AAA']), { round: 10 });
  // Level on points, the previous standings decide.
  assert.deepStrictEqual(p.drivers.map((d) => [d.code, d.points, d.gained, d.position, d.previous]), [
    ['AAA', 115, 15, 1, 1], ['BBB', 115, 25, 2, 2], ['CCC', 98, 18, 3, 3],
  ]);
  assert.deepStrictEqual(p.constructors.map((c) => [c.team, c.points]), [['Red', 213], ['Blue', 115]]);
  assert.strictEqual(p.final, false);
});

test('sprint points and a sprint already run this weekend are counted', () => {
  const sprint = projectChampionship(base, snap('sprint', ['CCC', 'AAA', 'BBB']), { round: 10 });
  assert.deepStrictEqual(sprint.drivers.map((d) => [d.code, d.gained]), [['AAA', 7], ['BBB', 6], ['CCC', 8]]);
  const race = projectChampionship(base, snap('race', ['AAA', 'BBB', 'CCC']), { round: 10, extra: [{ code: 'CCC', team: 'Red', points: 8 }] });
  assert.strictEqual(race.drivers.find((d) => d.code === 'CCC').gained, 15 + 8);
});

test('standings that already include this weekend are not counted twice', () => {
  const p = projectChampionship({ ...base, round: 10 }, snap('race', ['CCC', 'BBB', 'AAA']), { round: 10 });
  assert.deepStrictEqual(p.drivers.map((d) => [d.code, d.points]), [['AAA', 100], ['BBB', 90], ['CCC', 80]]);
  assert.strictEqual(p.final, true);
});

test('retired cars score nothing, new drivers appear, and other sessions have no projection', () => {
  const p = projectChampionship(base, snap('race', ['NEW', 'AAA', 'BBB'], ['AAA']), { round: 10 });
  assert.strictEqual(p.drivers.find((d) => d.code === 'AAA').gained, 0);
  assert.strictEqual(p.drivers.find((d) => d.code === 'NEW').points, 25);
  assert.strictEqual(projectChampionship(base, snap('qualifying', ['AAA']), { round: 10 }), null);
  assert.strictEqual(projectChampionship(null, snap('race', ['AAA'])), null);
});

const jolpicaCalendar = { MRData: { RaceTable: { season: '2026', Races: [
  { round: '2', raceName: 'Test Grand Prix', Circuit: { circuitId: 'test', Location: { country: 'Testland' } }, date: '2026-03-15', time: '07:00:00Z',
    FirstPractice: { date: '2026-03-13', time: '03:30:00Z' }, SprintQualifying: { date: '2026-03-13', time: '07:30:00Z' }, Sprint: { date: '2026-03-14', time: '03:00:00Z' }, Qualifying: { date: '2026-03-14', time: '07:00:00Z' } },
] } } };

test('the calendar lists every session in order, and a session finds its round', () => {
  const calendar = normalizeCalendar(jolpicaCalendar);
  assert.deepStrictEqual(calendar.rounds[0].sessions.map((s) => s.type), ['practice', 'sprint_qualifying', 'sprint', 'qualifying', 'race']);
  assert.strictEqual(roundFor(calendar, '2026-03-14T03:00:00Z'), 2);
  assert.strictEqual(roundFor(calendar, '2026-05-01T00:00:00Z'), null);
});

test('standings and sprint results are read from Jolpica\'s shapes', () => {
  const s = normalizeStandings(
    { MRData: { StandingsTable: { StandingsLists: [{ season: '2026', round: '20', DriverStandings: [{ position: '1', points: '390', Driver: { code: 'ANT', givenName: 'Andrea Kimi', familyName: 'Antonelli' }, Constructors: [{ name: 'Mercedes' }] }] }] } } },
    { MRData: { StandingsTable: { StandingsLists: [{ ConstructorStandings: [{ position: '1', points: '652', Constructor: { name: 'Mercedes' } }] }] } } },
  );
  assert.deepStrictEqual(s, { season: 2026, round: 20, drivers: [{ code: 'ANT', name: 'Andrea Kimi Antonelli', team: 'Mercedes', points: 390, position: 1 }], constructors: [{ team: 'Mercedes', points: 652, position: 1 }] });
  assert.deepStrictEqual(normalizeSprint({ MRData: { RaceTable: { Races: [{ SprintResults: [{ points: '8', Driver: { code: 'ANT' }, Constructor: { name: 'Mercedes' } }] }] } } }), [{ code: 'ANT', team: 'Mercedes', points: 8 }]);
});

test('the rehearsal season has standings for all 22 fictional drivers', () => {
  const s = rehearsalStandings();
  assert.strictEqual(s.drivers.length, 22);
  assert.strictEqual(s.constructors.length, 11);
  assert.ok(s.drivers.every((d, i) => i === 0 || d.points <= s.drivers[i - 1].points));
});
