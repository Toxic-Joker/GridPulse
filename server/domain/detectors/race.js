// Race and sprint moments, from consecutive snapshots. The rules are in
// docs/ARCHITECTURE.md, "Race detector rules". Pure: everything it remembers
// between snapshots lives in `memory`, which the engine owns.

// A car seen in the pits, stopped or retired this recently can't be part of an overtake:
// cars move up the order around a pit stop without passing anyone on track.
const PIT_SHADOW_MS = 10000;
const CONFIRM_SNAPSHOTS = 2;
// The feed can mark a car retired and take it back when it gets going again (LAW, 32 s,
// Las Vegas 2026), so a retirement is announced once it has held this long.
const RETIRE_CONFIRM_MS = 60000;
// With the 2026 overtake mode two cars can swap back and forth for laps (VER and NOR swapped
// the lead 34 times at Las Vegas 2026). A pass the same pair undoes within this long is one
// battle on air: the first pass as usual, the swap back as a battle, and the rest quiet
// until the pair has held station this long.
const BATTLE_MS = 30000;
const PENALTY = /\bPENALTY\b/;
const NOT_A_PENALTY = /NO FURTHER ACTION|UNDER INVESTIGATION|NOTED|REVIEWED/;

const orderOf = (s) => s.drivers.filter((d) => d.position !== null).map((d) => d.number);
const lapsDown = (d) => { const m = /^(\d+) L$/.exec(d.gapToLeader || ''); return m ? Number(m[1]) : 0; };
const byNumber = (s) => Object.fromEntries(s.drivers.map((d) => [d.number, d]));
const name = (d) => ({ number: d.number, code: d.code, driver: d.name, team: d.team, teamColour: d.teamColour });

function baseline(snapshot, memory) {
  const order = orderOf(snapshot);
  memory.confirmed = order;
  memory.candidate = order.join(',');
  memory.candidateCount = CONFIRM_SNAPSHOTS;
  memory.leader = order[0] ?? null;
  memory.rcSeen = snapshot.raceControl.length ? snapshot.raceControl.at(-1).at : 0;
  memory.pitShadow = {};
  memory.swaps = {};
  memory.lap1Done = snapshot.laps.current >= 2;
  // Cars already out when we join were announced before, or never will be.
  memory.retiredSince = {};
  memory.retiredDone = Object.fromEntries(snapshot.drivers.filter((d) => d.retired).map((d) => [d.number, true]));
  markPits(snapshot, memory);
}

function markPits(s, memory) {
  s.drivers.forEach((d) => {
    if (d.inPit || d.pitOut || d.stopped || d.retired) memory.pitShadow[d.number] = s.at;
  });
}

/** @returns {import('../types').RaceEvent[]} */
function detect(prev, s, memory) {
  const out = [];
  const at = s.at;
  const key = s.session.key;
  markPits(s, memory);
  const before = byNumber(prev);
  const now = byNumber(s);

  // Start, restart, flag.
  if (prev.status === 'pre' && s.status === 'running') out.push({ type: 'lights_out', key: `lights-${key}`, at, total: s.laps.total });
  if (prev.status === 'suspended' && s.status === 'running') out.push({ type: 'restart', key: `restart-${key}-${at}`, at, lap: s.laps.current });
  if (prev.status === 'running' && s.status === 'finished') {
    const winner = s.drivers[0];
    out.push({ type: 'chequered', key: `chequered-${key}`, at, winner: winner && name(winner), podium: s.drivers.slice(0, 3).map(name) });
  }

  // Per car: pit stops and retirements.
  s.drivers.forEach((d) => {
    const was = before[d.number];
    if (!was) return;
    if (d.pitStops > was.pitStops) out.push({ type: 'pit', key: `pit-${d.number}-${d.pitStops}`, at, ...name(d), stop: d.pitStops, lap: s.laps.current, position: d.position });
  });
  s.drivers.forEach((d) => {
    if (!d.retired) { delete memory.retiredSince[d.number]; return; }
    // A car marked out once the race is over finished it (ALO, lapped, Las Vegas 2026).
    if (!memory.retiredSince[d.number] && !['running', 'suspended'].includes(s.status)) return;
    const since = memory.retiredSince[d.number] ??= { at, lap: s.laps.current };
    if (!memory.retiredDone[d.number] && at - since.at >= RETIRE_CONFIRM_MS) {
      memory.retiredDone[d.number] = true;
      out.push({ type: 'retirement', key: `ret-${d.number}`, at, ...name(d), lap: since.lap });
    }
  });

  // Fastest lap of the race. Cars still finish their last lap after the leader takes the flag,
  // and that lap can be the fastest (SAI at Silverstone 2024), so it counts until Finalised.
  const fl = s.fastestLap;
  if (fl && ['running', 'finished'].includes(s.status) && (!prev.fastestLap || prev.fastestLap.time !== fl.time || prev.fastestLap.number !== fl.number) && now[fl.number]) {
    out.push({ type: 'fastest_lap', key: `fl-${fl.number}-${fl.time}`, at, ...name(now[fl.number]), time: fl.time, lap: fl.lap });
  }

  // Penalties from race control, each message once.
  s.raceControl.filter((m) => m.at !== null && m.at > memory.rcSeen).forEach((m) => {
    if (PENALTY.test(m.message) && !NOT_A_PENALTY.test(m.message)) {
      const car = m.number ? now[m.number] : s.drivers.find((d) => new RegExp(`CAR ${d.number}\\b`).test(m.message));
      out.push({ type: 'penalty', key: `penalty-${m.at}-${m.message.length}`, at, text: m.message, ...(car ? name(car) : {}) });
    }
  });
  if (s.raceControl.length) memory.rcSeen = Math.max(memory.rcSeen, s.raceControl.at(-1).at ?? 0);

  // Order changes, confirmed over consecutive snapshots so a flicker is never announced.
  const order = orderOf(s);
  const orderKey = order.join(',');
  if (orderKey === memory.candidate) memory.candidateCount += 1;
  else { memory.candidate = orderKey; memory.candidateCount = 1; }
  if (memory.candidateCount === CONFIRM_SNAPSHOTS && orderKey !== memory.confirmed.join(',')) {
    out.push(...orderEvents(memory.confirmed, order, s, now, memory, at));
    memory.confirmed = order;
  }

  // Lap 1 summary once the leader starts lap 2.
  if (!memory.lap1Done && s.status === 'running' && s.laps.current >= 2) {
    memory.lap1Done = true;
    const moves = s.drivers.filter((d) => !d.retired && d.gridPosition && d.position)
      .map((d) => ({ ...name(d), from: d.gridPosition, to: d.position, change: d.gridPosition - d.position }));
    out.push({
      type: 'lap1_summary', key: `lap1-${key}`, at,
      gains: moves.filter((m) => m.change > 0).sort((a, b) => b.change - a.change).slice(0, 3),
      losses: moves.filter((m) => m.change < 0).sort((a, b) => a.change - b.change).slice(0, 3),
    });
  }
  return out;
}

function orderEvents(oldOrder, newOrder, s, now, memory, at) {
  const out = [];
  const racing = s.status === 'running' && ['green', 'yellow'].includes(s.track.status);
  const oldIndex = Object.fromEntries(oldOrder.map((n, i) => [n, i]));

  // One verdict per pair per order change, so a pass for the lead and the new leader it makes
  // tell the same story: 'new' (announce), 'battle' (the swap back), or 'quiet'.
  const verdicts = {};
  const swap = (a, b) => {
    const pair = [a, b].sort().join('-');
    if (verdicts[pair]) return { ...verdicts[pair], first: false };
    const last = memory.swaps[pair];
    const verdict = last && at - last.at < BATTLE_MS ? (last.battle ? 'quiet' : 'battle') : 'new';
    memory.swaps[pair] = { at, battle: verdict !== 'new' };
    verdicts[pair] = { verdict, pair };
    return { verdict, pair, first: true };
  };
  const battle = (a, b, pair, forPosition) => ({ type: 'battle', key: `battle-${pair}-${at}`, at, ...name(now[a]), on: name(now[b]), forPosition });

  // A new leader is news however it happened, once the race is under way.
  if (newOrder[0] && newOrder[0] !== memory.leader && s.status === 'running') {
    const leader = now[newOrder[0]];
    const previous = memory.leader && now[memory.leader] ? memory.leader : null;
    const { verdict, pair } = previous ? swap(newOrder[0], previous) : { verdict: 'new' };
    if (memory.leader !== null && leader) {
      if (verdict === 'new') out.push({ type: 'new_leader', key: `leader-${leader.number}-${at}`, at, ...name(leader), lap: s.laps.current, previous: previous ? name(now[previous]) : null });
      else if (verdict === 'battle') out.push(battle(newOrder[0], previous, pair, 1));
    }
    memory.leader = newOrder[0];
  }

  if (!racing || s.laps.current < 2) return out;
  const clean = (n) => {
    const d = now[n];
    return d && !d.inPit && !d.pitOut && !d.retired && !d.stopped && !(at - (memory.pitShadow[n] ?? -Infinity) < PIT_SHADOW_MS);
  };
  newOrder.forEach((a, i) => {
    if (!clean(a) || oldIndex[a] === undefined) return;
    newOrder.slice(i + 1).forEach((b) => {
      if (!clean(b) || oldIndex[b] === undefined) return;
      if (oldIndex[a] > oldIndex[b] && lapsDown(now[a]) === lapsDown(now[b])) {
        const { verdict, pair, first } = swap(a, b);
        // A pass for the lead already has its New leader banner, so the pass itself goes to the ticker.
        const quiet = out.some((e) => e.type === 'new_leader' && e.number === a) ? { quiet: true } : {};
        if (verdict === 'new') out.push({ type: 'overtake', key: `pass-${a}-${b}-${at}`, at, ...name(now[a]), on: name(now[b]), forPosition: now[a].position, ...quiet });
        else if (verdict === 'battle' && first) out.push(battle(a, b, pair, now[a].position));
      }
    });
  });
  return out;
}

module.exports = { baseline, detect, PIT_SHADOW_MS, BATTLE_MS };
