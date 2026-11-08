// Qualifying and practice moments, from consecutive snapshots. Pure; what it remembers
// lives in `memory`. Built from community knowledge of the feed (SessionPart, NoEntries,
// BestLapTimes, KnockedOut); to be checked against a real recording (Las Vegas, Nov 2026).
//
// Qualifying: a new part starts, the fastest time of the part (provisional pole in the
// final part), a driver knocked out, a driver lapping out of the drop zone, a deleted lap.
// Practice: the fastest time of the session, a deleted lap.

const DELETED = /\bDELETED\b/;
const KO_GATHER_MS = 1500;
const byNumber = (s) => Object.fromEntries(s.drivers.map((d) => [d.number, d]));
const name = (d) => ({ number: d.number, code: d.code, driver: d.name, team: d.team, teamColour: d.teamColour });
const fastestOf = (s) => s.drivers.find((d) => d.partBest && !d.knockedOut) ?? null;

function baseline(snapshot, memory) {
  memory.part = snapshot.session.part;
  memory.fastest = fastestOf(snapshot)?.partBest ?? null;
  memory.rcSeen = snapshot.raceControl.length ? snapshot.raceControl.at(-1).at : 0;
}

function lapDeletions(s, now, memory, at) {
  const out = [];
  s.raceControl.filter((m) => m.at !== null && m.at > memory.rcSeen).forEach((m) => {
    if (!DELETED.test(m.message)) return;
    const car = s.drivers.find((d) => new RegExp(`CAR ${d.number}\\b`).test(m.message));
    out.push({ type: 'lap_deleted', key: `deleted-${m.at}-${m.message.length}`, at, text: m.message, ...(car ? name(car) : {}) });
  });
  if (s.raceControl.length) memory.rcSeen = Math.max(memory.rcSeen, s.raceControl.at(-1).at ?? 0);
  return out;
}

/** @returns {import('../types').RaceEvent[]} */
function detect(prev, s, memory) {
  const out = [];
  const at = s.at;
  const key = s.session.key;
  const now = byNumber(s);
  const before = byNumber(prev);
  const q = s.qualifying;
  const finalPart = q && q.part === q.entries.length;

  // A new part of qualifying: the fastest time starts again from nothing.
  if (q && s.session.part && s.session.part !== memory.part) {
    memory.part = s.session.part;
    memory.fastest = null;
    out.push({ type: 'quali_part', key: `part-${key}-${s.session.part}`, at, part: s.session.part, cut: q.cut });
  }

  // Fastest time of the part or session.
  const top = fastestOf(s);
  if (top && top.partBest !== memory.fastest && s.status === 'running') {
    memory.fastest = top.partBest;
    out.push({ type: 'session_fastest', key: `fastest-${key}-${s.session.part ?? 0}-${top.number}-${top.partBest}`, at, ...name(top), time: top.partBest, part: s.session.part, pole: Boolean(finalPart) });
  }

  if (q) {
    const knocked = [];
    s.drivers.forEach((d) => {
      const was = before[d.number];
      if (!was) return;
      // The part a car went out in follows from where it finished: below the Q2 cut is a Q1 exit.
      // (The feed may only flag it once the next part has begun.)
      if (d.knockedOut && !was.knockedOut) {
        const outIn = q.entries.findIndex((n, i) => i > 0 && d.position > n && (i === q.entries.length - 1 || d.position <= q.entries[i - 1]));
        knocked.push({ ...name(d), position: d.position, part: outIn > 0 ? outIn : q.part });
      }
      // Out of the drop zone with a better lap: the moment a qualifying stream lives for.
      // A car's first time of the part doesn't count: untimed cars all start below the cut.
      if (q.cut && !d.knockedOut && was.partBest && was.position > q.cut && d.position <= q.cut && d.partBest !== was.partBest && d.partBest) {
        const pushed = s.drivers.find((x) => x.position === q.cut + 1 && !x.knockedOut);
        out.push({ type: 'escape', key: `escape-${key}-${q.part}-${d.number}-${d.partBest}`, at, ...name(d), position: d.position, part: q.part, pushed: pushed ? name(pushed) : null });
      }
    });
    // Cars go out together at the end of a part: one moment, not six banners. The flags can
    // arrive over a few messages, so they are gathered for a moment before going on air.
    if (knocked.length) {
      memory.koPending ||= { since: at, cars: [] };
      memory.koPending.cars.push(...knocked);
    }
    if (memory.koPending && at - memory.koPending.since >= KO_GATHER_MS) {
      const cars = memory.koPending.cars.sort((a, b) => a.position - b.position);
      memory.koPending = null;
      out.push({ type: 'knockouts', key: `ko-${key}-${cars.map((k) => k.number).join('-')}`, at, part: cars[0].part, cars });
    }
  }

  out.push(...lapDeletions(s, now, memory, at));
  return out;
}

module.exports = { baseline, detect };
