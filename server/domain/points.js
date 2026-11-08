// Points tables and the projected championship. No fastest-lap point since 2025. Pure.

const POINTS = {
  race: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
  sprint: [8, 7, 6, 5, 4, 3, 2, 1],
};

function pointsFor(type, position) {
  const table = POINTS[type];
  if (!table || !Number.isInteger(position) || position < 1) return 0;
  return table[position - 1] ?? 0;
}

// The calendar round this session belongs to: the round whose race is within 4 days.
function roundFor(calendar, startDate) {
  const t = Date.parse(startDate);
  if (!calendar || !Number.isFinite(t)) return null;
  const match = calendar.rounds.find((r) => {
    const race = r.sessions.find((s) => s.type === 'race');
    return race && Math.abs(Date.parse(race.startsAt) - t) < 4 * 86400e3;
  });
  return match?.round ?? null;
}

const rank = (rows) => rows.sort((a, b) => b.points - a.points || a.previous - b.previous).map((r, i) => ({ ...r, position: i + 1 }));

/**
 * The championship if the race finished in the current order.
 * @param {import('./types').Standings} base  Standings from before this weekend if `baseIncludesWeekend` is false.
 * @param {import('./types').SessionSnapshot} snapshot
 * @param {{ round: number|null, extra?: {code:string, team:string, points:number}[] }} weekend
 *        `extra`: points already scored this weekend that `base` doesn't include yet (the sprint).
 */
function projectChampionship(base, snapshot, { round = null, extra = [] } = {}) {
  if (!base || !['race', 'sprint'].includes(snapshot.session.type)) return null;
  const included = round !== null && base.round >= round;
  const drivers = new Map(base.drivers.map((d) => [d.code, { code: d.code, name: d.name, team: d.team, points: d.points, previous: d.position ?? 99, gained: 0 }]));
  const add = (code, team, name, pts) => {
    if (!code) return;
    if (!drivers.has(code)) drivers.set(code, { code, name: name || code, team, points: 0, previous: 99, gained: 0 });
    const d = drivers.get(code);
    d.points += pts;
    d.gained += pts;
  };
  if (!included) {
    extra.forEach((r) => add(r.code, r.team, r.code, r.points));
    snapshot.drivers.forEach((d) => {
      if (!d.retired) add(d.code, d.team, d.name, pointsFor(snapshot.session.type, d.position));
    });
  }
  const teamOf = new Map([...drivers.values()].map((d) => [d.code, d.team]));
  const constructors = new Map(base.constructors.map((c) => [c.team, { team: c.team, points: c.points, previous: c.position ?? 99, gained: 0 }]));
  [...drivers.values()].forEach((d) => {
    if (!d.gained) return;
    const team = teamOf.get(d.code) || d.team;
    if (!constructors.has(team)) constructors.set(team, { team, points: 0, previous: 99, gained: 0 });
    const c = constructors.get(team);
    c.points += d.gained;
    c.gained += d.gained;
  });
  return { season: base.season, final: included, drivers: rank([...drivers.values()]), constructors: rank([...constructors.values()]) };
}

module.exports = { POINTS, pointsFor, roundFor, projectChampionship };
