// Points tables and the projected championship. No fastest-lap point since 2025.

const POINTS = {
  race: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
  sprint: [8, 7, 6, 5, 4, 3, 2, 1],
};

function pointsFor(type, position) {
  const table = POINTS[type];
  if (!table || !Number.isInteger(position) || position < 1) return 0;
  return table[position - 1] ?? 0;
}

// TODO(standings): projectChampionship(baseStandings, snapshot, extraResults) — base is Jolpica standings
//   before this round plus this weekend's sprint if Jolpica hasn't added it yet.

module.exports = { POINTS, pointsFor };
