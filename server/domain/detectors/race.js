// Race and sprint moments. The rules are in docs/ARCHITECTURE.md, "Race detector rules".

// TODO(race mode): lights_out, overtake (green/yellow only, lap >= 2, no pit or retired cars,
//   same lap, holds for 2 snapshots, never after the flag), new_leader, pit, fastest_lap,
//   penalty, retirement, lap1_summary, restart, chequered.
// TODO(race mode): overtake rate limit (one banner per 5 s) belongs in feed.js, not here.

function baseline(snapshot, memory) {
  memory.lastOrder = snapshot.drivers.map((d) => d.number);
}

/** @returns {import('../types').RaceEvent[]} */
function detect(prev, snapshot, memory) {
  return [];
}

module.exports = { baseline, detect };
